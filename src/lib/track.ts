// M5 前端埋点（2026-11-11）：UTM 首访捕获 + page_view 上报。
// 原则：埋点是旁观者——任何失败都静默吞掉，绝不影响买家使用。
// 归因语义：事件携带该设备"最近一次已知来源"（last-touch）；
// 服务端的首次接触归因在注册时从事件流里取最早一条（见 api/queries/analytics.ts）。
import { getAnonId } from "../auth";

type Touch = {
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  referrer?: string | null;
  landing?: string | null;
};

const LAST_KEY = "sb.attr.last";

function readLast(): Touch {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || "{}") as Touch;
  } catch {
    return {};
  }
}

function isExternal(ref: string | null | undefined): boolean {
  if (!ref) return false;
  try {
    return new URL(ref).host !== window.location.host;
  } catch {
    return false;
  }
}

// 每次真实页面加载（非 SPA 路由切换）调用一次：URL 带 utm 或外部 referrer 时刷新 last-touch。
export function captureTouch(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const source = q.get("utm_source");
    const ref = document.referrer && isExternal(document.referrer) ? document.referrer : null;
    if (!source && !ref) return; // 没有新来源信息，保留旧触点
    const t: Touch = {
      source: source || null,
      medium: q.get("utm_medium"),
      campaign: q.get("utm_campaign"),
      referrer: ref,
      landing: window.location.pathname,
    };
    localStorage.setItem(LAST_KEY, JSON.stringify(t));
  } catch { /* 隐私模式等场景直接放弃 */ }
}

export function trackPageView(path: string): void {
  try {
    const t = readLast();
    const payload = {
      event: "page_view",
      anonId: getAnonId(),
      path,
      referrer: t.referrer ?? null,
      utmSource: t.source ?? null,
      utmMedium: t.medium ?? null,
      utmCampaign: t.campaign ?? null,
      lang: localStorage.getItem("sb-lang") || navigator.language?.slice(0, 2) || null,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    if (!navigator.sendBeacon("/api/track", blob)) {
      fetch("/api/track", { method: "POST", body: blob, keepalive: true }).catch(() => {});
    }
  } catch { /* 静默 */ }
}
