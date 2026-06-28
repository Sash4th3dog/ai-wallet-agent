import dotenv from "dotenv";
dotenv.config();

export const CONFIG = {
  RPC_HTTP: process.env.RPC_HTTP,
  RPC_WS: process.env.RPC_WS,
  DB_PATH: process.env.DB_PATH || "./pumpfun.db",

  PUMPFUN_PROGRAM_ID: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
};
