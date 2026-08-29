import { AppError, type ApiFailure, type ApiSuccess, DEFAULT_REQUEST_BODY_LIMIT_BYTES } from "@powerchain/launchpad-shared";
import { loadRuntimeConfig } from "@powerchain/launchpad-config";
import { assertDeclaredBodySize } from "./json";
import { getRequestId } from "./request-id";
import { enforceRateLimit, getRateLimitStore } from "./rate-limit";

export interface ApiHandlerContext{request:Request;requestId:string}
export interface HandleApiOptions{status?:number;rateLimit?:{limit:number;windowSeconds:number;key?:string};maxBodyBytes?:number}
export interface ApiResponse<T>{__apiResponse:true;status:number;data:T;headers?:HeadersInit}
export function apiResponse<T>(data:T,status=200,headers?:HeadersInit):ApiResponse<T>{return {__apiResponse:true,status,data,...(headers?{headers}:{})}}

function corsHeaders(request:Request):Headers{
  const headers=new Headers();const origin=request.headers.get("origin");const allowed=loadRuntimeConfig().cors.allowedOrigins;
  if(origin&&allowed.includes(origin)){headers.set("Access-Control-Allow-Origin",origin);headers.set("Vary","Origin")}
  headers.set("Access-Control-Allow-Methods","GET,POST,PUT,PATCH,DELETE,OPTIONS");headers.set("Access-Control-Allow-Headers","Content-Type,Authorization,Idempotency-Key,X-Request-Id");headers.set("Access-Control-Max-Age","600");return headers;
}
function baseHeaders(request:Request,requestId:string):Headers{const headers=corsHeaders(request);headers.set("X-Request-Id",requestId);headers.set("Cache-Control","no-store");headers.set("X-Content-Type-Options","nosniff");headers.set("Referrer-Policy","no-referrer");return headers}
function clientKey(request:Request):string{return request.headers.get("cf-connecting-ip")??request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??"unknown"}
function json(body:unknown,status:number,headers:Headers):Response{headers.set("Content-Type","application/json; charset=utf-8");return new Response(JSON.stringify(body),{status,headers})}

export async function handleApi<T>(request:Request,handler:(context:ApiHandlerContext)=>Promise<T|ApiResponse<T>>,options:HandleApiOptions={}):Promise<Response>{
  const requestId=getRequestId(request);const headers=baseHeaders(request,requestId);
  try{
    assertDeclaredBodySize(request,options.maxBodyBytes??DEFAULT_REQUEST_BODY_LIMIT_BYTES);
    if(options.rateLimit){void getRateLimitStore();await enforceRateLimit({key:options.rateLimit.key??`${clientKey(request)}:${new URL(request.url).pathname}`,limit:options.rateLimit.limit,windowSeconds:options.rateLimit.windowSeconds})}
    const result=await handler({request,requestId});if(result&&typeof result==="object"&&"__apiResponse" in result){const response=result as ApiResponse<T>;new Headers(response.headers).forEach((v,k)=>headers.set(k,v));const body:ApiSuccess<T>={data:response.data,requestId};return json(body,response.status,headers)}
    const body:ApiSuccess<T>={data:result as T,requestId};return json(body,options.status??200,headers);
  }catch(reason){const error=reason instanceof AppError?reason:new AppError("INTERNAL_ERROR",reason instanceof Error?reason.message:"Unexpected server error.",500,{cause:reason});const body:ApiFailure={error:{code:error.code,message:error.message,retryable:error.retryable,...(error.details?{details:error.details}:{})},requestId};if(error.status===429)headers.set("Retry-After","60");return json(body,error.status,headers)}
}
export const route=handleApi;
export function handleOptions(request:Request):Response{const requestId=getRequestId(request);return new Response(null,{status:204,headers:baseHeaders(request,requestId)})}
