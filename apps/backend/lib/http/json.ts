import { AppError } from "@powerchain/launchpad-shared";
import { DEFAULT_REQUEST_BODY_LIMIT_BYTES } from "@powerchain/launchpad-shared";

export function assertDeclaredBodySize(request:Request,maxBytes=DEFAULT_REQUEST_BODY_LIMIT_BYTES):void{
  const declared=request.headers.get("content-length");if(!declared)return;const size=Number(declared);
  if(Number.isFinite(size)&&size>maxBytes)throw new AppError("PAYLOAD_TOO_LARGE","REQUEST_TOO_LARGE: request body exceeds the 1 MiB limit.",413);
}
export async function readBodyLimited(request:Request,maxBytes=DEFAULT_REQUEST_BODY_LIMIT_BYTES):Promise<Uint8Array>{
  if(!request.body)return new Uint8Array();const reader=request.body.getReader();const chunks:Uint8Array[]=[];let total=0;
  for(;;){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new AppError("PAYLOAD_TOO_LARGE","REQUEST_TOO_LARGE: streamed request body exceeds the 1 MiB limit.",413)}chunks.push(value)}
  const merged=new Uint8Array(total);let offset=0;for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength}return merged;
}
export async function readJsonBodyLimited<T>(request:Request,maxBytes=DEFAULT_REQUEST_BODY_LIMIT_BYTES):Promise<T>{
  const bytes=await readBodyLimited(request,maxBytes);if(!bytes.byteLength)return {} as T;const text=new TextDecoder().decode(bytes);
  try{return JSON.parse(text) as T}catch{throw new AppError("BAD_REQUEST","Malformed JSON request body.",400)}
}
