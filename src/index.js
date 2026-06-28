import { Connection, PublicKey } from "@solana/web3.js";
import { CONFIG } from "./config.js";
import { db } from "./db.js";
import { detectLaunch, detectTrade } from "./pumpParser.js";

const connection = new Connection(CONFIG.RPC_HTTP, {
  wsEndpoint: CONFIG.RPC_WS,
  commitment: "confirmed"
});

const pumpProgram = new PublicKey(CONFIG.PUMPFUN_PROGRAM_ID);

console.log("Pump.fun Collector iniciado");
console.log("Program:", CONFIG.PUMPFUN_PROGRAM_ID);

async function getParsedTx(signature) {
  return await connection.getParsedTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed"
  });
}

function saveLaunch({ mint, creator, bondingCurve, associatedBondingCurve, signature, slot }) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO launches
    (mint, creator, bonding_curve, associated_bonding_curve, signature, slot, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    mint,
    creator,
    bondingCurve,
    associatedBondingCurve,
    signature,
    slot,
    Math.floor(Date.now() / 1000)
  );
}

function saveTrade({ signature, wallet, mint, side, solAmount, tokenAmount, slot }) {
  const launch = db.prepare(`SELECT created_at FROM launches WHERE mint = ?`).get(mint);
  const now = Math.floor(Date.now() / 1000);

  const age = launch ? now - launch.created_at : null;

  const stmt = db.prepare(`
    INSERT INTO trades
    (signature, wallet, mint, side, sol_amount, token_amount, slot, timestamp, token_age_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    signature,
    wallet,
    mint,
    side,
    solAmount,
    tokenAmount,
    slot,
    now,
    age
  );
}

function extractAccounts(tx) {
  return tx.transaction.message.accountKeys.map((a) => a.pubkey.toBase58());
}

function roughParseLaunch(tx) {
  const accounts = extractAccounts(tx);

  return {
    creator: accounts[0] || null,
    mint: accounts.find((a) => a.endsWith("pump")) || null,
    bondingCurve: accounts[3] || null,
    associatedBondingCurve: accounts[4] || null
  };
}

function roughParseTrade(tx) {
  const accounts = extractAccounts(tx);

  return {
    wallet: accounts[0] || null,
    mint: accounts.find((a) => a.endsWith("pump")) || null,
    solAmount: null,
    tokenAmount: null
  };
}

connection.onLogs(
  pumpProgram,
  async (event) => {
    try {
      const { signature, logs, err } = event;
      if (err) return;

      const isLaunch = detectLaunch(logs);
      const tradeSide = detectTrade(logs);

      if (!isLaunch && !tradeSide) return;

      const tx = await getParsedTx(signature);
      if (!tx) return;

      if (isLaunch) {
        const parsed = roughParseLaunch(tx);

        if (!parsed.mint) return;

        saveLaunch({
          ...parsed,
          signature,
          slot: tx.slot
        });

        console.log("NEW LAUNCH", parsed.mint, "creator:", parsed.creator);
      }

      if (tradeSide) {
        const parsed = roughParseTrade(tx);

        if (!parsed.mint) return;

        saveTrade({
          ...parsed,
          side: tradeSide,
          signature,
          slot: tx.slot
        });

        console.log(
          tradeSide.toUpperCase(),
          parsed.mint,
          "wallet:",
          parsed.wallet
        );
      }
    } catch (e) {
      console.error("Collector error:", e.message);
    }
  },
  "confirmed"
);
