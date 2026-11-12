import type { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import fs from "fs";
import path from "path";

// geoip-lite 为可选依赖：Kimi 部署环境只带 dist/ 不带 node_modules，
// 静态 import 会让整个进程起不来（ERR_MODULE_NOT_FOUND）。动态加载，失败则 IP 兜底失效，
// 语言检测仍走 Accept-Language + 前端 navigator.language，业务无损。
let geoipLookup: ((ip: string) => { country?: string } | null) | null = null;
try {
  const mod: any = await import("geoip-lite");
  const g = mod.default ?? mod;
  if (typeof g?.lookup === "function") geoipLookup = (ip: string) => g.lookup(ip);
} catch { /* 部署环境无此包，降级即可 */ }

type App = Hono<{ Bindings: HttpBindings }>;

// 界面语言自动检测（注入 __SB_LANG_HINT__，前端 detect() 读取）：
// Accept-Language（用户浏览器自己设的语言，最准）优先；IP 归属地兜底（VPN/出差会让 IP 撒谎，所以只做兜底）。
// 多语言国家不猜（CA 英法/BE 荷法），回落默认英文。
const GEO_LANG: Record<string, string> = {
  CN: "zh", TW: "zh", HK: "zh", MO: "zh",
  ES: "es", MX: "es", AR: "es", CO: "es", CL: "es", PE: "es", VE: "es", EC: "es", UY: "es", PY: "es", BO: "es", GT: "es", DO: "es", CU: "es", PA: "es", CR: "es",
  FR: "fr", SN: "fr", CI: "fr", ML: "fr", BF: "fr", NE: "fr", TG: "fr", BJ: "fr", GA: "fr", CG: "fr", CD: "fr", CM: "fr", MG: "fr", HT: "fr", MC: "fr",
  PT: "pt", BR: "pt", AO: "pt", MZ: "pt",
};

function detectLangHint(acceptLanguage: string | undefined, ip: string | null): string | null {
  // 1) 浏览器语言头（用户自己设置的设备语言）
  const al = (acceptLanguage ?? "").toLowerCase();
  for (const code of ["zh", "es", "fr", "pt"]) {
    if (new RegExp(`(?:^|,|;)\\s*${code}(?:[-_;,]|$)`).test(al)) return code;
  }
  // 2) IP 归属地兜底（geoip 不可用时跳过）
  if (geoipLookup && ip && ip !== "127.0.0.1" && ip !== "::1") {
    try {
      const country = geoipLookup(ip)?.country;
      if (country && GEO_LANG[country]) return GEO_LANG[country];
    } catch { /* geoip 失败不阻塞 */ }
  }
  return null; // null=前端自己用 navigator.language 兜底，默认 en
}

function clientIp(headers: Record<string, string | undefined>): string | null {
  const cf = headers["cf-connecting-ip"];
  if (cf) return cf.trim();
  const xff = headers["x-forwarded-for"];
  if (xff) return xff.split(",")[0].trim();
  return null;
}

export function serveStaticFiles(app: App) {
  const distPath = path.resolve(import.meta.dirname, "../dist");
  const indexPath = path.resolve(distPath, "index.html");

  // SPA 首页渲染：读 index.html + 注入界面语言提示（Accept-Language 主、IP 归属地兜底；买家手动选择 localStorage 永远最高优先）
  const renderIndex = (c: any) => {
    let content = fs.readFileSync(indexPath, "utf-8");
    const hint = detectLangHint(c.req.header("accept-language"), clientIp({ "cf-connecting-ip": c.req.header("cf-connecting-ip"), "x-forwarded-for": c.req.header("x-forwarded-for") }));
    if (hint) {
      content = content.replace("</head>", `<script>window.__SB_LANG_HINT__=${JSON.stringify(hint)};</script></head>`);
    }
    return c.html(content);
  };

  // 后端 bundle 不可被静态服务暴露（虽无密钥也不该能下载）
  app.use("/boot.js", async (c) => c.notFound());

  // 根路径显式走 renderIndex（serveStatic 会直接命中 index.html 而不带注入，必须抢在它前面）
  app.get("/", renderIndex);
  app.get("/index.html", renderIndex);

  app.use("*", serveStatic({ root: "./dist" }));

  app.notFound((c) => {
    const accept = c.req.header("accept") ?? "";
    if (!accept.includes("text/html")) {
      return c.json({ error: "Not Found" }, 404);
    }
    return renderIndex(c); // SPA fallback 同样带注入
  });
}
