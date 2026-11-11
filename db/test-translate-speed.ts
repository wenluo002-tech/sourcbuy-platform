import { translateTexts } from "../api/lib/translate";
const samples = Array.from({ length: 20 }, (_, i) => `E0${i % 9 + 1}浮生若梦 · 袋装【${["M", "S", "XS"][i % 3]}】无工具包`);
const t0 = Date.now();
const map = await translateTexts(samples, "en");
console.log(`20 条耗时 ${Date.now() - t0}ms，命中 ${Object.keys(map).length}/20`);
console.log("样例:", map[samples[0]] ?? "(未翻)");
process.exit(0);
