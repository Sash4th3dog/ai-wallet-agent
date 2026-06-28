import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { CONFIG } from "./config.js";

export const db = new Database(CONFIG.DB_PATH);

const migrationsDir = path.resolve("./src/migrations");

db.exec(`
CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER
);
`);

function runMigrations() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const alreadyApplied = db
      .prepare("SELECT id FROM migrations WHERE id = ?")
      .get(file);

    if (alreadyApplied) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

    const transaction = db.transaction(() => {
      db.exec(sql);

      db.prepare(`
        INSERT INTO migrations (id, applied_at)
        VALUES (?, ?)
      `).run(file, Math.floor(Date.now() / 1000));
    });

    transaction();

    console.log(`Migration applied: ${file}`);
  }
}

runMigrations();
