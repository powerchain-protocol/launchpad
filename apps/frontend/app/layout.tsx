import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";
import { ResponsiveNavigation } from "@/components/layout/responsive-navigation";

export const metadata: Metadata = {
  title: "PowerChain Launchpad",
  description: "Production dual-chain token launch infrastructure for Solana and Sui.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><Providers><ResponsiveNavigation /><main id="main-content" className="page-shell">{children}</main><footer className="site-footer"><span>PowerChain Launchpad 1.0.0</span><span>Wallet custody remains with the user.</span></footer></Providers></body></html>;
}
