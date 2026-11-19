import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { log } from "./lib/logger";
import { handleClientLog } from "./lib/clientlog";
import { REQUEST_ID_HEADER, runWithRequestId } from "./lib/requestcontext";
import { getSessionUser, readSessionToken } from "./lib/auth";
import { validateUpload, registerEvidence, evidenceCounts, canAccessReport, getEvidenceWithReport, getOpsDetail } from "./queries/inspection";
import { recordEvent } from "./queries/analytics";
import { generateReportPdf } from "./lib/qcPdf";
import { getReportForUser } from "./queries/verification";
import { decodeImgToken } from "./lib/imgProxy";

const app = new Hono<{ Bindings: HttpBindings }>();

// One middleware for both halves of request observability, because they need the
// same scope and the same id:
//   - G3 correlation: mint a request id, echo it on the response header (what the
//     browser logger reads), and run the rest of the request inside it so every
//     server log line carries it.
//   - G4 access log: one line per request with method/path/status/duration, so
//     "who called what and how long did it take" is answerable. Until now only
//     failures were logged at all, and success left no trace.
// /api/log is skipped: it is the browser's log sink, and an access line per
// POSTed batch would be self-amplifying noise in the very file it writes.
app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  if (c.req.path === "/api/log") {
    await next();
    return;
  }
  const start = Date.now();
  await runWithRequestId(requestId, async () => {
    await next();
    // Set the header AFTER next(): the tRPC route hands Hono a raw Response
    // built by fetchRequestHandler, which carries its own headers, so a
    // c.header() called before dispatch is dropped on that path. Setting it on
    // the resolved c.res covers every route, including the tRPC one.
    c.res.headers.set(REQUEST_ID_HEADER, requestId);
    // Only /api/* is logged. In production serveStaticFiles() registers a
    // catch-all AFTER this middleware, so a page load pulls in every asset as
    // its own request — logging those would bury the API calls the agent reads
    // this file for, and inflate the log for no diagnostic gain.
    if (!c.req.path.startsWith("/api/")) return;
    log.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });
});

// Scoped to the tRPC route, NOT global: on the dev server (@hono/vite-dev-server)
// a global bodyLimit breaks bodyless requests. Hono's bodyLimit reads any truthy
// request stream to the end and then rebuilds the Request with `new Request(raw,
// { body, duplex: "half" })`; the dev server's Response/Request class makes that
// rebuild throw `TypeError: Cannot read private member #state ...`, so every
// bodyless request (DELETE/PATCH on the app's own REST routes) 500s at dispatch.
// /api/log keeps its own 64KB caps in lib/clientlog.ts, so it needs no middleware.
app.use("/api/trpc/*", bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// Browser-side log sink (see lib/clientlog.ts). Must be registered before the
// /api/* 404 catch-all below. bodyLimit guards it too: lib/clientlog.ts caps the
// body itself, but only AFTER Hono has read it into memory, and this route sits
// on the public preview URL — the cap has to bite before the read.
app.post(
  "/api/log",
  bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.body(null, 413) }),
  handleClientLog,
);

// ═══ 质检双检 REST 端点（2026-11-09 PRD v1.1）═══
// 视频/大文件装不进 tRPC 的 50MB base64，证据上传走独立 multipart 端点；
// 证据文件存项目根 uploads/（dist 每次 build 被清，不能放 dist），一律按证据 ID 鉴权访问，绝不直接暴露路径。
// 三通道鉴权：ops 白名单 / 订单买家本人 / 有效上传 token（工厂 H5）。
const QC_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads");
const QC_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
  "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf",
};

async function qcUser(c: any) {
  const user = await getSessionUser(readSessionToken(c.req.raw)).catch(() => null);
  const allow = (process.env.OPS_ADMIN_EMAILS ?? "").split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
  const isOps = !!user && !!user.email && allow.includes(user.email.toLowerCase());
  return { user, isOps };
}

