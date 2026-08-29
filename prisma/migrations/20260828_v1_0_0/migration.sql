-- PowerChain Launchpad 1.0.0 canonical PostgreSQL baseline.
-- New deployments apply this as one migration. Existing pre-1.0 development
-- environments should be recreated or migrated with an environment-specific
-- bridge reviewed by an operator; historical development migrations are not
-- shipped in the production baseline.

CREATE TABLE "Launch" (
  "id" TEXT PRIMARY KEY,
  "chain" TEXT NOT NULL CHECK ("chain" IN ('solana','sui')),
  "creatorWallet" TEXT NOT NULL,
  "tokenName" TEXT NOT NULL,
  "tokenSymbol" TEXT NOT NULL,
  "tokenDescription" TEXT NOT NULL,
  "tokenIconUri" TEXT NOT NULL,
  "tokenDecimals" INTEGER NOT NULL CHECK ("tokenDecimals" BETWEEN 0 AND 18),
  "curveKind" TEXT NOT NULL DEFAULT 'bonding-curve',
  "initialPriceAtomic" TEXT NOT NULL CHECK ("initialPriceAtomic" ~ '^[0-9]+$'),
  "graduationThresholdAtomic" TEXT NOT NULL CHECK ("graduationThresholdAtomic" ~ '^[0-9]+$'),
  "status" TEXT NOT NULL,
  "graduationVenue" TEXT NOT NULL,
  "graduationAdapterRegistryId" TEXT,
  "graduationAdapterId" TEXT,
  "graduationAdapterVersion" INTEGER,
  "graduationAdapterEntry" TEXT,
  "graduationAdapterConfigHash" TEXT,
  "graduationVenueLocked" BOOLEAN NOT NULL DEFAULT FALSE,
  "reviewHash" TEXT,
  "reviewSignature" TEXT,
  "reviewKeyId" TEXT,
  "antiBotDelaySeconds" INTEGER NOT NULL DEFAULT 0 CHECK ("antiBotDelaySeconds" BETWEEN 0 AND 3600),
  "opensAt" TIMESTAMP(3),
  "closesAt" TIMESTAMP(3),
  "maxPerWalletAtomic" TEXT,
  "eligibilityMode" TEXT,
  "eligibilityPolicyId" TEXT,
  "eligibilityCommitment" TEXT,
  "tokenAddress" TEXT,
  "packageId" TEXT,
  "treasuryCapObjectId" TEXT,
  "tokenDeployTx" TEXT,
  "configureTx" TEXT,
  "vestingAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "launchedAt" TIMESTAMP(3),
  CONSTRAINT "Launch_window_check" CHECK (
    ("opensAt" IS NULL AND "closesAt" IS NULL) OR
    ("opensAt" IS NOT NULL AND "closesAt" IS NOT NULL AND "closesAt" > "opensAt")
  ),
  CONSTRAINT "Launch_eligibility_check" CHECK (
    "eligibilityMode" IS NULL OR "eligibilityMode" IN ('public','allowlist','private')
  ),
  CONSTRAINT "Launch_review_hash_check" CHECK ("reviewHash" IS NULL OR "reviewHash" ~ '^[0-9a-fA-F]{64}$')
);

CREATE TABLE "LaunchPayout" (
  "id" TEXT PRIMARY KEY,
  "launchId" TEXT NOT NULL REFERENCES "Launch"("id") ON DELETE CASCADE,
  "recipient" TEXT NOT NULL,
  "basisPoints" INTEGER NOT NULL CHECK ("basisPoints" > 0 AND "basisPoints" <= 10000),
  "label" TEXT,
  UNIQUE ("launchId", "recipient")
);

CREATE TABLE "LaunchDevBuy" (
  "launchId" TEXT PRIMARY KEY REFERENCES "Launch"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "paymentAsset" TEXT NOT NULL,
  "amountAtomic" TEXT NOT NULL CHECK ("amountAtomic" ~ '^[0-9]+$'),
  "vestingEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  "vestingTemplateJson" JSONB
);

CREATE TABLE "GraduationAdapter" (
  "id" TEXT PRIMARY KEY,
  "chain" TEXT NOT NULL CHECK ("chain" IN ('solana','sui')),
  "venue" TEXT NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "registryId" TEXT NOT NULL,
  "registryEntryAddress" TEXT,
  "configHash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active' CHECK ("status" IN ('active','disabled','deprecated')),
  "governanceProposalId" TEXT,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("chain", "venue", "version"),
  CONSTRAINT "GraduationAdapter_hash_check" CHECK ("configHash" IS NULL OR "configHash" ~ '^[0-9a-fA-F]{64}$')
);

CREATE TABLE "ConfigurationReviewSnapshot" (
  "hash" TEXT PRIMARY KEY CHECK ("hash" ~ '^[0-9a-fA-F]{64}$'),
  "launchId" TEXT NOT NULL REFERENCES "Launch"("id") ON DELETE CASCADE,
  "chain" TEXT NOT NULL CHECK ("chain" IN ('solana','sui')),
  "stage" TEXT NOT NULL CHECK ("stage" = 'LAUNCH_CONFIG'),
  "hashAlgorithm" TEXT NOT NULL CHECK ("hashAlgorithm" = 'sha256'),
  "signatureAlgorithm" TEXT NOT NULL CHECK ("signatureAlgorithm" = 'ed25519'),
  "signature" TEXT NOT NULL,
  "keyId" TEXT NOT NULL,
  "canonicalPayload" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "LaunchAudit" (
  "id" BIGSERIAL PRIMARY KEY,
  "launchId" TEXT NOT NULL REFERENCES "Launch"("id") ON DELETE CASCADE,
  "eventType" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL CHECK ("payloadHash" ~ '^[0-9a-fA-F]{64}$'),
  "previousHash" TEXT,
  "payloadJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Launch_chain_status_idx" ON "Launch" ("chain", "status");
CREATE INDEX "Launch_creatorWallet_createdAt_idx" ON "Launch" ("creatorWallet", "createdAt");
CREATE INDEX "GraduationAdapter_chain_venue_status_idx" ON "GraduationAdapter" ("chain", "venue", "status");
CREATE INDEX "ConfigurationReviewSnapshot_launchId_createdAt_idx" ON "ConfigurationReviewSnapshot" ("launchId", "createdAt");
CREATE INDEX "LaunchAudit_launchId_createdAt_idx" ON "LaunchAudit" ("launchId", "createdAt");

CREATE OR REPLACE FUNCTION powerchain_prevent_locked_launch_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."graduationVenueLocked" = TRUE THEN
    IF NEW."graduationVenue" IS DISTINCT FROM OLD."graduationVenue"
      OR NEW."chain" IS DISTINCT FROM OLD."chain"
      OR NEW."graduationAdapterRegistryId" IS DISTINCT FROM OLD."graduationAdapterRegistryId"
      OR NEW."graduationAdapterId" IS DISTINCT FROM OLD."graduationAdapterId"
      OR NEW."graduationAdapterVersion" IS DISTINCT FROM OLD."graduationAdapterVersion"
      OR NEW."graduationAdapterConfigHash" IS DISTINCT FROM OLD."graduationAdapterConfigHash"
      OR NEW."reviewHash" IS DISTINCT FROM OLD."reviewHash"
    THEN
      RAISE EXCEPTION 'immutable launch configuration cannot be changed after confirmation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Launch_prevent_locked_config_mutation"
BEFORE UPDATE ON "Launch"
FOR EACH ROW EXECUTE FUNCTION powerchain_prevent_locked_launch_mutation();
