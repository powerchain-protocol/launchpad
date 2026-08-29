"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  GraduationPreview as GraduationPreviewData,
  InitialPurchaseLimitConfig,
  LaunchEligibilityConfig,
  LaunchRecord,
  LaunchSimulationResult,
  LaunchWindowConfig,
  PayoutSplit,
  PreparedTransaction,
  VestingTemplate,
} from "@powerchain/launchpad-domain/launch";
import { api } from "@/lib/api";
import {
  connectSolanaWallet,
  signAndSendSerializedSolanaTransaction,
  type SolanaWalletName,
} from "@/lib/wallet/solana";
import { SuiWalletControls } from "@/components/wallet/sui-wallet-controls";
import { LaunchControls } from "@/components/creator-console/launch-controls";
import { PayoutEditor } from "@/components/creator-console/payout-editor";
import { VestingTemplateEditor } from "@/components/creator-console/vesting-template-editor";
import { GraduationPreview } from "@/components/creator-console/graduation-preview";
import { Tx2SimulationReview } from "@/components/creator-console/simulation-review";
import { LaunchTransactionReview } from "@/components/creator-console/transaction-review";

const venueValues = {
  solana: ["raydium", "meteora", "orca"] as const,
  sui: ["cetus", "deepbook", "turbos"] as const,
};
const venueLabel = (value: string) => value[0]!.toUpperCase() + value.slice(1);