app.post(
  "/api/qc/upload",
  bodyLimit({ maxSize: 120 * 1024 * 1024, onError: (c) => c.json({ ok: false, error: "TOO_LARGE" }, 413) }),
  async (c) => {
    let body: Record<string, any>;
    try {
      body = await c.req.parseBody();
    } catch {
      return c.json({ ok: false, error: "BAD_MULTIPART" }, 400);
    }
    const token = String(body["token"] ?? "");
    const itemCode = String(body["itemCode"] ?? "");
    const file = body["file"];
    if (!token || !itemCode || !(file instanceof File)) return c.json({ ok: false, error: "BAD_REQUEST" }, 400);
    const mime = (file.type || "").toLowerCase();
    const mediaType = mime.startsWith("image/") ? ("photo" as const) : mime.startsWith("video/") ? ("video" as const) : mime === "application/pdf" ? ("file" as const) : null;
    if (!mediaType || !QC_EXT[mime]) return c.json({ ok: false, error: "BAD_MIME", mime }, 400);
    const v = await validateUpload(token, itemCode, mediaType);
    if (!v.ok) return c.json({ ok: false, error: v.error }, 403);
    const dir = path.join(QC_UPLOAD_ROOT, "qc", String(v.reportId));
    fs.mkdirSync(dir, { recursive: true });
    const fname = `${crypto.randomUUID()}.${QC_EXT[mime]}`;
    const rel = path.join("qc", String(v.reportId), fname);
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(QC_UPLOAD_ROOT, rel), buf);
    const { evidenceId } = await registerEvidence({
      reportId: v.reportId, itemCode, mediaType, filePath: rel, fileSize: buf.length, uploadedBy: v.uploadedBy,
    });
    const counts = await evidenceCounts(v.reportId);
    log.info("qc evidence uploaded", { reportId: v.reportId, itemCode, mediaType, size: buf.length });
    return c.json({ ok: true, evidenceId, counts });
  },
);

// ═══ 图片代理（2026-11-15 权益锁图片旁路修复，见 api/lib/imgProxy.ts）═══
// 公开只读：token 是 AES-GCM 加密的原始 URL（不可伪造），白名单域名双向校验，非图床内容一律 404。
// 原图 URL 不出现在任何前端响应里——买家复制图片地址也拿不到上游卖家身份。
const IMG_LOCAL_ROOT = path.join(QC_UPLOAD_ROOT, "img");
const IMG_EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", avif: "image/avif" };

// 轻量探活端点：guard.sh 专用（不查库不渲染，事件循环活着就 200）
app.get("/api/healthz", (c) => c.json({ ok: true, ts: Date.now() }));

// 本地化图片静态出口（公开只读，文件名是 sha1 无穿越面）
app.get("/api/img/local/:name", (c) => {
  const name = c.req.param("name");
  if (!/^[0-9a-f]{40}\.[a-z0-9]{2,5}$/.test(name)) return c.json({ error: "Not Found" }, 404);
  const abs = path.join(IMG_LOCAL_ROOT, name);
  if (!abs.startsWith(IMG_LOCAL_ROOT) || !fs.existsSync(abs)) return c.json({ error: "Not Found" }, 404);
  const ext = path.extname(name).slice(1).toLowerCase();
  c.header("Content-Type", IMG_EXT_MIME[ext] ?? "application/octet-stream");
  c.header("Cache-Control", "public, max-age=31536000, immutable"); // 内容寻址文件名，永久缓存
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(fs.readFileSync(abs));
});

// 大图压缩：>400KB 的 jpeg/png 缩到最长边 1280、jpeg q82；一次压缩永久受益（jimp 纯 JS 静态导入进 bundle，不破坏部署形态）
import Jimp from "jimp";
// 压缩并发闸：jimp 纯 JS 大图解码+压缩是内存尖峰（单张 4MB 图解码后位图近百 MB），
// 扫描/首访多图并发曾把服务打崩（OOM 无日志整进程死亡）——最多 2 路，多余排队
let shrinkRunning = 0;
const shrinkQueue: Array<() => void> = [];
async function shrinkImage(buf: Buffer, mime: string): Promise<{ buf: Buffer; mime: string }> {
  if (buf.length < 400_000 || !/image\/(jpeg|jpg|png)/.test(mime)) return { buf, mime };
  if (shrinkRunning >= 1) await new Promise<void>((r) => shrinkQueue.push(r));
  shrinkRunning++;
  try {
    const img = await Jimp.read(buf);
    if (img.bitmap.width > 1280) img.resize(1280, Jimp.AUTO);
    const out: Buffer = await img.quality(82).getBufferAsync("image/jpeg");
    if (out.length > 0 && out.length < buf.length) return { buf: out, mime: "image/jpeg" };
  } catch { /* 压缩失败用原图 */ } finally {
    shrinkRunning--;
    shrinkQueue.shift()?.();
  }
  return { buf, mime };
}

