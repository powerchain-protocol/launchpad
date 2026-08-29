import fs from "node:fs";
const required = [
  "target/idl/powerchain_launchpad_program.json",
  "target/idl/powerchain_vesting_program.json",
  "target/deploy/powerchain_launchpad_program.so",
  "target/deploy/powerchain_vesting_program.so",
];
const missing = required.filter((file) => !fs.existsSync(file));
const placeholder = ["programs/solana/launchpad/src/lib.rs", "programs/solana/vesting/src/lib.rs"]
  .filter((file) => fs.readFileSync(file, "utf8").includes('declare_id!("11111111111111111111111111111111")'));
if (missing.length || placeholder.length) {
  console.error(JSON.stringify({ ok: false, missing, placeholder, remediation: "Provide real keypairs, run pnpm keys:sync, then anchor build --verifiable." }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true }, null, 2));
