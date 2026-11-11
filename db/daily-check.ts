// ═══ 每日巡检哨兵：服务存活(挂了自动拉起)/额度/报错/对账 → 报告落盘 ═══
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const lines: string[] = [];
const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
lines.push(`# 每日巡检报告 ${now}\n`);

// 1) 服务存活，挂了自动拉起
let up = false;
try {
  const r = await fetch("http://localhost:3200/", { signal: AbortSignal.timeout(8000) });
  up = r.ok;
} catch {}
if (!up) {
  lines.push(`- ⚠️ 服务无响应，已自动拉起`);
  try {
    execSync(`cd /mnt/agents/output/app && (NODE_ENV=production PORT=3200 setsid nohup node dist/boot.js > server.log 2>&1 < /dev/null &) && sleep 6`);
    const r = await fetch("http://localhost:3200/", { signal: AbortSignal.timeout(8000) });
    lines.push(`- 拉起后状态：${r.ok ? "✓ 恢复" : "✗ 仍不通，需人工介入"}`);
  } catch (e) { lines.push(`- ✗ 拉起失败：${String(e).slice(0, 80)}`); }
} else lines.push(`- ✓ 服务正常`);

// 2) 万邦今日额度
const db = getDb();
const [wb]: any = await db.execute(sql`SELECT COUNT(*) c, IFNULL(SUM(cost_cny),0) cost FROM sourcing_api_logs WHERE created_at >= CURDATE() AND provider='wanbang'`);
lines.push(`- 万邦今日：${wb[0].c} 次 / ¥${Number(wb[0].cost).toFixed(2)}`);

// 3) 昨日报错
const [err]: any = await db.execute(sql`SELECT COUNT(*) c FROM sourcing_api_logs WHERE created_at >= CURDATE() - INTERVAL 1 DAY AND created_at < CURDATE() AND ok = 0`);
lines.push(`- 昨日 API 失败：${err[0].c} 次`);

// 4) 数据对账
const [pool]: any = await db.execute(sql`SELECT COUNT(*) c FROM offer_pool`);
const [fac]: any = await db.execute(sql`SELECT COUNT(*) c FROM factories`);
lines.push(`- 产品池 ${pool[0].c} 条 · 严选库 ${fac[0].c} 家`);

// 5) 点金余额（灾备）
try {
  const login = await fetch(`${process.env.DIANJIN_BASE}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: process.env.DIANJIN_USER, password: process.env.DIANJIN_PASS }), signal: AbortSignal.timeout(15000) });
  const lj: any = await login.json();
  const token = lj?.data?.token ?? lj?.token;
  const pr = await fetch(`${process.env.DIANJIN_BASE}/api/user/profile`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  const pj: any = await pr.json();
  lines.push(`- 点金灾备余额：${pj?.data?.points}（约 ${Math.floor(Number(pj?.data?.points) / 0.28)} 次）`);
} catch { lines.push(`- ⚠️ 点金余额查询失败`); }

mkdirSync("/mnt/agents/output/ops", { recursive: true });
const file = `/mnt/agents/output/ops/巡检-${new Date().toISOString().slice(0, 10)}.md`;
writeFileSync(file, lines.join("\n") + "\n");
console.log(lines.join("\n"));
console.log(`\n报告：${file}`);
process.exit(0);
