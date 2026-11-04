// 选词：17类目各挑8个代表性具体品类词，去重，输出清单
process.loadEnvFile();
import { LEXICON } from "../contracts/lexicon.js";

const BAN = new Set(["杯","杯子","锅","笔","表","炭","面具","婚庆","圣诞","万圣节"]); // 过泛/节日性词不扫
const picked: string[] = [];
for (const [cat, def] of Object.entries(LEXICON)) {
  const cand = [...new Set(def.products)]
    .filter(w => w.length >= 2 && !BAN.has(w))
    // 优先3-5字的具体词（信息量大、搜出来更精准），再取2字词
    .sort((a, b) => {
      const sa = a.length >= 3 && a.length <= 5 ? 0 : 1;
      const sb = b.length >= 3 && b.length <= 5 ? 0 : 1;
      return sa - sb || a.length - b.length;
    });
  const take: string[] = [];
  for (const w of cand) {
    if (take.length >= 8) break;
    if (!picked.includes(w) && !take.includes(w)) take.push(w);
  }
  picked.push(...take);
  console.log(`${cat}: ${take.join("、")}`);
}
console.log(`\n合计 ${picked.length} 个词`);
console.log(JSON.stringify(picked));
