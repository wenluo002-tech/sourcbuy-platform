process.loadEnvFile();
const BASE = process.env.DIANJIN_BASE ?? "http://38.207.179.41:8256";
const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: process.env.DIANJIN_USER, password: process.env.DIANJIN_PASS }),
  signal: AbortSignal.timeout(20000),
});
const lj: any = await login.json();
const token = lj?.data?.token ?? lj?.token;
console.log("login ok:", !!token);
for (const path of ["/api/user/info", "/api/user/profile", "/api/user/me", "/api/user/balance", "/api/user"] ) {
  try {
    const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    const t = await r.text();
    if (r.ok && t.length < 2000) console.log(path, "→", t.slice(0, 300));
    else console.log(path, "→ HTTP", r.status);
  } catch (e: any) { console.log(path, "→ err", String(e?.message).slice(0, 50)); }
}
process.exit(0);
