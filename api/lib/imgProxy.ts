// ═══ 图片代理（2026-11-15 罗总批准：权益锁图片旁路修复）═══
// 背景：上游图床 URL 含 "!!{sellerUserId}" 段，未解锁买家复制图片地址即可提取卖家身份反查源头店，
//       权益锁（厂名代号化）被零成本绕开。本模块把所有上游图片 URL 在 API 输出层改写成
//       /api/img/{token}，token 为 AES-256-GCM 加密后的原始 URL（密钥只在服务端 .env），
//       源头身份与平台特征从 URL 层面彻底不可见。
// 设计要点：
//  ① 确定性 IV（HMAC(url) 派生）——同一 URL 永远同一 token，浏览器/CDN 缓存有效；
//  ② GCM 认证标签——token 不可伪造，代理不会变成开放转发器；
//  ③ 域名白名单双向校验（加密时 + 解密后各查一次）——SSRF 打不到内网/任意外网；
//  ④ 相对路径与本地图（/uploads 等）原样放行；解密失败按 404，不泄露任何信息。
import crypto from "node:crypto";

const KEY = crypto
  .createHash("sha256")
  .update(String(process.env.IMG_PROXY_KEY || process.env.DATABASE_URL || "sb-img-proxy"))
  .digest();

// 上游图床域名白名单（图片 CDN 才走代理；其他域名的图不在权益锁威胁面内，不动）
const ALLOWED_HOSTS = [
  ".alicdn.com",
  ".taobaocdn.com",
  ".tbcdn.cn",
  ".1688.com",
  ".alibaba.com",
  ".aliyuncs.com",
];

function hostAllowed(u: URL): boolean {
  const h = u.hostname.toLowerCase();
  return ALLOWED_HOSTS.some((s) => h === s.slice(1) || h.endsWith(s));
}

/** 输出层调用：上游图床绝对 URL → /api/img/{token}；其他一律原样返回 */
export function proxyImageUrl<T extends string | null | undefined>(url: T): T {
  if (!url || typeof url !== "string") return url;
  if (!/^https?:\/\//i.test(url)) return url; // 相对路径/本地资源不动
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!hostAllowed(u)) return url;
  const iv = crypto.createHmac("sha256", KEY).update(url).digest().subarray(0, 12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(url, "utf8"), cipher.final()]);
  const token = Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64url");
  return `/api/img/${token}` as T;
}

/** 数组/记录批量改写（images JSON 用） */
export function proxyImageList(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.filter((x): x is string => typeof x === "string").map((u) => proxyImageUrl(u));
}

/** 服务端路由调用：token → 原始 URL（白名单再验一次）；失败返回 null → 404 */
export function decodeImgToken(token: string): string | null {
  try {
    const buf = Buffer.from(token, "base64url");
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const ct = buf.subarray(12, buf.length - 16);
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const url = Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || !hostAllowed(u)) return null;
    return url;
  } catch {
    return null;
  }
}
