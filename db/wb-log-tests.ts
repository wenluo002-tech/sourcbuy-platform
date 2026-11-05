// 把 6 次直连测试补记进台账（绕过适配层的 curl/tsx 测试也要记账，保持与万邦控制台对账一致）
import { loadEnvFile } from "node:process";
try { loadEnvFile(); } catch {}
import { getDb } from "../api/queries/connection";
import { sourcingApiLogs } from "./schema";

const rows = [
  { provider: "wanbang", endpoint: "item_get", offerId: "1033711780757", query: "接口开通核验", costCny: "0.0500", ok: true, durationMs: 8206 },
  { provider: "wanbang", endpoint: "item_search", query: "接口开通核验 q=女装", costCny: "0.0220", ok: true, durationMs: 5786 },
  { provider: "wanbang", endpoint: "item_fee", offerId: "577523351572", query: "接口开通核验", costCny: "0.0220", ok: true, durationMs: 1028 },
  { provider: "wanbang", endpoint: "item_search_factory", query: "接口开通核验 q=衣服", costCny: "0.0220", ok: true, durationMs: 3175 },
  { provider: "wanbang", endpoint: "item_get_app", offerId: "1094419101666", query: "接口开通核验", costCny: "0.0500", ok: true, durationMs: 8481 },
  { provider: "wanbang", endpoint: "item_search_factory", query: "接口开通核验-结构复查 q=衣服", costCny: "0.0220", ok: true, durationMs: 0 },
] as const;

const db = getDb();
for (const r of rows) await db.insert(sourcingApiLogs).values(r as any);
console.log("logged", rows.length);
process.exit(0);
