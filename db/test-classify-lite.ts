import { classifyLite } from "../api/lib/classifyLite";
const cases: [string, string][] = [
  ["叫我文哥", "light"],
  ["你好", "light"],
  ["谢谢", "light"],
  ["你是真人吗", "light"],
  ["瑜伽裤", "sourcing"],
  ["瑜伽裤 500 条，发德国", "sourcing"],
  ["蓝牙耳机，先寄样品看看质量", "sourcing"],
  ["这个多少钱", "sourcing"],
  ["bluetooth earphones 500pcs", "sourcing"],
  ["货呢", "light"],
  ["马桶", "sourcing"],
];
let fail = 0;
for (const [msg, want] of cases) {
  const got = classifyLite(msg);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"} "${msg}" → ${got} (want ${want})`);
}
console.log(fail === 0 ? "ALL PASS" : `${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
