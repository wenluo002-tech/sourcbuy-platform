// tags 误覆盖恢复：对比 11-01 备份 pre-tags 与当前 tags，取并集恢复（默认 dry-run）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import fs from "fs";

const EXECUTE = process.argv.includes("--execute");
const db = getDb();

// 1. 昨天入库的 197 家
const lines = fs.readFileSync("/mnt/agents/upload/批次_0101-0200(2).jsonl", "utf8").split("\n").filter((l) => l.trim());
const recs = lines.map((l) => JSON.parse(l)).filter((r) => r.matched);

// 2. 11-01 备份索引：memberId + name（同名跳过）
const backup: any[] = JSON.parse(fs.readFileSync("/mnt/agents/output/严选工厂数据库备份/factories.json", "utf8"));
const byMid = new Map<string, string[]>();
const byName = new Map<string, string[] | "DUP">();
for (const b of backup) {
  const t = Array.isArray(b.tags) ? b.tags.map(String) : [];
  if (b.memberId) byMid.set(b.memberId, t);
  if (b.name) {
    if (byName.has(b.name)) byName.set(b.name, "DUP");
    else byName.set(b.name, t);
  }
}

let damaged = 0, restored = 0, noBackup = 0;
for (const rec of recs) {
  const id = Number(rec.id);
  const [rows]: any = await db.execute(sql`SELECT id, name, member_id, tags FROM factories WHERE id=${id} LIMIT 1`);
  const f = rows?.[0];
  if (!f) continue;
  // 当前 tags（mysql2 双形态）
  let cur: string[] = [];
  if (Array.isArray(f.tags)) cur = f.tags.map(String);
  else { try { cur = JSON.parse(f.tags ?? "[]"); } catch { cur = []; } }
  // 备份 pre-tags：memberId 优先，name 兜底（同名跳过）
  let pre: string[] | null = byMid.get(f.member_id) ?? null;
  if (!pre) { const n = byName.get(f.name); pre = n && n !== "DUP" ? n : null; }
  if (!pre) { noBackup++; continue; }
  const missing = pre.filter((t) => !cur.includes(t));
  if (missing.length) {
    damaged++;
    const merged = [...cur, ...missing];
    if (damaged <= 8) console.log(`[受损] #${id} ${f.name.slice(0, 14)} 当前=${JSON.stringify(cur)} 备份=${JSON.stringify(pre)} → 恢复=${JSON.stringify(merged)}`);
    if (EXECUTE) {
      await db.execute(sql`UPDATE factories SET tags=${JSON.stringify(merged)} WHERE id=${id}`);
      restored++;
    }
  }
}
console.log(`\n197 家中：受损 ${damaged} 家${EXECUTE ? `，已恢复 ${restored}` : "（dry-run 未写）"}，备份查不到 ${noBackup} 家`);
process.exit(0);
