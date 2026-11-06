process.loadEnvFile();
const BASE = "http://localhost:3200";
async function chat(message: string, locale?: string) {
  const r = await fetch(`${BASE}/api/trpc/ai.chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { message, history: [], locale } }),
    signal: AbortSignal.timeout(60000),
  });
  const j: any = await r.json();
  return j?.result?.data?.json;
}
(async () => {
  const r = await chat("帮我找中山的灯饰工厂，500件吊灯，发美国");
  console.log("═══ 中文：中山灯饰 ═══");
  console.log("话术:", String(r?.reply ?? "").slice(0, 350));
  for (const f of (r?.factories ?? [])) console.log(`  ${f.name} | ${f.location} | ${f.score}分 | ${f.matchBasis}`);
  const r2 = await chat("Find me lighting factories in Zhongshan, 500 pcs pendant lamps, ship to US", "en");
  console.log("\n═══ 英文：Zhongshan lighting ═══");
  console.log("话术:", String(r2?.reply ?? "").slice(0, 250));
  for (const f of (r2?.factories ?? [])) console.log(`  ${f.name} | ${f.location} | ${f.score}分 | ${f.matchBasis}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
