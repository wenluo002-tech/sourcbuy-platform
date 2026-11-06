// 演示链路实测：中山书记场景——搜"LED灯/灯饰"（中山古镇灯饰产业带）
process.loadEnvFile();
const BASE = "http://localhost:3200";
async function chat(message: string) {
  const r = await fetch(`${BASE}/api/trpc/ai.chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ json: { message, history: [] } }),
    signal: AbortSignal.timeout(60000),
  });
  const j: any = await r.json();
  return j?.result?.data?.json;
}
(async () => {
  // 场景1：中文搜灯饰（中山最硬产业带）
  const r1 = await chat("帮我找LED台灯的源头工厂，500件，发美国");
  console.log("═══ 场景1: LED台灯 500件发美国 ═══");
  console.log("话术:", String(r1?.reply ?? "").slice(0, 400));
  const fs1 = r1?.factories ?? [];
  console.log(`\n推荐厂 ${fs1.length} 家:`);
  for (const f of fs1) console.log(`  ${f.name} | ${f.location} | ${f.score}分 | ${f.matchBasis ?? ""}`);
  const zs = fs1.filter((f: any) => String(f.location).includes("中山"));
  console.log(`其中中山厂: ${zs.length} 家`);
  // 场景2：英文搜 desk lamp（演示英文版）
  const r2 = await chat("I need a desk lamp factory, 500 pcs, ship to the US");
  console.log("\n═══ 场景2: 英文 desk lamp ═══");
  console.log("话术:", String(r2?.reply ?? "").slice(0, 300));
  console.log("产品数:", (r2?.products ?? []).length, "| 工厂数:", (r2?.factories ?? []).length);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
