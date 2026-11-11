process.loadEnvFile();
const BASE = "http://localhost:3200";
// 注册临时买家
const email = `dbgcta${Date.now()}@test.com`;
const reg = await fetch(`${BASE}/api/trpc/auth.register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json: { email, password: "Test123456!" } }) });
const token = (await reg.json() as any)?.result?.data?.json?.token;
const msg = 'I saw "Handmade Press-on Nails" on the best-seller radar — find me matching factories and the landed cost';
const r = await fetch(`${BASE}/api/trpc/ai.chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Accept-Language": "en" }, body: JSON.stringify({ json: { message: msg, history: [], radarId: 2, locale: "en" } }) });
const j: any = await r.json();
const reply = j?.result?.data?.json?.reply ?? JSON.stringify(j).slice(0, 500);
console.log(reply);
const zh = reply.match(/[一-鿿]+/g);
console.log("\n中文残留片段:", zh);
