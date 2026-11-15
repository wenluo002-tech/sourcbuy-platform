/* 图片本地化管线（2026-11-15 罗总批准 ¥21 预算；实际自托管零边际成本）
   根治权益锁图片旁路 + 摆脱上游防盗链/死图依赖：
   - 下载 offer_pool.image / factories.images / radar_items.image_url / offers.images+spec_images 里的上游图床 URL
   - 存 uploads/img/{sha1(url)}.{ext}（内容寻址、幂等、断点续跑：文件已存在即跳过）
   - 下载成功且文件核验在盘后，才把 DB 里的 URL 改写为 /api/img/local/{name}（只换已落盘的，绝不产生死链）
   用法：npx tsx db/localize-images.ts            # dry-run 只统计
        npx tsx db/localize-images.ts --execute  # 正式执行 */
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const EXECUTE = process.argv.includes("--execute");
const OUT_DIR = path.resolve(process.cwd(), "uploads", "img");
const CONCURRENCY = Number(process.env.CONCUR || 4); // 默认 4 并发，避免挤占前台代理带宽
const TIMEOUT_MS = 8_000;
const FUSE_MAX = 60_000; // 总量熔断
const FAIL_RATIO_FUSE = 0.3; // 失败率熔断

const db = getDb();
const sha1 = (s: string) => crypto.createHash("sha1").update(s).digest("hex");
const extOf = (u: string) => {
  const m = u.match(/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
};
const localName = (u: string) => `${sha1(u)}.${extOf(u)}`;
const localPath = (u: string) => `/api/img/local/${localName(u)}`;

async function collect() {
  const urls = new Set<string>();
  const push = (u: unknown) => { if (typeof u === "string" && /^https?:\/\//i.test(u)) urls.add(u); };
  const [pool]: any = await db.execute(sql`SELECT image FROM offer_pool WHERE image LIKE 'http%'`);
  for (const r of pool) push(r.image);
  const [fac]: any = await db.execute(sql`SELECT images FROM factories WHERE images IS NOT NULL AND CHAR_LENGTH(images) > 10`);
  for (const r of fac) {
    try {
      const j = typeof r.images === "string" ? JSON.parse(r.images) : r.images;
      for (const k of Object.keys(j ?? {})) if (Array.isArray(j[k])) j[k].forEach(push);
    } catch { /* 坏 JSON 行跳过 */ }
  }
  const [radar]: any = await db.execute(sql`SELECT image_url u FROM radar_items WHERE image_url LIKE 'http%'`);
  for (const r of radar) push(r.u);
  const [ofs]: any = await db.execute(sql`SELECT images, spec_images FROM offers WHERE images IS NOT NULL OR spec_images IS NOT NULL`);
  for (const r of ofs) {
    try { (Array.isArray(r.images) ? r.images : JSON.parse(r.images ?? "[]")).forEach(push); } catch {}
    try {
      const sp = typeof r.spec_images === "string" ? JSON.parse(r.spec_images ?? "{}") : r.spec_images;
      Object.values(sp ?? {}).forEach(push);
    } catch {}
  }
  return [...urls];
}

async function downloadOne(u: string): Promise<boolean> {
  const dest = path.join(OUT_DIR, localName(u));
  if (fs.existsSync(dest) && fs.statSync(dest).size > 100) return true; // 断点续跑
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(u, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; SourcBuy-ImgLocalize/1.0)", Accept: "image/*,*/*;q=0.8" } });
      const mime = (r.headers.get("content-type") ?? "").toLowerCase();
      if (!r.ok || !mime.startsWith("image/")) return false;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 100 || buf.length > 15 * 1024 * 1024) return false;
      const part = dest + ".part"; // 先写临时文件再改名，防半截文件被断点续跑误判完成
      fs.writeFileSync(part, buf);
      fs.renameSync(part, dest);
      return true;
    } catch {
      if (attempt === 1) return false;
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

// ═══ DB 改写（只换文件已在盘的 URL）═══
async function rewriteDb() {
  const has = (u: string) => fs.existsSync(path.join(OUT_DIR, localName(u)));
  // offer_pool.image
  const [poolRows]: any = await db.execute(sql`SELECT offer_id, image FROM offer_pool WHERE image LIKE 'http%'`);
  let n = 0;
  const pairs: { id: string; v: string }[] = [];
  for (const r of poolRows) if (has(r.image)) pairs.push({ id: String(r.offer_id), v: localPath(r.image) });
  for (let i = 0; i < pairs.length; i += 200) {
    const chunk = pairs.slice(i, i + 200);
    await db.execute(sql`UPDATE offer_pool SET image = CASE offer_id ${sql.join(chunk.map((p) => sql`WHEN ${p.id} THEN ${p.v}`), sql` `)} END WHERE offer_id IN (${sql.join(chunk.map((p) => sql`${p.id}`), sql`,`)})`);
    n += chunk.length;
  }
  console.log(`[rewrite] offer_pool ${n} 行`);
  // radar_items.image_url
  const [radarRows]: any = await db.execute(sql`SELECT id, image_url u FROM radar_items WHERE image_url LIKE 'http%'`);
  let rn = 0;
  for (const r of radarRows) if (has(r.u)) { await db.execute(sql`UPDATE radar_items SET image_url=${localPath(r.u)} WHERE id=${r.id}`); rn++; }
  console.log(`[rewrite] radar_items ${rn} 行`);
  // factories.images（JSON 逐行读写）
  const [facRows]: any = await db.execute(sql`SELECT id, images FROM factories WHERE images IS NOT NULL AND CHAR_LENGTH(images) > 10 AND images NOT LIKE '%/api/img/local/%'`);
  let fn = 0;
  for (const r of facRows) {
    try {
      const j = typeof r.images === "string" ? JSON.parse(r.images) : r.images;
      let changed = false;
      for (const k of Object.keys(j ?? {})) {
        if (!Array.isArray(j[k])) continue;
        j[k] = j[k].map((u: string) => { if (/^https?:\/\//i.test(u) && has(u)) { changed = true; return localPath(u); } return u; });
      }
      if (changed) { await db.execute(sql`UPDATE factories SET images=${JSON.stringify(j)} WHERE id=${r.id}`); fn++; }
    } catch { /* 坏行跳过 */ }
    if (fn % 500 === 0 && fn > 0) console.log(`[rewrite] factories 已 ${fn} 行…`);
  }
  console.log(`[rewrite] factories ${fn} 行`);
  // offers.images / spec_images
  const [ofRows]: any = await db.execute(sql`SELECT id, images, spec_images FROM offers`);
  let on = 0;
  for (const r of ofRows) {
    try {
      let changed = false;
      let imgs: any = typeof r.images === "string" ? JSON.parse(r.images ?? "[]") : r.images;
      if (Array.isArray(imgs)) { const nw = imgs.map((u: string) => (/^https?:\/\//i.test(u) && has(u) ? (changed = true, localPath(u)) : u)); if (changed) imgs = nw; }
      let sp: any = typeof r.spec_images === "string" ? JSON.parse(r.spec_images ?? "{}") : r.spec_images;
      if (sp && typeof sp === "object") for (const k of Object.keys(sp)) { const u = sp[k]; if (typeof u === "string" && /^https?:\/\//i.test(u) && has(u)) { sp[k] = localPath(u); changed = true; } }
      if (changed) { await db.execute(sql`UPDATE offers SET images=${JSON.stringify(imgs)}, spec_images=${JSON.stringify(sp ?? {})} WHERE id=${r.id}`); on++; }
    } catch {}
  }
  console.log(`[rewrite] offers ${on} 行`);
}

// ═══ 主流程 ═══
const urls = await collect();
console.log(`待本地化 URL 去重后 ${urls.length} 条`);
if (!EXECUTE) { console.log("dry-run，未下载未改写。--execute 正式执行。"); process.exit(0); }
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const f of fs.readdirSync(OUT_DIR)) if (f.endsWith(".part")) fs.rmSync(path.join(OUT_DIR, f), { force: true }); // 清理上次中断残留

let done = 0, ok = 0, fail = 0;
const queue = [...urls];
async function worker() {
  while (queue.length) {
    const u = queue.shift()!;
    if (done >= FUSE_MAX) return;
    const good = await downloadOne(u);
    done++; good ? ok++ : fail++;
    if (done >= 1000 && fail / done > FAIL_RATIO_FUSE) { console.log(`[熔断] 失败率 ${(fail / done * 100).toFixed(0)}% 超阈值，停止`); queue.length = 0; return; }
    if (done % 1000 === 0) console.log(`[progress] ${done}/${urls.length} ok=${ok} fail=${fail}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`下载完成：ok=${ok} fail=${fail}`);
// DB 改写默认关闭（REWRITE=1 才执行）：代理层已做磁盘读穿，本地文件先生效于代理缓存；
// 待确认发布环境能服务 /api/img/local/* 后再开改写，避免发布站 404
if (process.env.REWRITE === "1") { await rewriteDb(); } else { console.log("跳过 DB 改写（REWRITE=1 开启）"); }
const disk = fs.readdirSync(OUT_DIR).length;
console.log(`[完成] 本地图片文件 ${disk} 个`);
process.exit(0);
