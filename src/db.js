import Database from "better-sqlite3";
import { CONFIG } from "./config.js";

export const db = new Database(CONFIG.DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS launches (
  mint TEXT PRIMARY KEY,
  creator TEXT,
  bonding_curve TEXT,
  associated_bonding_curve TEXT,
  signature TEXT,
  slot INTEGER,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature TEXT,
  wallet TEXT,
  mint TEXT,
  side TEXT,
  sol_amount REAL,
  token_amount REAL,
  slot INTEGER,
  timestamp INTEGER,
  token_age_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_trades_mint ON trades(mint);
CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet);
`);
