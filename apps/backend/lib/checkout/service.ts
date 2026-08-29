import { Connection } from "@solana/web3.js";
import { AppError } from "@powerchain/launchpad-shared";
import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import { assertBoundQuoteUsable, type BoundCheckoutQuote } from "@powerchain/launchpad-domain/checkout";
import { bindCheckoutQuote } from "./quote-binding";
import { buildCheckoutIntent } from "./intent-service";
import { getQuotePricing } from "./pricing";
import { getCheckoutRepository } from "./container";
import { getRuntimeReadiness } from "./readiness-service";
import { assertLiveExecutionReady, decimalToAtomic, feeAtomic } from "./payment-preparation";
import { serializeSolanaPaymentPlan } from "./solana-payment-rail";
import { hashRealtimeToken, signRealtimeToken } from "@powerchain/launchpad-server/realtime-token";

export interface CheckoutQuoteRequest { chain:"solana";network:"devnet"|"mainnet-beta";wallet:string;paymentAsset:"SOL"|"USDC";paymentAmount:string }
export interface CheckoutQuoteView extends BoundCheckoutQuote { priceSource:string }
export interface PreparedOrderView { orderId:string;transactionBase64:string;lastValidBlockHeight:number;quoteHash:string;intentHash:string;realtime?:{url:string;token:string;topic:string;expiresAt:string} }

function requireAddress(value:string|undefined,name:string):string{if(!value?.trim())throw new AppError("SERVICE_UNAVAILABLE",`${name} is not configured.`,503);return value}

export async function createCheckoutQuote(input:CheckoutQuoteRequest):Promise<CheckoutQuoteView>{
  const config=loadRuntimeConfig();const report=getRuntimeReadiness();assertLiveExecutionReady(report,"solana");
  const expectedNetwork=config.solana.network==="mainnet-beta"?"mainnet-beta":"devnet";if(input.network!==expectedNetwork)throw new AppError("BAD_REQUEST","Requested network does not match the server settlement network.",400);
  const wallet=requireAddress(input.wallet,"Wallet");const treasury=requireAddress(config.solana.treasury,"PowerChain treasury");const receiveMint=requireAddress(config.solana.pwrcMint,"PWRC mint");const feeRecipient=requireAddress(config.solana.serviceFeeRecipient,"Service fee recipient");
  const decimals=input.paymentAsset==="SOL"?9:6;const paymentAmountAtomic=decimalToAtomic(input.paymentAmount,decimals);const serviceFeeAtomic=feeAtomic(paymentAmountAtomic,config.checkout.serviceFeeBps);
  const priced=await getQuotePricing().quote({chain:"solana",network:expectedNetwork,paymentAsset:input.paymentAsset,paymentAmountAtomic,receiveMintOrType:receiveMint});
  const issuedAt=new Date();const expiresAt=new Date(issuedAt.getTime()+config.checkout.quoteTtlSeconds*1000);
  const bound=bindCheckoutQuote({version:1,quoteId:crypto.randomUUID(),chain:"solana",network:expectedNetwork,wallet,paymentAsset:input.paymentAsset,paymentAmountAtomic,receiveMintOrType:receiveMint,receiveAmountAtomic:priced.receiveAmountAtomic,treasuryAddress:treasury,serviceFeeAtomic,nonce:crypto.randomUUID(),issuedAt:issuedAt.toISOString(),expiresAt:expiresAt.toISOString()});
  await getCheckoutRepository().insertQuote({...bound,serviceFeeRecipient:feeRecipient,priceSource:priced.source});return {...bound,priceSource:priced.source};
}

async function realtimeSession(orderId:string):Promise<PreparedOrderView["realtime"]>{
  const config=loadRuntimeConfig();if(!config.realtime.publicUrl||!config.realtime.tokenSecret)return undefined;const now=Math.floor(Date.now()/1000);const claims={sub:orderId,topics:[`checkout:${orderId}`],iat:now,exp:now+120,jti:crypto.randomUUID()};const token=signRealtimeToken(claims,config.realtime.tokenSecret);const expiresAt=new Date(claims.exp*1000).toISOString();await getCheckoutRepository().insertRealtimeSession({jti:claims.jti,subject:orderId,topics:claims.topics,tokenHash:hashRealtimeToken(token),expiresAt,createdAt:new Date().toISOString()});return {url:config.realtime.publicUrl,token,topic:claims.topics[0]!,expiresAt};
}

export async function createCheckoutOrder(input:{quoteId:string;quoteHash:string;wallet:string;idempotencyKey:string}):Promise<PreparedOrderView>{
  const repo=getCheckoutRepository();const existing=await repo.getPreparedByIdempotencyKey(input.idempotencyKey);if(existing?.transactionBase64&&existing.lastValidBlockHeight){const realtime=await realtimeSession(existing.orderId);return {orderId:existing.orderId,transactionBase64:existing.transactionBase64,lastValidBlockHeight:existing.lastValidBlockHeight,quoteHash:existing.quoteHash,intentHash:existing.intentHash,...(realtime?{realtime}:{})}}
  const quote=await repo.getQuote(input.quoteId);if(!quote)throw new AppError("NOT_FOUND","Checkout quote not found.",404);if(quote.quoteHash!==input.quoteHash)throw new AppError("CONFLICT","Quote hash mismatch.",409);assertBoundQuoteUsable(quote,{wallet:input.wallet,chain:"solana",network:quote.network,paymentAsset:quote.paymentAsset});
  const config=loadRuntimeConfig();const rpc=config.solana.rpcUrls[0];if(!rpc)throw new AppError("SERVICE_UNAVAILABLE","Solana RPC is not configured.",503);const orderId=crypto.randomUUID();const plan=await serializeSolanaPaymentPlan({connection:new Connection(rpc,{commitment:"confirmed"}),quote,serviceFeeRecipient:quote.serviceFeeRecipient,...(config.solana.usdcMint?{usdcMint:config.solana.usdcMint}:{})});const intent=buildCheckoutIntent({orderId,quote,transfers:plan.transfers});
  await repo.createPreparedOrder({orderId,idempotencyKey:input.idempotencyKey,quoteId:quote.quoteId,quoteHash:quote.quoteHash,wallet:quote.wallet,chain:"solana",network:quote.network,state:"AWAITING_SIGNATURE",intentHash:intent.intentHash,transactionBase64:plan.transactionBase64,lastValidBlockHeight:plan.lastValidBlockHeight},intent);
  const realtime=await realtimeSession(orderId);return {orderId,transactionBase64:plan.transactionBase64,lastValidBlockHeight:plan.lastValidBlockHeight,quoteHash:quote.quoteHash,intentHash:intent.intentHash,...(realtime?{realtime}:{})};
}
