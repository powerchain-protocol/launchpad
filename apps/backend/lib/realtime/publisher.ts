import type { SettlementEvidence } from "@powerchain/launchpad-domain/checkout";
import { loadRuntimeConfig } from "@powerchain/launchpad-config";

export async function publishSettlementEvidence(evidence: SettlementEvidence): Promise<void> {
  const config=loadRuntimeConfig();const base=config.realtime.publicUrl;const secret=config.realtime.internalPublishSecret;
  if(!base||!secret)return;
  try{
    const url=new URL("/internal/publish",base.replace(/^ws/,"http"));
    await fetch(url,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${secret}`},body:JSON.stringify({topic:`checkout:${evidence.orderId}`,event:{type:"settlement.updated",evidence}}),signal:AbortSignal.timeout(5_000),cache:"no-store"});
  }catch{ /* realtime is advisory; chain/database state remains authoritative */ }
}
