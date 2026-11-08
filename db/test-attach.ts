// v66-hotfix 回归：附件按钮在手机/桌面双端必须真实弹出文件选择器并全链路工作
/// <reference lib="dom" />
import { chromium, devices } from "playwright-core";
import { writeFileSync } from "fs";

// 造测试文件：一个小 PDF + 一个小 PNG
writeFileSync("/tmp/test-drawing.pdf", Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"));
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFklEQVQYV2P8z8AARQwMDAxMDEAMAwAHWwID9/Hl3wAAAABJRU5ErkJggg==", "base64");
writeFileSync("/tmp/test-photo.png", png);

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] });
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " | " + extra : ""}`); cond ? pass++ : fail++; };

// ===== 手机端（Pixel 7 仿真）=====
const mob = await browser.newContext({ ...devices["Pixel 7"], locale: "zh-CN" });
const mp = await mob.newPage();

// M1: 首页点附件 → 必须弹文件选择器
await mp.goto("http://localhost:3200/", { waitUntil: "domcontentloaded", timeout: 30000 });
await mp.waitForTimeout(2000);
const fc1 = mp.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
await mp.click('label[for="home-attach"]');
const chooser1 = await fc1;
ok("M1 手机端首页附件按钮弹出文件选择器", !!chooser1);

// M2: 选 PDF → 跳转 /buyer + 图纸 chip 出现
if (chooser1) {
  await chooser1.setFiles("/tmp/test-drawing.pdf");
  await mp.waitForURL("**/buyer**", { timeout: 8000 }).catch(() => null);
  await mp.waitForTimeout(1500);
  const url = mp.url();
  const chip = await mp.textContent("body");
  ok("M2 手机端选 PDF 后跳转对话页", url.includes("/buyer"), url);
  ok("M3 对话页出现图纸就绪 chip（48h 人工核价）", !!chip && chip.includes("test-drawing.pdf") && chip.includes("48"));
}

// M4: 对话页附件按钮也弹选择器（图片）
const fc2 = mp.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
await mp.click('label[for="chat-attach"]');
const chooser2 = await fc2;
ok("M4 手机端对话页附件按钮弹出文件选择器", !!chooser2);
if (chooser2) {
  await chooser2.setFiles("/tmp/test-photo.png");
  await mp.waitForTimeout(1500);
  const chip2 = await mp.textContent("body");
  ok("M5 手机端选图片后出现图片 chip", !!chip2 && chip2.includes("已就绪"), (chip2 ?? "").slice(0, 0));
}

// M6: 发送图纸消息 → AI 回 48h 人工核价话术
await mp.click('button:has-text("发送")');
await mp.waitForTimeout(6000);
const convo = await mp.textContent("body");
ok("M6 图纸消息触发 48h 人工核价话术", !!convo && convo.includes("48") && convo.includes("人工核价"));
await mp.screenshot({ path: "/tmp/v66fix-mobile.png" });

// ===== 桌面端 =====
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-CN" });
const dp = await desk.newPage();
await dp.goto("http://localhost:3200/", { waitUntil: "domcontentloaded", timeout: 30000 });
await dp.waitForTimeout(1500);
const fc3 = dp.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
await dp.click('label[for="home-attach"]');
const chooser3 = await fc3;
ok("D1 桌面端首页附件按钮弹出文件选择器", !!chooser3);
if (chooser3) {
  await chooser3.setFiles("/tmp/test-photo.png");
  await dp.waitForURL("**/buyer**", { timeout: 8000 }).catch(() => null);
  await dp.waitForTimeout(1500);
  ok("D2 桌面端选图片后跳转对话页", dp.url().includes("/buyer"), dp.url());
  const chip3 = await dp.textContent("body");
  ok("D3 桌面端图片 chip 出现", !!chip3 && chip3.includes("已就绪"));
}
// D4: 探测当前引擎是否真的暴露 SpeechRecognition（Chromium 可能暴露构造器但服务不可用）
const hasSR = await dp.evaluate(() => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
const voiceBtns = await dp.$$('button[title="语音输入"], button[title="Voice input"]');
ok("D4 语音按钮渲染与 SpeechRecognition 可用性一致", voiceBtns.length === (hasSR ? 1 : 0), `hasSR=${hasSR} btns=${voiceBtns.length}`);

console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
await browser.close();
process.exit(fail ? 1 : 0);
