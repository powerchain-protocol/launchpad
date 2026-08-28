"use client";
import Link from "next/link";
import { Logo } from "./logo";
import { useWallet } from "./wallet-provider";

const links = [
  ["Sale", "/sales/demo"],
  ["Pools", "/launch/pools"],
  ["Payments", "/payments"],
  ["Claim", "/claim"],
  ["Send", "/send"],
  ["Receive", "/receive"],
  ["Explorer", "/explorer"],
] as const;

export function Header() {
  const { address, connect, disconnect } = useWallet();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-white/95 backdrop-blur">
      <div className="shell flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="desktop-nav flex items-center gap-5 text-sm font-semibold" aria-label="Primary navigation">
          {links.map(([name, href]) => <Link key={href} href={href} className="text-[var(--muted)] hover:text-[var(--ink)]">{name}</Link>)}
        </nav>
        <button className="btn btn-primary header-wallet" onClick={() => address ? disconnect() : connect()} aria-label={address ? "Disconnect wallet" : "Connect Solana wallet"}>
          {address ? `${address.slice(0, 4)}…${address.slice(-4)}` : "Connect wallet"}
        </button>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        <div className="shell mobile-nav-track">
          {links.map(([name, href]) => <Link key={href} href={href} className="mobile-nav-link">{name}</Link>)}
        </div>
      </nav>
    </header>
  );
}
