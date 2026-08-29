/**
 * Production host bootstrap example.
 *
 * This file deliberately accepts deployed chain adapters and platform bindings
 * instead of fabricating program/package addresses or chain state.
 */
import { installPowerChainRuntimeBindings } from "./lib/bootstrap";
import { PrismaLaunchRepository, type PrismaLaunchClient } from "./lib/launches/prisma-repository";
import { PrismaGraduationAdapterRegistry } from "./lib/launches/prisma-registry";
import { PrismaReviewSnapshotRepository } from "./lib/launches/prisma-review-snapshots";
import { Ed25519ReviewSnapshotSigner } from "./lib/launches/review-snapshot";
import type { D1Database } from "./lib/checkout/d1";
import type { LaunchAdapterRegistry } from "@powerchain/launchpad-program-client/launch/adapter";

export interface ProductionBindingInput {
  d1: D1Database;
  prisma: PrismaLaunchClient;
  launchAdapters: LaunchAdapterRegistry;
  reviewKeyId: string;
  reviewPrivateKeyPem: string;
}

export function installProductionBindings(input: ProductionBindingInput): void {
  const repository = new PrismaLaunchRepository(input.prisma);
  installPowerChainRuntimeBindings({
    d1: input.d1,
    launch: {
      repository,
      adapters: input.launchAdapters,
      graduationRegistry: new PrismaGraduationAdapterRegistry(input.prisma),
      reviewSnapshots: new PrismaReviewSnapshotRepository(input.prisma),
      reviewSigner: new Ed25519ReviewSnapshotSigner(input.reviewKeyId, input.reviewPrivateKeyPem),
    },
  });
}
