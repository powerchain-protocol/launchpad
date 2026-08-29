import "dotenv/config";
import { defineConfig } from "prisma/config";
const generationPlaceholder = "postgresql://powerchain:powerchain@127.0.0.1:5432/powerchain_launchpad";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL?.trim() || generationPlaceholder },
});
