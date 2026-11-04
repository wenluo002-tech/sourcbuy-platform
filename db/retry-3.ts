process.loadEnvFile();
import { searchOffers } from "../api/sourcing/offerService";
for (const w of ["牛仔裤", "收纳盒", "气泡袋"]) {
  for (let i = 0; i < 2; i++) {
    try { const r = await searchOffers(w, 1); console.log(`${w} → ${r.items.length}条 (${r.source})`); break; }
    catch (e: any) { console.log(`${w} 第${i+1}次失败: ${String(e?.message).slice(0,60)}`); await new Promise(r => setTimeout(r, 3000)); }
  }
  await new Promise(r => setTimeout(r, 800));
}
process.exit(0);
