// Applies committed SQL migrations using the owner connection string.
// Usage: DATABASE_URL=... npm run db:migrate
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";
import ws from "ws";
import { fileURLToPath } from "node:url";

neonConfig.webSocketConstructor = ws;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (use the owner role, never the Worker role).");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
const db = drizzle(pool);
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../migrations", import.meta.url)) });
await pool.end();
console.log("Migrations applied.");
