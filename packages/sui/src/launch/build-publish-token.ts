import { Transaction } from "@mysten/sui/transactions";
import type { CompiledMovePackage } from "./types";

export function buildSuiPublishTokenTransaction(
  sender: string,
  compiled: CompiledMovePackage,
): Transaction {
  if (!sender.trim()) throw new Error("Sui sender is required.");
  if (compiled.modules.length === 0) throw new Error("Compiled Move modules are required.");
  if (compiled.dependencies.length === 0) {
    throw new Error("Compiled Move package dependencies are required.");
  }

  const tx = new Transaction();
  tx.setSender(sender);

  const [upgradeCap] = tx.publish({
    modules: compiled.modules,
    dependencies: compiled.dependencies,
  });

  // Token package immutability is established inside Tx 1. The creator cannot
  // later upgrade the freshly published token module after launch review.
  tx.moveCall({
    target: "0x2::package::make_immutable",
    arguments: [upgradeCap],
  });

  return tx;
}
