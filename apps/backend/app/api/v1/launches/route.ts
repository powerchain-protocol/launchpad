import { handleApi, handleOptions } from "@/lib/http/handler";
import { readJsonBodyLimited } from "@/lib/http/json";
import { getLaunchService } from "@/lib/launches/container";
import type { LaunchDraft } from "@powerchain/launchpad-domain/launch";
export const dynamic="force-dynamic";
export function OPTIONS(request:Request){return handleOptions(request)}
export async function POST(request:Request){return handleApi(request,async({request})=>getLaunchService().create(await readJsonBodyLimited<LaunchDraft>(request)),{rateLimit:{limit:30,windowSeconds:60}})}
