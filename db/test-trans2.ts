process.loadEnvFile();
const { translateTexts } = await import("../api/lib/translate");
const t0 = Date.now();
const r = await translateTexts(["儿童自行车2-3岁5岁6岁9岁小孩脚踏车女孩男孩童车折叠中大童单车"], "en");
console.log(Date.now() - t0, "ms →", JSON.stringify(r));
process.exit(0);