app.get("/api/img/:token", async (c) => {
  const url = decodeImgToken(c.req.param("token"));
  if (!url) return c.json({ error: "Not Found" }, 404);
  // 磁盘缓存读穿：优先压缩版（{sha1}.c.jpg），其次本地化原图（{sha1}.{ext}），命中即出图不触达上游
  const em = url.match(/\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i);
  const ext = (em ? em[1].toLowerCase() : "jpg").replace("jpeg", "jpg");
  const base = crypto.createHash("sha1").update(url).digest("hex");
  const absC = path.join(IMG_LOCAL_ROOT, base + ".c.jpg");
  const abs = path.join(IMG_LOCAL_ROOT, base + "." + ext);
  try {
    for (const p of [absC, abs]) {
      if (fs.existsSync(p) && fs.statSync(p).size > 100) {
        const raw = fs.readFileSync(p);
        // 读穿路径上的大图也顺手压缩并沉淀（一次性成本），之后都走 {sha1}.c.jpg 快路径
        const isJpg = p.endsWith(".jpg");
        const s = await shrinkImage(raw, isJpg ? "image/jpeg" : "image/" + ext);
        if (s.buf !== raw) { try { const part = absC + ".part"; fs.writeFileSync(part, s.buf); fs.renameSync(part, absC); } catch {} }
        c.header("Content-Type", s.mime);
        c.header("Cache-Control", "public, max-age=31536000, immutable");
        c.header("X-Content-Type-Options", "nosniff");
        return c.body(new Uint8Array(s.buf)); // 拷贝为独立 ArrayBuffer 视图满足 Hono 类型
      }
    }
  } catch { /* 缓存读失败回落代理 */ }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SourcBuy-ImgProxy/1.0)", Accept: "image/*,*/*;q=0.8" },
    });
    const mime = (r.headers.get("content-type") ?? "").toLowerCase();
    if (!r.ok || !mime.startsWith("image/")) return c.json({ error: "Not Found" }, 404);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length === 0 || buf.length > 15 * 1024 * 1024) return c.json({ error: "Not Found" }, 404);
    // 写-behind：压缩后回写本地库（.part+rename 防半截；任何失败静默，不影响出图）——浏览过的图自动沉淀为压缩本地资产
    const s = await shrinkImage(buf, mime);
    const savePath = s.buf !== buf ? absC : abs;
    try { fs.mkdirSync(IMG_LOCAL_ROOT, { recursive: true }); const part = savePath + ".part"; fs.writeFileSync(part, s.buf); fs.renameSync(part, savePath); } catch { /* 只读环境跳过 */ }
    c.header("Content-Type", s.mime);
    c.header("Cache-Control", "public, max-age=604800, immutable"); // token 确定性，可长缓存
    c.header("X-Content-Type-Options", "nosniff");
    return c.body(new Uint8Array(s.buf));
  } catch {
    return c.json({ error: "Bad Gateway" }, 502);
  } finally {
    clearTimeout(timer);
  }
});

app.get("/api/qc/file/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "Not Found" }, 404);
  const row = await getEvidenceWithReport(id);
  if (!row) return c.json({ error: "Not Found" }, 404);
  const { user, isOps } = await qcUser(c);
  const access = await canAccessReport({ reportId: row.report.id, userId: user?.id ?? null, isOps, token: c.req.query("token") ?? null });
  if (!access.ok) return c.json({ error: "Forbidden" }, 403);
  const abs = path.join(QC_UPLOAD_ROOT, row.evidence.filePath);
  // 防路径穿越：落库路径必须仍在 uploads 根内
  if (!abs.startsWith(QC_UPLOAD_ROOT) || !fs.existsSync(abs)) return c.json({ error: "Not Found" }, 404);
  const ext = path.extname(abs).slice(1).toLowerCase();
  const mime =
    ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp"
    : ext === "heic" || ext === "heif" ? "image/heic" : ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime"
    : ext === "pdf" ? "application/pdf" : "application/octet-stream";
  c.header("Content-Type", mime);
  c.header("Cache-Control", "private, max-age=3600");
  return c.body(fs.readFileSync(abs));
});

