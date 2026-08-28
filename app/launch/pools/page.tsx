import Link from "next/link";
import { AssetPair } from "@/components/asset-pair";
import { PoolCountdown } from "@/components/pool-countdown";
import { getSale, listPools } from "@/lib/server/store";
import { buildPoolExecutionReadiness, buildPoolReview, formatTokenAmount, poolInitialPriceDisplay, poolStatusLabel, saleGraduationProgressBps, venueLabels } from "@/lib/server/pools";
import type { PoolStatus, PoolVenue } from "@/types/domain";
export const dynamic = "force-dynamic";

const filters = ["ALL", "SCHEDULED", "READY", "LIVE", "GRADUATED"] as const;
const venues: ("ALL" | PoolVenue)[] = ["ALL", "RAYDIUM_CPMM", "METEORA_DAMM_V2", "ORCA_WHIRLPOOL"];

export default async function PoolsPage({ searchParams }: { searchParams: Promise<{ status?: string; venue?: string; q?: string }> }) {
  const query = await searchParams;
  const active = filters.includes((query.status || "ALL") as typeof filters[number]) ? (query.status || "ALL") : "ALL";
  const venue = venues.includes((query.venue || "ALL") as typeof venues[number]) ? (query.venue || "ALL") : "ALL";
  const q = (query.q || "").trim().toLowerCase();
  const pools = await listPools();
  const rows = await Promise.all(pools.map(async (pool) => {
    const sale = pool.saleId ? await getSale(pool.saleId) : null;
    return { pool, sale, review: buildPoolReview(pool, sale), execution: buildPoolExecutionReadiness(pool, sale), progress: saleGraduationProgressBps(pool, sale) };
  }));
  const visible = rows.filter(({ pool }) => {
    if (active !== "ALL" && pool.status !== active) return false;
    if (venue !== "ALL" && pool.venue !== venue) return false;
    if (q && !`${pool.name} ${pool.baseSymbol} ${pool.quoteSymbol} ${venueLabels[pool.venue]}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const ready = rows.filter(({ execution }) => execution.executable).length;
  const live = rows.filter(({ pool }) => pool.status === "LIVE").length;
  const approved = rows.filter(({ review }) => review.reviewCurrent).length;
  const stale = rows.filter(({ review }) => review.configurationValid && !review.reviewCurrent).length;

  return <main>
    <section className="border-b border-[var(--line)] bg-white">
      <div className="shell py-12 sm:py-16">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <span className="badge">Launch · Liquidity pools</span>
            <h1 className="mt-5 text-4xl font-extrabold tracking-[-.04em] sm:text-5xl">Graduate launches into verifiable liquidity.</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 muted sm:text-lg">Every launch pool carries a deterministic configuration review. Changing liquidity, decimals, venue, timing or authority invalidates the approved snapshot until it is signed again.</p>
          </div>
          <div className="flex flex-wrap gap-3"><Link href="/sales/demo" className="btn">Token sale</Link><Link href="/dashboard/admin/pools" className="btn btn-primary">Manage pools</Link></div>
        </div>
        <div className="grid-auto mt-10"><Metric label="Configured pools" value={rows.length}/><Metric label="Execution eligible" value={ready}/><Metric label="Approved reviews" value={approved}/><Metric label="Review required" value={stale}/><Metric label="Live pools" value={live}/></div>
      </div>
    </section>

    <section className="shell py-10">
      <div className="grid gap-4 border-b border-[var(--line)] pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><div className="label">Pool registry</div><h2 className="mt-1 text-2xl font-extrabold">Launch pools</h2><p className="mt-2 text-sm muted">Only server-reviewed state is shown as Ready. Draft records stay clearly separated from on-chain evidence.</p></div>
        <form className="flex min-w-0 gap-2" action="/launch/pools"><input className="input min-w-0 sm:w-72" name="q" defaultValue={query.q || ""} placeholder="Search pair or venue"/><button className="btn" type="submit">Search</button></form>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">{filters.map((filter) => <Link key={filter} href={poolHref({ status: filter, venue, q: query.q })} className={`pool-filter ${active === filter ? "pool-filter-active" : ""}`}>{filter === "ALL" ? "All states" : poolStatusLabel(filter as PoolStatus)}</Link>)}</div>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1">{venues.map((item) => <Link key={item} href={poolHref({ status: active, venue: item, q: query.q })} className={`pool-filter ${venue === item ? "pool-filter-active" : ""}`}>{item === "ALL" ? "All venues" : venueLabels[item]}</Link>)}</div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {visible.map(({ pool, sale, review, execution, progress }) => {
          const price = poolInitialPriceDisplay(pool);
          return <Link href={`/launch/pools/${pool.id}`} className="card pool-card p-5 sm:p-6" key={pool.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-4"><AssetPair base={pool.baseSymbol} quote={pool.quoteSymbol}/><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-xl font-extrabold">{pool.name}</h3><span className={`status status-${pool.status.toLowerCase()}`}>{poolStatusLabel(pool.status)}</span></div><p className="mt-1 text-sm muted">{venueLabels[pool.venue]} · {pool.mode === "SALE_GRADUATION" ? "Sale graduation" : "Manual pool"}</p></div></div>
              <span aria-hidden className="text-xl muted">↗</span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <PoolStat label="Base liquidity" value={formatTokenAmount(pool.initialBaseAmount, pool.baseDecimals, pool.baseSymbol)}/>
              <PoolStat label="Quote liquidity" value={formatTokenAmount(pool.initialQuoteAmount, pool.quoteDecimals, pool.quoteSymbol)}/>
              <PoolStat label="Initial price" value={price ? `${price} ${pool.quoteSymbol}/${pool.baseSymbol}` : "Not set"}/>
              <PoolStat label="Launch" value={<PoolCountdown launchAt={pool.launchAt}/>}/>
            </div>

            {progress && <div className="mt-5">
              <div className="flex items-center justify-between gap-4 text-xs"><span className="font-bold">Graduation progress</span><span className="muted">{(progress.soldBps / 100).toFixed(2)}% sold · threshold {(progress.thresholdBps / 100).toFixed(2)}%</span></div>
              <div className="progress-track mt-2"><div className="progress-fill" style={{ width: `${progress.progressBps / 100}%` }}/></div>
            </div>}

            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`status ${review.configurationValid ? "status-live" : "status-draft"}`}>{review.configurationValid ? "Config valid" : `${review.configurationBlockers.length} config blocker${review.configurationBlockers.length === 1 ? "" : "s"}`}</span>
              <span className={`status ${review.reviewCurrent ? "status-ready" : "status-scheduled"}`}>{review.reviewCurrent ? "Review approved" : "Review required"}</span>
              {sale && <span className="status">{sale.stage} sale</span>}
              <span className={`status ${execution.executable ? "status-ready" : "status-scheduled"}`}>{execution.executable ? "Execution eligible" : `${execution.blockers.length} execution gate${execution.blockers.length === 1 ? "" : "s"}`}</span>
            </div>
          </Link>;
        })}
        {!visible.length && <div className="card col-span-full p-10 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--soft)] text-xl">◌</div><h3 className="mt-4 text-lg font-extrabold">No matching pools</h3><p className="mt-2 muted">Change the status or venue filter, or search another token pair.</p><Link href="/launch/pools" className="btn mt-5">Clear filters</Link></div>}
      </div>
    </section>
  </main>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="card p-5"><div className="label">{label}</div><div className="mt-2 text-2xl font-extrabold tabular-nums">{value}</div></div>; }
function PoolStat({ label, value }: { label: string; value: React.ReactNode }) { return <div><div className="label">{label}</div><div className="mt-1 text-sm font-bold">{value}</div></div>; }
function poolHref({ status, venue, q }: { status: string; venue: string; q?: string }) { const p = new URLSearchParams(); if (status !== "ALL") p.set("status", status); if (venue !== "ALL") p.set("venue", venue); if (q) p.set("q", q); const s = p.toString(); return `/launch/pools${s ? `?${s}` : ""}`; }
