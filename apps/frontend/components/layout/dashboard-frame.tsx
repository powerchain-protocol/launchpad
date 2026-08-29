"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const items = [["/launch", "Creator"], ["/powerpay", "PowerPay"], ["/claims", "Claims"], ["/wallet", "Wallet"], ["/checkout", "Checkout"]] as const;
export function DashboardFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="dashboard-frame">
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="label">Workspace</div>
      {items.map(([href, label]) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>{label}</Link>)}
    </aside>
    <nav className="workspace-mobile" aria-label="Workspace mobile">
      {items.map(([href, label]) => <Link key={href} href={href} aria-current={pathname.startsWith(href) ? "page" : undefined}>{label}</Link>)}
    </nav>
    <div className="dashboard-content">{children}</div>
  </div>;
}
