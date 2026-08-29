import { handleApi, handleOptions } from "@/lib/http/handler";import { getLaunchService } from "@/lib/launches/container";
export const dynamic="force-dynamic";export function OPTIONS(request:Request){return handleOptions(request)}
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return handleApi(request,async()=>getLaunchService().get((await context.params).id),{rateLimit:{limit:120,windowSeconds:60}})}
