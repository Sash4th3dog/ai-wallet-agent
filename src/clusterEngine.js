import fs from "fs";
import path from "path";
import { db } from "./db.js";

const CLUSTER_PATH = path.resolve("./data/clusterWallets.json");

const SETTINGS = {
  windowSeconds: 300,
  maxTokenAgeSeconds: 300,
  minBuyers: 2,
  minScore: 70,
  reloadClustersEveryMs: 30_000
};

let walletIndex = new Map();
let lastLoadedAt = 0;

function tierWeight(tier) {
  if (tier === "S") return 40;
  if (tier === "A") return 30;
  if (tier === "B") return 20;
  return 10;
}

function loadClusters() {
  const now = Date.now();

  if (walletIndex.size > 0 && now - lastLoadedAt < SETTINGS.reloadClustersEveryMs) {
    return walletIndex;
  }

  const raw = fs.readFileSync(CLUSTER_PATH, "utf8");
  const data = JSON.parse(raw);

  const nextIndex = new Map();

  for (const cluster of data.clusters) {
    if (!cluster.enabled) continue;

    for (const wallet of cluster.wallets) {
      nextIndex.set(wallet.address, {
        clusterId: cluster.id,
        clusterName: cluster.name,
        clusterTier: cluster.tier,
        walletRole: wallet.role || "member",
        walletWeight: wallet.weight ?? 1,
        confidence: wallet.confidence ?? 50
      });
    }
  }

  walletIndex = nextIndex;
  lastLoadedAt = now;

  console.log(`Cluster index loaded: ${walletIndex.size} wallets`);

  return walletIndex;
}

function getWalletCluster(walletAddress) {
  const index = loadClusters();
  return index.get(walletAddress) || null;
}

function calculateScore({ clusterInfo, buyersCount, totalSol, tokenAgeSeconds }) {
  let score = 0;

  score += tierWeight(clusterInfo.clusterTier);
  score += Math.round((clusterInfo.walletWeight || 1) * 10);
  score += Math.round((clusterInfo.confidence || 50) / 10);

  if (buyersCount >= 2) score += 25;
  if (buyersCount >= 3) score += 20;
  if (buyersCount >= 5) score += 25;

  if (tokenAgeSeconds !== null) {
    if (tokenAgeSeconds <= 30) score += 30;
    else if (tokenAgeSeconds <= 120) score += 20;
    else if (tokenAgeSeconds <= 300) score += 10;
  }

  if (totalSol >= 1) score += 10;
  if (totalSol >= 5) score += 20;
  if (totalSol >= 10) score += 30;

  return Math.min(score, 100);
}

function getRecentClusterBuys({ clusterId, mint }) {
  const now = Math.floor(Date.now() / 1000);
  const since = now - SETTINGS.windowSeconds;

  return db.prepare(`
    SELECT *
    FROM trades
    WHERE side = 'buy'
      AND mint = ?
      AND timestamp >= ?
      AND wallet IN (
        SELECT wallet
        FROM cluster_wallets
        WHERE cluster_id = ?
      )
    ORDER BY timestamp ASC
  `).all(mint, since, clusterId);
}

function alertAlreadyExists(clusterId, mint) {
  return db.prepare(`
    SELECT id
    FROM cluster_alerts
    WHERE cluster_id = ?
      AND mint = ?
    LIMIT 1
  `).get(clusterId, mint);
}

function saveAlert(alert) {
  db.prepare(`
    INSERT INTO cluster_alerts
    (
      cluster_id,
      mint,
      score,
      buyers_count,
      total_sol,
      first_buy_time,
      last_buy_time,
      token_age_seconds,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    alert.clusterId,
    alert.mint,
    alert.score,
    alert.buyersCount,
    alert.totalSol,
    alert.firstBuyTime,
    alert.lastBuyTime,
    alert.tokenAgeSeconds,
    Math.floor(Date.now() / 1000)
  );
}

export function processTradeForCluster(trade) {
  if (trade.side !== "buy") return null;

  const clusterInfo = getWalletCluster(trade.wallet);
  if (!clusterInfo) return null;

  if (
    trade.tokenAgeSeconds !== null &&
    trade.tokenAgeSeconds > SETTINGS.maxTokenAgeSeconds
  ) {
    return null;
  }

  const buys = getRecentClusterBuys({
    clusterId: clusterInfo.clusterId,
    mint: trade.mint
  });

  const uniqueBuyers = new Set(buys.map((b) => b.wallet));
  const buyersCount = uniqueBuyers.size;

  const totalSol = buys.reduce((sum, b) => {
    return sum + Number(b.sol_amount || 0);
  }, 0);

  const firstBuyTime = buys[0]?.timestamp || trade.timestamp;
  const lastBuyTime = buys[buys.length - 1]?.timestamp || trade.timestamp;

  const score = calculateScore({
    clusterInfo,
    buyersCount,
    totalSol,
    tokenAgeSeconds: trade.tokenAgeSeconds
  });

  if (buyersCount < SETTINGS.minBuyers && score < SETTINGS.minScore) {
    return null;
  }

  if (alertAlreadyExists(clusterInfo.clusterId, trade.mint)) {
    return null;
  }

  const alert = {
    clusterId: clusterInfo.clusterId,
    clusterName: clusterInfo.clusterName,
    mint: trade.mint,
    score,
    buyersCount,
    totalSol,
    firstBuyTime,
    lastBuyTime,
    tokenAgeSeconds: trade.tokenAgeSeconds
  };

  saveAlert(alert);

  return alert;
}
