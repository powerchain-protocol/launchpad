import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../../generated/prisma/client";

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (!databaseUrl.trim()) throw new Error("DATABASE_URL is required.");
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}
