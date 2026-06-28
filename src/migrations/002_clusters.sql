CREATE TABLE IF NOT EXISTS cluster_wallets (
  wallet TEXT PRIMARY KEY,
  cluster_id TEXT,
  role TEXT,
  weight REAL,
  confidence INTEGER,
  enabled INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_cluster_wallets_cluster
ON cluster_wallets(cluster_id);

CREATE TABLE IF NOT EXISTS cluster_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cluster_id TEXT,
  mint TEXT,
  score INTEGER,
  buyers_count INTEGER,
  total_sol REAL,
  first_buy_time INTEGER,
  last_buy_time INTEGER,
  token_age_seconds INTEGER,
  created_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_cluster_alerts_mint
ON cluster_alerts(mint);
