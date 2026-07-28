import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const migration = readFileSync("./drizzle/0001_mean_norman_osborn.sql", "utf-8");
  const statements = migration.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    console.log("Applying:", stmt.slice(0, 60).replace(/\n/g, " "), "...");
    await sql.query(stmt);
  }
  console.log("Migration 0001 complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
