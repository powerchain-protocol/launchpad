"use client";

import type { ReactNode } from "react";
import { DAppKitProvider } from "@mysten/dapp-kit-react";
import { dAppKit } from "@/lib/sui/dapp-kit";

export function Providers({ children }: { children: ReactNode }) {
  return <DAppKitProvider dAppKit={dAppKit}>{children}</DAppKitProvider>;
}
