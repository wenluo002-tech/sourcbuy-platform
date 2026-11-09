import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import fs from "node:fs";
import path from "node:path";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { log } from "./lib/logger";
import { handleClientLog } from "./lib/clientlog";
import { REQUEST_ID_HEADER, runWithRequestId } from "./lib/requestcontext";
import { getSessionUser, readSessionCookie } from "./lib/auth";
import { validateUpload, registerEvidence, evidenceCounts, canAccessReport, getEvidenceWithReport, getOpsDetail } from "./queries/inspection";
import { generateReportPdf } from "./lib/qcPdf";

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
  const user = await getSessionUser(readSessionCookie(c.req.raw)).catch(() => null);
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

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    log.info(`Server running on http://localhost:${port}/`);
  });
}
