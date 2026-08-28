import { config } from "@/lib/config";
import type { PoolVenue } from "@/types/domain";

export type PoolAdapterCapability = {
  venue: PoolVenue;
  configuredVersion: string | null;
  implementationAvailable: boolean;
  transactionBuilder: "UNAVAILABLE" | "SERVER_ONLY";
};

/**
 * Capability registry for venue execution code.
 *
 * A configured adapter version proves which reviewed integration version is
 * expected. It does not prove that this repository contains a transaction
 * builder. Keep `implementationAvailable` false until the corresponding
 * server-only venue adapter is implemented, tested and registered here.
 */
export function getPoolAdapterCapability(venue: PoolVenue): PoolAdapterCapability {
  const configuredVersion = config.poolAdapters[venue] || null;
  return {
    venue,
    configuredVersion,
    implementationAvailable: false,
    transactionBuilder: "UNAVAILABLE",
  };
}
