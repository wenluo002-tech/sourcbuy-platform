/**
 * 称谓（salutation）清洗与防呆（V105，罗总 2026-11-19 终审口径）。
 * 定位：买家自定义"我该如何称呼您"的输入清洗——只拦明显脏话/违规词，绝不过度拦截
 * （罗总原话：老外名字拼音可能刚好触发敏感字母组合，基础防呆即可，
 * 不能搞得用户连自己名字都填不进去）。
 * 用法：AI 抽取/设置页修改/注册 displayName，所有写入与注入前必须过这一道。
 */

// 明显脏词小词表（中英，宁窄勿宽—— substring 匹配，只放独立成词的脏词）
const BLOCKLIST = [
  "fuck", "shit", "bitch", "nigger", "cunt", "whore", "slut",
  "傻逼", "白痴", "混蛋", "王八蛋", "操你", "妈的", "滚蛋",
];

/** 清洗买家自定义称谓。返回 null = 不合规（调用方兜底为无称呼/默认"您"）。 */
export function sanitizeSalutation(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ").slice(0, 24);
  if (s.length < 1 || s.length > 20) return null;
  // 字符集：中英文字母/数字/空格/常见名片符号（· - ' .）；emoji 与特殊符号一律拒
  if (!/^[\p{Script=Han}\p{L}\p{N} .\-'·]+$/u.test(s)) return null;
  const lower = s.toLowerCase();
  if (BLOCKLIST.some((w) => lower.includes(w))) return null;
  return s;
}
