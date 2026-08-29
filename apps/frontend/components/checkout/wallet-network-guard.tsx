"use client";

export function WalletNetworkGuard(props: {
  expectedChain: "solana" | "sui";
  expectedNetwork: string;
  connectedChain?: string;
  connectedNetwork?: string;
  walletAddress?: string;
  children: React.ReactNode;
}) {
  const connected = Boolean(props.walletAddress);
  const correctChain = props.connectedChain === props.expectedChain;
  const correctNetwork = props.connectedNetwork === props.expectedNetwork;
  const allowed = connected && correctChain && correctNetwork;

  if (allowed) return <>{props.children}</>;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <h3 className="text-sm font-semibold">Wallet/network check required</h3>
      <p className="mt-1 text-sm opacity-80">
        {!connected
          ? "Connect a wallet before continuing."
          : `Switch to ${props.expectedChain} ${props.expectedNetwork} before requesting or signing a quote.`}
      </p>
    </div>
  );
}
