import crypto from "node:crypto";
export function canonicalize(value:any):string{if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return `[${value.map(canonicalize).join(",")}]`;return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`}
export function sha256(value:any){return crypto.createHash("sha256").update(typeof value==="string"?value:canonicalize(value)).digest("hex")}
export function sha256Bytes(value:Uint8Array){return crypto.createHash("sha256").update(value).digest("hex")}
