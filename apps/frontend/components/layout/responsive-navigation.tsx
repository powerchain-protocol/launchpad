"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [
  ["/", "Launchpad"], ["/launch", "Create"], ["/checkout", "Checkout"], ["/powerpay", "PowerPay"],
  ["/claims", "Claims"], ["/wallet", "Wallet"], ["/docs", "Docs"],
] as const;

function current(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function ResponsiveNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    const focusables = () => Array.from(dialog?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
    focusables()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0]!; const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = before;
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <header className="site-header">
      <Link href="/" className="brand" aria-label="PowerChain Launchpad home">
        <img src="/powerchain-logo.png" alt="PowerChain" width={34} height={34} />
        <span>PowerChain <strong>Launchpad</strong></span>
      </Link>
      <nav className="desktop-nav" aria-label="Public navigation">
        {links.map(([href, label]) => <Link key={href} href={href} aria-current={current(pathname, href) ? "page" : undefined}>{label}</Link>)}
      </nav>
      <button ref={triggerRef} className="menu-button" type="button" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(true)}>Menu</button>
      {open ? (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <div id="mobile-navigation" ref={dialogRef} className="mobile-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title">
            <div className="section-heading"><h2 id="mobile-navigation-title">Navigation</h2><button type="button" className="icon-button" aria-label="Close navigation" onClick={() => setOpen(false)}>×</button></div>
            <nav className="mobile-nav" aria-label="Mobile navigation">
              {links.map(([href, label]) => <Link key={href} href={href} aria-current={current(pathname, href) ? "page" : undefined}>{label}</Link>)}
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
