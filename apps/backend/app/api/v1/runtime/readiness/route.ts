import { handleApi, handleOptions } from "@/lib/http/handler";import { getRuntimeReadiness } from "@/lib/checkout/readiness-service";
export const dynamic="force-dynamic";export function OPTIONS(request:Request){return handleOptions(request)}export async function GET(request:Request){return handleApi(request,async()=>getRuntimeReadiness(),{rateLimit:{limit:120,windowSeconds:60}})}
