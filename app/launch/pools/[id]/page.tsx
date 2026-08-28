import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetPair } from "@/components/asset-pair";
import { PoolCountdown } from "@/components/pool-countdown";
import { solscanAccountUrl, solscanUrl } from "@/lib/config";
import { buildPoolExecutionReadiness, buildPoolReview, formatTokenAmount, poolInitialPriceDisplay, poolStatusLabel, saleGraduationProgressBps, venueLabels } from "@/lib/server/pools";
import { getPool, getSale } from "@/lib/server/store";
export const dynamic = "force-dynamic";

export default async function PoolDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getPool(id);
  if (!found) notFound();
  const pool = found!;
  const sale = pool.saleId ? await getSale(pool.saleId) : null;
  const review = buildPoolReview(pool, sale);
  const progress = saleGraduationProgressBps(pool, sale);
  const initialPrice = poolInitialPriceDisplay(pool);
  const execution = buildPoolExecutionReadiness(pool, sale);

  return <main className="shell py-10 sm:py-12">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link href="/launch/pools" className="text-sm font-bold muted hover:text-[var(--ink)]">← All pools</Link>
      <div className="flex flex-wrap gap-2"><span className={`status status-${pool.status.toLowerCase()}`}>{poolStatusLabel(pool.status)}</span>{pool.validated && <span className="badge">Authority validated</span>}{review.reviewCurrent && <span className="badge">Review approved</span>}</div>
    </div>

    <section className="card overflow-hidden">
      <div className="pool-detail-hero p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5"><AssetPair base={pool.baseSymbol} quote={pool.quoteSymbol} size={48}/><div><div className="label">{pool.mode === "SALE_GRADUATION" ? "Launch graduation pool" : "Launch pool"}</div><h1 className="mt-1 text-3xl font-extrabold tracking-[-.035em] sm:text-4xl">{pool.name}</h1><p className="mt-2 muted">{venueLabels[pool.venue]}</p></div></div>
          <div className="sm:text-right"><div className="label">Launch countdown</div><div className="mt-2 text-xl font-extrabold"><PoolCountdown launchAt={pool.launchAt}/></div></div>
        </div>
      </div>
      <div className="grid border-t border-[var(--line)] sm:grid-cols-2 lg:grid-cols-5">
        <DetailStat label="Initial base" value={formatTokenAmount(pool.initialBaseAmount, pool.baseDecimals, pool.baseSymbol)}/>
        <DetailStat label="Initial quote" value={formatTokenAmount(pool.initialQuoteAmount, pool.quoteDecimals, pool.quoteSymbol)}/>
        <DetailStat label="Initial price" value={initialPrice ? `${initialPrice} ${pool.quoteSymbol}/${pool.baseSymbol}` : "Not set"}/>
        <DetailStat label="Fee tier" value={pool.feeTierBps === undefined ? "Venue default" : `${(pool.feeTierBps / 100).toFixed(2)}%`}/>
        <DetailStat label="Review state" value={review.ready ? "Ready" : review.configurationValid ? "Approval required" : "Blocked"}/>
      </div>
    </section>

    {progress && <section className="card mt-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="label">Sale graduation</div><h2 className="mt-1 text-xl font-extrabold">Liquidity trigger progress</h2></div><div className="text-right"><div className="text-2xl font-extrabold tabular-nums">{(progress.soldBps / 100).toFixed(2)}%</div><div className="text-xs muted">threshold {(progress.thresholdBps / 100).toFixed(2)}%</div></div></div>
      <div className="progress-track mt-5"><div className="progress-fill" style={{ width: `${progress.progressBps / 100}%` }}/></div>
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs muted"><span>{sale?.sold.toLocaleString()} {sale?.symbol} sold</span><span>{progress.reached ? "Graduation threshold reached" : `${((progress.thresholdBps - progress.soldBps) / 100).toFixed(2)} percentage points remaining`}</span></div>
    </section>}

    <div className="mt-5 grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
      <section className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="label">Configuration review</div><h2 className="mt-1 text-2xl font-extrabold">Pre-signature checks</h2></div><div className="flex gap-2"><span className={`status ${review.configurationValid ? "status-live" : "status-draft"}`}>{review.configurationValid ? "Config valid" : "Blocked"}</span><span className={`status ${review.reviewCurrent ? "status-ready" : "status-scheduled"}`}>{review.reviewCurrent ? "Review current" : "Review required"}</span></div></div>
        <p className="mt-3 max-w-2xl leading-7 muted">The approved review hash binds mints, decimals, liquidity, venue, authority, timing, graduation threshold and the configured adapter version. Any bound-field change makes the prior approval stale.</p>
        {review.blockers.length ? <div className="mt-5 grid gap-2">{review.blockers.map((blocker) => <div key={blocker} className="notice notice-warning"><b>{readable(blocker)}</b></div>)}</div> : <div className="notice notice-success mt-5"><b>Configuration and review approval are current.</b> The pool is eligible for the next controlled creation step.</div>}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Hash label="Current configuration hash" value={review.reviewHash}/>
          <Hash label="Approved review hash" value={review.approvedReviewHash || "Not approved"}/>
        </div>
        {review.reviewedAt && <p className="mt-3 text-xs muted">Review approved {new Date(review.reviewedAt).toLocaleString()} · config revision {review.approvedConfigurationRevision ?? "—"} · adapter {review.adapterVersion || "not configured"}{review.reviewedBy ? ` · ${review.reviewedBy.slice(0, 6)}…${review.reviewedBy.slice(-4)}` : ""}</p>}
      </section>

      <aside className="card p-6">
        <div className="label">Launch linkage</div><h2 className="mt-1 text-xl font-extrabold">Pool identity</h2>
        <dl className="mt-5 grid gap-4">
          <Row label="Base mint" value={<Address value={pool.baseMint}/>}/>
          <Row label="Base decimals" value={String(pool.baseDecimals)}/>
          <Row label="Quote mint" value={<Address value={pool.quoteMint}/>}/>
          <Row label="Quote decimals" value={String(pool.quoteDecimals)}/>
          <Row label="Authority" value={<Address value={pool.authority}/>}/>
          <Row label="Treasury" value={<Address value={pool.treasuryWallet}/>}/>
          <Row label="Linked sale" value={sale ? <Link className="font-bold text-[var(--green)]" href={`/sales/${sale.id}`}>{sale.name}</Link> : "None"}/>
          <Row label="Adapter" value={review.adapterConfigured ? review.adapterVersion || "Configured" : "Not configured"}/>
        </dl>
      </aside>
    </div>

    <section className="card mt-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="label">Execution readiness</div><h2 className="mt-1 text-xl font-extrabold">Controlled creation gate</h2></div><span className={`status ${execution.executable ? "status-ready" : "status-scheduled"}`}>{execution.executable ? "Execution eligible" : "Not executable"}</span></div>
      <p className="mt-2 max-w-3xl text-sm leading-6 muted">Review approval alone never creates liquidity. The server also requires the Ready lifecycle state, launch timing, graduation conditions and a configured venue adapter. The execution boundary remains fail-closed until the actual venue transaction adapter is deployed.</p>
      {execution.blockers.length ? <div className="mt-4 flex flex-wrap gap-2">{execution.blockers.map((blocker) => <span className="status status-draft" key={blocker}>{readable(blocker.replace(/^REVIEW:/, ""))}</span>)}</div> : <div className="notice notice-success mt-4"><b>All pre-execution gates are satisfied.</b> This does not imply that an on-chain transaction has been built or submitted.</div>}
      <div className="mt-5 grid gap-3 sm:grid-cols-4"><DetailStat label="Record revision" value={pool.revision}/><DetailStat label="Config revision" value={pool.configurationRevision}/><DetailStat label="Launch time" value={execution.launchTimeReached ? "Reached" : "Pending"}/><DetailStat label="Graduation" value={execution.graduationRequired ? execution.graduationReached ? "Reached" : "Pending" : "Not required"}/></div>
    </section>

    {(pool.poolAddress || pool.creationSignature) && <section className="card mt-5 p-6"><div className="label">On-chain evidence</div><h2 className="mt-1 text-xl font-extrabold">Validated creation record</h2><p className="mt-2 text-sm muted">Explorer links are shown only when reconciled pool account or transaction evidence exists.</p><div className="mt-5 flex flex-wrap gap-3">{pool.poolAddress && <a className="btn" href={solscanAccountUrl(pool.poolAddress)} target="_blank" rel="noreferrer">Pool account ↗</a>}{pool.lpMint && <a className="btn" href={solscanAccountUrl(pool.lpMint)} target="_blank" rel="noreferrer">LP mint ↗</a>}{pool.creationSignature && <a className="btn" href={solscanUrl(pool.creationSignature)} target="_blank" rel="noreferrer">Creation transaction ↗</a>}</div></section>}
  </main>;
}

function DetailStat({ label, value }: { label: string; value: React.ReactNode }) { return <div className="p-5 sm:p-6"><div className="label">{label}</div><div className="mt-2 font-extrabold">{value}</div></div>; }
function Row({ label, value }: { label: string; value: React.ReactNode }) { return <div className="grid gap-1"><dt className="label">{label}</dt><dd className="min-w-0 break-all text-sm">{value}</dd></div>; }
function Address({ value }: { value: string }) { return value.startsWith("CONFIGURE_") ? <span className="muted">Not configured</span> : <a href={solscanAccountUrl(value)} target="_blank" rel="noreferrer" className="font-semibold text-[var(--green)]">{value.slice(0, 8)}…{value.slice(-8)} ↗</a>; }
function Hash({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg)] p-4"><div className="label">{label}</div><code className="mt-2 block break-all text-xs leading-6">{value}</code></div>; }
function readable(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()); }
