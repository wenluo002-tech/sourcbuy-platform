import { expandQuery } from "../contracts/lexicon";
const kws = ["植绒衣架","穿戴甲","一次性洗脸巾","LED头灯","融蜡灯","宠物尿垫","痘痘贴","床品四件套","法兰绒毛毯","电动奶泡器","防水床笠","暖宝宝","瑜伽垫","阻力带","卡膜","急救毯","宠物湿巾","插排","加湿器","食品温度计","圣诞灯","滑雪面罩","无热卷发棒","露营灯"];
for (const k of kws) { const r = expandQuery(k); console.log(k, "->", r.category ?? "∅"); }
process.exit(0);
