"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit-react/ui";
import { useCurrentAccount, useDAppKit } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";

export function SuiWalletControls(props: {
  onAccount: (address: string) => void;
  onSubmitted: (digest: string) => void;
  prepared?: string;
  busy?: boolean;
}) {
  const account = useCurrentAccount();
  const dAppKit = useDAppKit();
  const [error, setError] = useState("");

  useEffect(() => { props.onAccount(account?.address ?? ""); }, [account?.address, props.onAccount]);

  const sign = async () => {
    if (!props.prepared) return;
    setError("");
    try {
      const result = await dAppKit.signAndExecuteTransaction({ transaction: Transaction.from(props.prepared) });
      const executed = result.Transaction ?? result.FailedTransaction;
      if (!executed) throw new Error("Sui wallet returned no transaction result.");
      if (result.FailedTransaction) throw new Error(result.FailedTransaction.status.error?.message ?? "Sui transaction failed.");
      props.onSubmitted(executed.digest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sui wallet signing failed.");
    }
  };

  return (
    <div className="stack compact">
      <ConnectButton />
      {account ? <div className="muted">Creator: <code>{account.address}</code></div> : null}
      {props.prepared ? <button className="button" type="button" disabled={props.busy || !account} onClick={() => void sign()}>Review in Sui wallet & sign</button> : null}
      {error ? <p role="alert" className="danger">{error}</p> : null}
    </div>
  );
}
