// 端到端：真实对话问工厂底细，验证 factoryCard 话术 + ?thread= 回放
const BASE = "http://localhost:3200";
const login = await fetch(`${BASE}/api/trpc/auth.login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json: { email: "m4atest1794109068991@test.com", password: "Test1234!" } }) });
const cookie = login.headers.get("set-cookie") || "";
async function chat(message: string, history: any[], threadId?: number) {
  const r = await fetch(`${BASE}/api/trpc/ai.chat`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ json: { message, history, locale: "zh", threadId } }) });
  const j: any = await r.json();
  return j?.result?.data?.json ?? j?.error;
}
const t0 = Date.now();
const r1 = await chat("我要瑜伽裤 500 件发美国", []);
console.log(`--- 第一轮(${(Date.now()-t0)/1000}s) thread=${r1.threadId} factories=${r1.factories?.length}`);
console.log(r1.reply?.slice(0, 200));
const t1 = Date.now();
const r2 = await chat("排第一这家工厂靠不靠谱？多少人、多大厂房？", [{ role: "user", content: "瑜伽裤 500 件发美国" }, { role: "assistant", content: r1.reply }], r1.threadId);
console.log(`--- 第二轮(${(Date.now()-t1)/1000}s)`);
console.log(r2.reply);
console.log("THREAD_ID=" + r1.threadId);
process.exit(0);
