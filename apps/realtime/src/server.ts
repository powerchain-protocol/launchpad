import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { verifyRealtimeToken } from "@powerchain/launchpad-server/realtime-token";

const MAX_MESSAGE_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_MINUTE = 120;
const MAX_AUTH_FAILURES = 3;
const MAX_SUBSCRIPTIONS = 32;
const POLICY_CLOSE = 1008;
const port = Number(process.env.PORT ?? 3010);
const tokenSecret = process.env.REALTIME_TOKEN_SECRET ?? "";
const publishSecret = process.env.REALTIME_INTERNAL_PUBLISH_SECRET ?? "";
const allowedOrigins = new Set((process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").map((v)=>v.trim()).filter(Boolean));
if(tokenSecret.length<32)throw new Error("REALTIME_TOKEN_SECRET must be at least 32 characters.");
if(publishSecret.length<24)throw new Error("REALTIME_INTERNAL_PUBLISH_SECRET must be configured.");

type State={authorized:Set<string>;subscriptions:Set<string>;messages:number[];authFailures:number;alive:boolean};
const states=new WeakMap<WebSocket,State>();
const peers=new Set<WebSocket>();
function send(ws:WebSocket,payload:unknown){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(payload))}
function policy(ws:WebSocket,code:string,message:string){send(ws,{type:"error",code,message});ws.close(POLICY_CLOSE,code)}

const server=createServer(async(req,res)=>{
  if(req.method==="GET"&&req.url==="/health"){res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({ok:true}));return}
  if(req.method==="POST"&&req.url==="/internal/publish"){
    if(req.headers.authorization!==`Bearer ${publishSecret}`){res.writeHead(401);res.end();return}
    let total=0;const chunks:Buffer[]=[];
    try{for await(const chunk of req){const b=Buffer.from(chunk);total+=b.length;if(total>MAX_MESSAGE_BYTES)throw new Error("too large");chunks.push(b)}const body=JSON.parse(Buffer.concat(chunks).toString("utf8")) as {topic?:string;event?:unknown};if(!body.topic)throw new Error("topic required");for(const ws of peers){const state=states.get(ws);if(state?.subscriptions.has(body.topic))send(ws,{type:"event",topic:body.topic,event:body.event})}res.writeHead(202,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({accepted:true}));}catch{res.writeHead(400);res.end();}return
  }
  res.writeHead(404);res.end();
});
const wss=new WebSocketServer({server,maxPayload:MAX_MESSAGE_BYTES,perMessageDeflate:false,verifyClient:({origin})=>!origin||allowedOrigins.size===0||allowedOrigins.has(origin)});
wss.on("connection",(ws)=>{
  peers.add(ws);states.set(ws,{authorized:new Set(),subscriptions:new Set(),messages:[],authFailures:0,alive:true});
  ws.on("pong",()=>{const state=states.get(ws);if(state)state.alive=true});
  ws.on("message",(data)=>{
    const state=states.get(ws)!;const size=Buffer.isBuffer(data)?data.length:Buffer.byteLength(String(data));if(size>MAX_MESSAGE_BYTES)return policy(ws,"MESSAGE_TOO_LARGE","Message exceeds 64 KiB.");
    const now=Date.now();state.messages=state.messages.filter((t)=>now-t<60_000);state.messages.push(now);if(state.messages.length>MAX_MESSAGES_PER_MINUTE)return policy(ws,"RATE_LIMIT_EXCEEDED","Connection exceeds 120 messages/minute.");
    let msg:any;try{msg=JSON.parse(String(data))}catch{return policy(ws,"INVALID_MESSAGE","Message must be valid JSON.")}
    if(msg.type==="authenticate"){
      try{const claims=verifyRealtimeToken(String(msg.token??""),tokenSecret);state.authorized=new Set(claims.topics);state.authFailures=0;send(ws,{type:"authenticated",subject:claims.sub,topics:[...state.authorized]})}catch{state.authFailures+=1;if(state.authFailures>=MAX_AUTH_FAILURES)return policy(ws,"AUTH_ATTEMPTS_EXCEEDED","Authentication attempts exceeded.");send(ws,{type:"error",code:"AUTH_FAILED",message:"Authentication failed."})}return
    }
    if(msg.type==="subscribe"){
      const topics=Array.isArray(msg.topics)?msg.topics.map(String):[];if(!state.authorized.size)return policy(ws,"AUTH_REQUIRED","Authenticate before subscribing.");if(topics.some((topic)=>!state.authorized.has(topic)))return policy(ws,"TOPIC_NOT_AUTHORIZED","Subscription topic is outside the signed token claims.");if(new Set([...state.subscriptions,...topics]).size>MAX_SUBSCRIPTIONS)return policy(ws,"SUBSCRIPTION_LIMIT_EXCEEDED","Maximum 32 subscriptions per connection.");topics.forEach((topic)=>state.subscriptions.add(topic));send(ws,{type:"subscribed",topics:[...state.subscriptions]});return
    }
    if(msg.type==="unsubscribe"){(Array.isArray(msg.topics)?msg.topics:[]).map(String).forEach((topic)=>state.subscriptions.delete(topic));send(ws,{type:"subscribed",topics:[...state.subscriptions]});return}
    if(msg.type==="ping"){send(ws,{type:"pong"});return}
    policy(ws,"UNSUPPORTED_MESSAGE","Unsupported realtime message type.");
  });
  ws.on("close",()=>peers.delete(ws));
});
const heartbeat=setInterval(()=>{for(const ws of peers){const state=states.get(ws);if(!state?.alive){ws.terminate();continue}state.alive=false;ws.ping()}},30_000);heartbeat.unref();
server.listen(port,()=>console.log(`PowerChain realtime listening on :${port}`));