export function LaunchClient() {
  const [chain, setChain] = useState<"solana" | "sui">("solana");
  const [solWalletName, setSolWalletName] = useState<SolanaWalletName>("Phantom");
  const [wallet, setWallet] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [iconUri, setIconUri] = useState("");
  const [decimals, setDecimals] = useState(9);
  const [initialPrice, setInitialPrice] = useState("");
  const [threshold, setThreshold] = useState("");
  const [venue, setVenue] = useState<string>("raydium");
  const [antiBot, setAntiBot] = useState(0);
  const [devBuy, setDevBuy] = useState("");
  const [devVestingEnabled, setDevVestingEnabled] = useState(false);
  const [vestingTemplate, setVestingTemplate] = useState<VestingTemplate>({
    name: "Creator vesting",
    schedule: { kind: "linear", cliffSeconds: 0, durationSeconds: 31_536_000 },
  });
  const [purchaseLimit, setPurchaseLimit] = useState<InitialPurchaseLimitConfig>({ enabled: false });
  const [launchWindow, setLaunchWindow] = useState<LaunchWindowConfig>({ enabled: false });
  const [eligibility, setEligibility] = useState<LaunchEligibilityConfig>({ mode: "public" });
  const [payouts, setPayouts] = useState<PayoutSplit[]>([{ recipient: "", basisPoints: 10_000, label: "Creator" }]);

  const [launch, setLaunch] = useState<LaunchRecord>();
  const [prepared, setPrepared] = useState<PreparedTransaction>();
  const [simulation, setSimulation] = useState<LaunchSimulationResult>();
  const [preview, setPreview] = useState<GraduationPreviewData>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo(() => venueValues[chain], [chain]);
  const setSuiAccount = useCallback((address: string) => setWallet(address), []);
  const configLocked = Boolean(launch);

  useEffect(() => {
    if (!wallet || payouts[0]?.recipient) return;
    setPayouts((current) => current.map((split, index) => index === 0 ? { ...split, recipient: wallet } : split));
  }, [wallet, payouts]);

  const switchChain = (next: "solana" | "sui") => {
    setChain(next);
    setVenue(venueValues[next][0]);
    setWallet("");
    setLaunch(undefined);
    setPrepared(undefined);
    setSimulation(undefined);
    setPreview(undefined);
    setError("");
  };

  const connectSolana = async () => {
    setError("");
    try {
      setWallet(await connectSolanaWallet(solWalletName));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet connection failed");
    }
  };

  const create = async () => {
    if (!wallet) return setError("Connect the creator wallet first.");
    if (!initialPrice || !threshold) return setError("Curve initial price and graduation threshold are required.");
    if (payouts.reduce((sum, split) => sum + split.basisPoints, 0) !== 10_000) return setError("Payout splits must total exactly 10,000 basis points.");
    if (payouts.some((split) => !split.recipient.trim())) return setError("Every payout recipient must have a wallet address.");

    setBusy(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      const graduation = chain === "solana"
        ? { chain: "solana" as const, venue: venue as "raydium" | "meteora" | "orca" }
        : { chain: "sui" as const, venue: venue as "cetus" | "deepbook" | "turbos" };
      const draft = {
        id,
        chain,
        creatorWallet: wallet,
        token: { name, symbol, description, iconUri, decimals },
        curve: { kind: "bonding-curve" as const, initialPriceAtomic: initialPrice, graduationThresholdAtomic: threshold },
        payoutSplits: payouts,
        graduation,
        antiBot: { enabled: antiBot > 0, delaySeconds: antiBot },
        initialPurchaseLimit: purchaseLimit,
        launchWindow,
        eligibility,
        ...(devBuy ? {
          devBuy: {
            enabled: true,
            amountAtomic: devBuy,
            paymentAsset: chain === "sui" ? "SUI" : "SOL",
            ...(devVestingEnabled ? { vesting: { enabled: true, template: vestingTemplate } } : {}),
          },
        } : {}),
      };
      const persisted = await api<LaunchRecord>("/api/v1/launches", { method: "POST", body: JSON.stringify(draft) });
      setLaunch(persisted);
      try {
        setPreview(await api<GraduationPreviewData>(`/api/v1/launches/${persisted.id}/graduation/preview`));
      } catch {
        // Preview is advisory; inability to calculate it must not mutate the draft.
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to create launch draft");
    } finally {
      setBusy(false);
    }
  };

  const prepareStage = async (stage: "token" | "configure") => {
    if (!launch) return;
    setBusy(true);
    setError("");
    try {
      const path = stage === "token"
        ? `/api/v1/launches/${launch.id}/token/prepare`
        : `/api/v1/launches/${launch.id}/configure/prepare`;
      setPrepared(await api<PreparedTransaction>(path, { method: "POST" }));
      setLaunch(await api<LaunchRecord>(`/api/v1/launches/${launch.id}`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to prepare transaction");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (transactionId: string) => {
    if (!launch || !prepared) return;
    setBusy(true);
    setError("");
    try {
      const path = prepared.stage === "TOKEN_DEPLOY"
        ? `/api/v1/launches/${launch.id}/token/confirm`
        : `/api/v1/launches/${launch.id}/configure/confirm`;
      const next = await api<LaunchRecord>(path, { method: "POST", body: JSON.stringify({ transactionId }) });
      setLaunch(next);
      setPrepared(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to verify transaction");
    } finally {
      setBusy(false);
    }
  };

  const signSolana = async () => {
    if (!prepared) return;
    try {
      await confirm(await signAndSendSerializedSolanaTransaction(solWalletName, prepared.serialized));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Wallet signing failed");
    }
  };

  const simulate = async () => {
    if (!launch) return;
    setBusy(true);
    setError("");
    try {
      setSimulation(await api<LaunchSimulationResult>(`/api/v1/launches/${launch.id}/configure/simulate`, { method: "POST" }));
      setPreview(await api<GraduationPreviewData>(`/api/v1/launches/${launch.id}/graduation/preview`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="grid two">
        <section className="card stack">
          <div><div className="label">Creator Console</div><h1>Create launch</h1><p className="muted">Configure the token and economic policy once, persist it, then approve exactly two chain transactions.</p></div>
          <label className="field"><span>Network</span><select value={chain} disabled={configLocked} onChange={(event) => switchChain(event.target.value as "solana" | "sui")}><option value="solana">Solana</option><option value="sui">Sui</option></select></label>
          {chain === "solana" ? <div className="grid two"><label className="field"><span>Wallet</span><select value={solWalletName} disabled={configLocked} onChange={(event) => setSolWalletName(event.target.value as SolanaWalletName)}><option>Phantom</option><option>Solflare</option><option>Backpack</option></select></label><button className="button secondary" type="button" disabled={configLocked} onClick={() => void connectSolana()}>{wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect creator"}</button></div> : <SuiWalletControls onAccount={setSuiAccount} onSubmitted={(digest) => void confirm(digest)} prepared={prepared?.chain === "sui" ? prepared.serialized : undefined} busy={busy} />}

          <fieldset className="stack" disabled={configLocked}>
            <div className="grid two"><label className="field"><span>Token name</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={64} /></label><label className="field"><span>Symbol</span><input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} maxLength={12} /></label></div>
            <label className="field"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label>
            <label className="field"><span>Icon URI</span><input value={iconUri} onChange={(event) => setIconUri(event.target.value)} inputMode="url" /></label>
            <div className="grid two"><label className="field"><span>Decimals</span><input type="number" min="0" max="18" value={decimals} onChange={(event) => setDecimals(Number(event.target.value))} /></label><label className="field"><span>Graduation venue</span><select value={venue} onChange={(event) => setVenue(event.target.value)}>{options.map((item) => <option value={item} key={item}>{venueLabel(item)}</option>)}</select></label></div>
            <div className="grid two"><label className="field"><span>Initial price (atomic)</span><input value={initialPrice} onChange={(event) => setInitialPrice(event.target.value)} inputMode="numeric" /></label><label className="field"><span>Graduation threshold (atomic)</span><input value={threshold} onChange={(event) => setThreshold(event.target.value)} inputMode="numeric" /></label></div>
            <div className="grid two"><label className="field"><span>Anti-bot delay (seconds)</span><input type="number" min="0" max="3600" value={antiBot} onChange={(event) => setAntiBot(Number(event.target.value))} /></label><label className="field"><span>Optional dev buy (atomic)</span><input value={devBuy} onChange={(event) => setDevBuy(event.target.value)} inputMode="numeric" /></label></div>
            {devBuy ? <label className="field"><span><input type="checkbox" checked={devVestingEnabled} onChange={(event) => setDevVestingEnabled(event.target.checked)} /> Route dev-buy directly into vesting</span></label> : null}
          </fieldset>
        </section>

        <aside className="card stack">
          <div className="label">Launch state</div>
          <h2>{launch?.status ?? "Draft not persisted"}</h2>
          <p className="muted">Graduation: <strong>{venueLabel(venue)}</strong>. Venue and governed adapter become immutable after Tx 2 confirmation.</p>
          {!launch ? <button className="button" type="button" onClick={() => void create()} disabled={busy || !wallet || !name || !symbol || !description || !iconUri}>Persist & review launch</button> : null}
          {launch?.status === "DRAFT" ? <button className="button" type="button" onClick={() => void prepareStage("token")} disabled={busy}>Prepare Tx 1</button> : null}
          {launch?.status === "TOKEN_DEPLOYED" ? <><button className="button secondary" type="button" onClick={() => void simulate()} disabled={busy}>Simulate Tx 2 + graduation</button><button className="button" type="button" onClick={() => void prepareStage("configure")} disabled={busy}>Prepare Tx 2</button></> : null}
          {prepared && chain === "solana" ? <button className="button" type="button" onClick={() => void signSolana()} disabled={busy}>Review in {solWalletName} & sign {prepared.stage === "TOKEN_DEPLOY" ? "Tx 1" : "Tx 2"}</button> : null}
          {launch?.status === "LIVE" ? <div role="status" className="status"><strong>Launch live.</strong> Tx 2 has been verified; venue, adapter and review hash are locked.</div> : null}
          {error ? <p role="alert" style={{ color: "var(--danger)" }}>{error}</p> : null}
        </aside>
      </div>

      {!configLocked ? <><PayoutEditor value={payouts} onChange={setPayouts} /><LaunchControls purchaseLimit={purchaseLimit} launchWindow={launchWindow} eligibility={eligibility} onPurchaseLimitChange={setPurchaseLimit} onLaunchWindowChange={setLaunchWindow} onEligibilityChange={setEligibility} />{devBuy && devVestingEnabled ? <VestingTemplateEditor value={vestingTemplate} onChange={setVestingTemplate} /> : null}</> : null}
      {prepared ? <LaunchTransactionReview review={prepared.review} /> : null}
      {simulation ? <Tx2SimulationReview simulation={simulation} /> : null}
      {preview ? <GraduationPreview preview={preview} /> : null}
    </div>
  );
}
