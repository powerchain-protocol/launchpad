export const LAUNCH_CHAINS = ["solana", "sui"] as const;
export type LaunchChain = (typeof LAUNCH_CHAINS)[number];

export const GRADUATION_VENUES = {
  solana: ["raydium", "meteora", "orca"],
  sui: ["cetus", "deepbook", "turbos"],
} as const;

export type SolanaGraduationVenue = (typeof GRADUATION_VENUES.solana)[number];
export type SuiGraduationVenue = (typeof GRADUATION_VENUES.sui)[number];

export type GraduationVenue =
  | { chain: "solana"; venue: SolanaGraduationVenue }
  | { chain: "sui"; venue: SuiGraduationVenue };

export function isVenueForChain(
  chain: LaunchChain,
  venue: string,
): venue is GraduationVenue["venue"] {
  return (GRADUATION_VENUES[chain] as readonly string[]).includes(venue);
}

export function assertVenueForChain(chain: LaunchChain, venue: string): void {
  if (!isVenueForChain(chain, venue)) {
    throw new Error(`Graduation venue "${venue}" is not valid for ${chain}.`);
  }
}
