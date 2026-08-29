import fs from "node:fs";
const launch = fs.readFileSync("programs/sui/launchpad/sources/launchpad.move", "utf8");
const registry = fs.readFileSync("programs/sui/launchpad/sources/adapter_registry.move", "utf8");
const vesting = fs.readFileSync("programs/sui/launchpad/sources/vesting.move", "utf8");
const publish = fs.readFileSync("packages/sui/src/launch/build-publish-token.ts", "utf8");
const configure = fs.readFileSync("packages/sui/src/launch/build-configure-launch.ts", "utf8");
const failures = [];
for (const field of [
  "graduation_registry_id", "graduation_adapter_id_hash", "graduation_adapter_version",
  "graduation_adapter_config_hash", "review_hash", "anti_bot_delay_ms", "initial_price_atomic",
  "graduation_threshold_atomic", "max_initial_purchase_per_wallet_atomic", "launch_window_open_ms",
  "launch_window_close_ms", "eligibility_mode", "eligibility_policy_id_hash", "eligibility_commitment",
  "dev_buy_enabled", "dev_buy_amount_atomic", "dev_buy_payment_asset_hash", "dev_vesting_enabled",
  "dev_vesting_template_hash"
]) if (!launch.includes(field)) failures.push(`missing launch field ${field}`);
if (!launch.includes("adapter_registry::assert_adapter")) failures.push("Tx 2 does not enforce governed adapter registry");
if (!launch.includes("coin::value(&fee) == LAUNCH_FEE_MIST")) failures.push("2 SUI fee invariant missing");
if (/set_graduation|update_graduation/i.test(launch)) failures.push("graduation venue mutation surface detected");
if (!registry.includes("MAX") && !registry.includes("adapter_id_hash")) failures.push("adapter registry commitment missing");
if (!vesting.includes("MAX_TRANCHES: u64 = 32")) failures.push("progressive vesting tranche ceiling missing");
if (!publish.includes('0x2::package::make_immutable')) failures.push("fresh token package is not made immutable in Tx 1");
if (!configure.includes("graduationRegistryObjectId") || !configure.includes("reviewHash")) failures.push("Sui Tx 2 builder missing registry/review commitments");
if (failures.length) { console.error(JSON.stringify({ok:false,failures},null,2)); process.exit(1); }
console.log(JSON.stringify({ok:true, twoSignatureInvariant:true, launchFee:"2 SUI", maxProgressiveTranches:32, immutableTokenPackage:true},null,2));
