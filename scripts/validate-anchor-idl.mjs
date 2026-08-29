import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const failures = [];
const warnings = [];

const snakeToCamel = (value) => value.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const discriminator = (namespace, name) => Array.from(crypto.createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8));

function read(relative) { return fs.readFileSync(path.join(root, relative), "utf8"); }
function extractStructFields(source, structName) {
  const match = source.match(new RegExp(`pub struct ${structName}\\s*\\{([\\s\\S]*?)\\n\\}`, "m"));
  if (!match) throw new Error(`Missing Rust struct ${structName}`);
  return [...match[1].matchAll(/pub\s+([a-zA-Z0-9_]+)\s*:/g)].map((m) => m[1]);
}
function extractTsConst(source, constName) {
  const match = source.match(new RegExp(`export const ${constName} = \\[([\\s\\S]*?)\\] as const;`, "m"));
  if (!match) throw new Error(`Missing TypeScript contract ${constName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}
function equal(label, left, right) {
  if (JSON.stringify(left) !== JSON.stringify(right)) failures.push(`${label}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`);
}

const launchRust = read("programs/solana/launchpad/src/lib.rs");
const vestingRust = read("programs/solana/vesting/src/lib.rs");
const codec = read("packages/program-client/src/solana/codec.ts");

equal(
  "InitializeLaunchArgs field order",
  extractStructFields(launchRust, "InitializeLaunchArgs").map(snakeToCamel),
  extractTsConst(codec, "SOLANA_INITIALIZE_LAUNCH_FIELDS"),
);
equal(
  "InitializeVestingArgs field order",
  extractStructFields(vestingRust, "InitializeVestingArgs").map(snakeToCamel),
  extractTsConst(codec, "SOLANA_INITIALIZE_VESTING_FIELDS"),
);

for (const [label, source] of [["launchpad", launchRust], ["vesting", vestingRust]]) {
  if (!source.includes('declare_id!("11111111111111111111111111111111")')) {
    warnings.push(`${label}: source program id has been synchronized from a real keypair.`);
  }
}

const expectedDiscriminators = {
  initializeLaunch: discriminator("global", "initialize_launch"),
  initializeVesting: discriminator("global", "initialize_vesting"),
  launchAccount: discriminator("account", "Launch"),
  vestingScheduleAccount: discriminator("account", "VestingSchedule"),
};

function validateGeneratedIdl(relative, instructionName, expectedArgsType, expectedInstructionDiscriminator) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    warnings.push(`${relative} is not present; run anchor build to generate compiler-authoritative IDL.`);
    return;
  }
  const idl = JSON.parse(fs.readFileSync(file, "utf8"));
  const instruction = idl.instructions?.find((item) => item.name === instructionName);
  if (!instruction) { failures.push(`${relative}: missing instruction ${instructionName}`); return; }
  equal(`${relative}:${instructionName} discriminator`, instruction.discriminator, expectedInstructionDiscriminator);
  const args = instruction.args ?? [];
  if (args.length !== 1 || args[0].name !== "args") failures.push(`${relative}:${instructionName} must expose exactly one struct arg named args.`);
  const defined = args[0]?.type?.defined?.name ?? args[0]?.type?.defined;
  if (defined && defined !== expectedArgsType) failures.push(`${relative}:${instructionName} uses unexpected arg type ${defined}`);
}

validateGeneratedIdl("target/idl/powerchain_launchpad_program.json", "initializeLaunch", "InitializeLaunchArgs", expectedDiscriminators.initializeLaunch);
validateGeneratedIdl("target/idl/powerchain_vesting_program.json", "initializeVesting", "InitializeVestingArgs", expectedDiscriminators.initializeVesting);

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures, warnings, expectedDiscriminators }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, warnings, expectedDiscriminators }, null, 2));
