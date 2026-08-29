import { Connection, PublicKey } from "@solana/web3.js";
import type { ClaimView, ClaimsReader } from "./container";

function u64(buffer:Buffer,offset:number):bigint{return buffer.readBigUInt64LE(offset)}
function i64(buffer:Buffer,offset:number):bigint{return buffer.readBigInt64LE(offset)}
function key(buffer:Buffer,offset:number):string{return new PublicKey(buffer.subarray(offset,offset+32)).toBase58()}
function vested(total:bigint,kind:number,start:number,cliff:number,duration:number,tranches:Array<{offset:number;bps:number}>):bigint{
  const elapsed=Math.max(0,Math.floor(Date.now()/1000)-start);if(kind===0){if(elapsed<cliff)return 0n;if(elapsed>=duration)return total;return total*BigInt(elapsed)/BigInt(duration)}let bps=0;for(const tranche of tranches)if(elapsed>=tranche.offset)bps+=tranche.bps;return total*BigInt(bps)/10_000n
}

export class SolanaVestingClaimsReader implements ClaimsReader{
  constructor(private readonly connection:Connection,private readonly vestingProgramId:PublicKey){}
  async list(wallet:string,chain:"solana"|"sui"):Promise<ClaimView[]>{
    if(chain!=="solana")throw new Error("Sui claims reader is not configured on this host.");const beneficiary=new PublicKey(wallet);
    const accounts=await this.connection.getProgramAccounts(this.vestingProgramId,{commitment:"confirmed",filters:[{memcmp:{offset:40,bytes:beneficiary.toBase58()}}]});
    return accounts.map(({pubkey,account})=>{
      const data=Buffer.from(account.data);let o=8;o+=32;const beneficiaryKey=key(data,o);o+=32;const mint=key(data,o);o+=32;o+=32;o+=32;const kind=data.readUInt8(o);o+=1;const start=Number(i64(data,o));o+=8;const cliff=Number(u64(data,o));o+=8;const duration=Number(u64(data,o));o+=8;o+=8;const total=u64(data,o);o+=8;const claimed=u64(data,o);o+=8;const count=data.readUInt32LE(o);o+=4;const tranches:Array<{offset:number;bps:number}>=[];for(let i=0;i<count;i++){tranches.push({offset:Number(u64(data,o)),bps:data.readUInt16LE(o+8)});o+=10}const vestedTotal=vested(total,kind,start,cliff,duration,tranches);const claimable=vestedTotal>claimed?vestedTotal-claimed:0n;
      return {chain:"solana",vestingAddress:pubkey.toBase58(),token:mint,totalAtomic:total.toString(),claimedAtomic:claimed.toString(),claimableAtomic:claimable.toString(),schedule:kind===0?`Linear · cliff ${cliff}s · duration ${duration}s`:`Progressive · ${count} tranches`};
    }).filter((claim)=>claim.vestingAddress&&beneficiaryKey===beneficiary.toBase58());
  }
}