app.get("/api/qc/:reportId/pdf", async (c) => {
  const reportId = Number(c.req.param("reportId"));
  if (!Number.isFinite(reportId)) return c.json({ error: "Not Found" }, 404);
  const { user, isOps } = await qcUser(c);
  const access = await canAccessReport({ reportId, userId: user?.id ?? null, isOps, token: c.req.query("token") ?? null });
  if (!access.ok) return c.json({ error: "Forbidden" }, 403);
  const rep = await getOpsDetail(reportId);
  if (!rep) return c.json({ error: "Not Found" }, 404);
  if (!rep.verdict) return c.json({ error: "Report not finalized" }, 409); // 未判定不出报告
  let abs = rep.pdfPath ? path.join(QC_UPLOAD_ROOT, rep.pdfPath) : "";
  if (!abs || !fs.existsSync(abs)) abs = await generateReportPdf(reportId); // 懒生成 + 落库路径
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `inline; filename="${rep.reportNo}.pdf"`);
  return c.body(fs.readFileSync(abs));
});

// ═══ P4 核查报告 PDF 下载（仅报告属主，登录态双通道）═══
app.get("/api/verify/:reportId/pdf", async (c) => {
  const reportId = Number(c.req.param("reportId"));
  if (!Number.isFinite(reportId)) return c.json({ error: "Not Found" }, 404);
  const user = await getSessionUser(readSessionToken(c.req.raw)).catch(() => null);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  const rep = await getReportForUser(reportId, user.id);
  if (!rep) return c.json({ error: "Not Found" }, 404);
  if (rep.status !== "ready" || !rep.pdf_path || !fs.existsSync(rep.pdf_path)) return c.json({ error: "Report not ready" }, 409);
  c.header("Content-Type", "application/pdf");
  c.header("Content-Disposition", `inline; filename="${rep.report_no}.pdf"`);
  return c.body(new Uint8Array(fs.readFileSync(rep.pdf_path)));
});

// ═══ M5 经营埋点采集（2026-11-11）═══
// 公开端点，永不报错：埋点失败绝不能影响买家体验，一律 204。
// 防护：8KB body 上限 + 每 IP 每分钟 60 次简单限流 + 字段白名单截断（在 recordEvent 内）。
const trackHits = new Map<string, { n: number; reset: number }>();
app.post(
  "/api/track",
  bodyLimit({ maxSize: 8 * 1024, onError: (c) => c.body(null, 204) }),
  async (c) => {
    try {
      const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "local";
      const now = Date.now();
      const h = trackHits.get(ip);
      if (h && now < h.reset && h.n >= 60) return c.body(null, 204); // 限流：静默丢弃
      trackHits.set(ip, { n: (h && now < h.reset ? h.n : 0) + 1, reset: h && now < h.reset ? h.reset : now + 60_000 });
      if (trackHits.size > 10_000) trackHits.clear(); // 防内存膨胀，清零重来即可
      const body = await c.req.json().catch(() => null);
      if (!body || typeof body.event !== "string") return c.body(null, 204);
      const user = await getSessionUser(readSessionToken(c.req.raw)).catch(() => null);
      await recordEvent({
        event: body.event,
        anonId: body.anonId,
        userId: user?.id ?? null,
        path: body.path,
        referrer: body.referrer,
        utmSource: body.utmSource,
        utmMedium: body.utmMedium,
        utmCampaign: body.utmCampaign,
        lang: body.lang,
        ua: c.req.header("user-agent"),
      });
    } catch (err) {
      log.error("track event failed", { error: err instanceof Error ? err.message : String(err) });
    }
    return c.body(null, 204);
  },
);

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// Unhandled request errors must reach /tmp/kimi-logs/app.log, not just stdout:
// that file is what the building agent reads when a preview 500s, and without
// this the log looks clean while the request actually failed. Response stays a
// generic 500 (no stack leaked to the caller); the detail goes to the log only.
app.onError((err, c) => {
  log.error("unhandled request error", {
    method: c.req.method,
    path: c.req.path,
    error: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;

// 进程级崩溃兜底：任何漏网的未捕获异常/未处理 Promise 拒绝，记日志但不杀进程。
// 没有这两行，Node 的默认行为是直接退出——前台表现就是"用着用着闪退/白屏"，
// 而且 stderr 只进 server.log，事故后连现场都没有。记到统一日志后才可复盘。
process.on("uncaughtException", (err) => {
  log.error("uncaughtException（进程已保住，需复盘）", {
    error: err.message,
    stack: err.stack,
  });
});
process.on("unhandledRejection", (reason) => {
  log.error("unhandledRejection（进程保留）", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    log.info(`Server running on http://localhost:${port}/`);
  });
}
