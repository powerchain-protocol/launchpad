#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v anchor >/dev/null 2>&1 || { echo "anchor CLI is required" >&2; exit 1; }
for keypair in target/deploy/powerchain_launchpad_program-keypair.json target/deploy/powerchain_vesting_program-keypair.json; do
  [[ -f "$keypair" ]] || { echo "Missing real deployment keypair: $keypair" >&2; exit 1; }
done

anchor keys sync

if grep -R 'declare_id!("11111111111111111111111111111111")' programs/solana/*/src/lib.rs >/dev/null; then
  echo "Program-id synchronization failed: placeholder declare_id remains." >&2
  exit 1
fi

echo "Program IDs synchronized from real deployment keypairs."
