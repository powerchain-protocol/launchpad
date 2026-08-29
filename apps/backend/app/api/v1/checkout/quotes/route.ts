import { handleApi, handleOptions } from "@/lib/http/handler";import { readJsonBodyLimited } from "@/lib/http/json";import { createCheckoutQuote,type CheckoutQuoteRequest } from "@/lib/checkout/service";
export const dynamic="force-dynamic";export function OPTIONS(request:Request){return handleOptions(request)}
export async function POST(request:Request){return handleApi(request,async({request})=>createCheckoutQuote(await readJsonBodyLimited<CheckoutQuoteRequest>(request)),{rateLimit:{limit:30,windowSeconds:60}})}
