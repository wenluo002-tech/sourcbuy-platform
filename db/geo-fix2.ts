// 合并批后的地区回填：province 为空但 location 非空的行，按 GEO 表重查（含连写形态 normalize）
process.loadEnvFile();
import { getDb } from "../api/queries/connection";
import { sql } from "drizzle-orm";
import { GEO } from "./geo-map";

const PROVS = ["浙江","广东","河北","山东","江苏","福建","河南","辽宁","陕西","湖南","湖北","安徽","江西","四川","广西","云南","山西","贵州","海南","吉林","黑龙江","甘肃","内蒙古","新疆","宁夏","青海","西藏","北京","上海","天津","重庆"];

function resolve(loc: string): [string, string | null, string | null] | null {
  const strip = (s: string) => s.replace(/(市|县|区)$/, "");
  const tries = [loc, strip(loc), loc + "市"];
  for (const p of PROVS) if (loc.startsWith(p) && loc.length > p.length) { const rest = loc.slice(p.length); tries.push(rest, strip(rest), rest + "市"); }
  for (const t of tries) { const g = GEO[t]; if (g) return g; }
  return null;
}

async function main() {
  const db = getDb();
  const [rows] = (await db.execute(sql`
    SELECT id, location FROM factories
    WHERE (province IS NULL OR province = '') AND location IS NOT NULL AND location != ''`)) as any;
  let hit = 0;
  const miss = new Map<string, number>();
  for (const r of rows as any[]) {
    const g = resolve(String(r.location).trim());
    if (g) {
      await db.execute(sql`UPDATE factories SET province=${g[0]}, city=${g[1]}, district=${g[2]} WHERE id=${r.id}`);
      hit++;
    } else miss.set(r.location, (miss.get(r.location) ?? 0) + 1);
  }
  console.log(`地区回填: ${hit}/${(rows as any[]).length}`);
  const top = [...miss.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  if (top.length) console.log("仍 miss TOP15:", JSON.stringify(top));
  process.exit(0);
}
main();
