// 全量 tags 恢复：所有 cards_checked_at 非空的厂（341家），与 11-01 备份取并集（默认 dry-run）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";

const EXECUTE = process.argv.includes("--execute");
const db = getDb();
const backup: any[] = JSON.parse(fs.readFileSync("/mnt/agents/output/严选工厂数据库备份/factories.json", "utf8"));
const byMid = new Map<string, string[]>();
const byName = new Map<string, string[] | "DUP">();
for (const b of backup) {
  const t = Array.isArray(b.tags) ? b.tags.map(String) : [];
  if (b.memberId) byMid.set(b.memberId, t);
  if (b.name) { if (byName.has(b.name)) byName.set(b.name, "DUP"); else byName.set(b.name, t); }
}

const [rows]: any = await db.execute(sql`SELECT id, name, member_id, tags FROM factories WHERE cards_checked_at IS NOT NULL`);
console.log(`采集过的厂共 ${rows.length} 家`);
let damaged = 0, restored = 0;
for (const f of rows) {
  let cur: string[] = [];
  if (Array.isArray(f.tags)) cur = f.tags.map(String);
  else { try { cur = JSON.parse(f.tags ?? "[]"); } catch { cur = []; } }
  let pre: string[] | null = byMid.get(f.member_id) ?? null;
  if (!pre) { const n = byName.get(f.name); pre = n && n !== "DUP" ? n : null; }
  if (!pre) continue;
  const missing = pre.filter((t) => !cur.includes(t));
  if (missing.length) {
    damaged++;
    if (damaged <= 5) console.log(`[受损] #${f.id} ${f.name.slice(0, 14)} 缺=${JSON.stringify(missing)}`);
    if (EXECUTE) { await db.execute(sql`UPDATE factories SET tags=${JSON.stringify([...cur, ...missing])} WHERE id=${f.id}`); restored++; }
  }
}
console.log(`受损 ${damaged} 家${EXECUTE ? `，已恢复 ${restored}` : "（dry-run）"}`);
process.exit(0);
