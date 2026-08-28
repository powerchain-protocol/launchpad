import Image from "next/image";

const icons: Record<string, string> = {
  PWRC: "/assets/pwrc.webp",
  SOL: "/assets/sol.webp",
  USDC: "/assets/usdc.webp",
  SUI: "/assets/sui.webp",
};

export function AssetPair({ base, quote, size = 38 }: { base: string; quote: string; size?: number }) {
  const pair = [base.toUpperCase(), quote.toUpperCase()];
  return <div className="flex items-center -space-x-2" aria-label={`${base} and ${quote}`}>
    {pair.map((symbol, index) => icons[symbol]
      ? <span key={`${symbol}-${index}`} className="relative overflow-hidden rounded-full border-2 border-white bg-white" style={{ width: size, height: size, zIndex: 2 - index }}><Image src={icons[symbol]} alt="" fill sizes={`${size}px`} className="object-cover" /></span>
      : <span key={`${symbol}-${index}`} className="grid place-items-center rounded-full border-2 border-white bg-[var(--soft)] text-xs font-black text-[var(--green)]" style={{ width: size, height: size, zIndex: 2 - index }}>{symbol.slice(0, 2)}</span>)}
  </div>;
}
