// 词条表 v1.0 QA 硬卡点扫描（2026-11-17 罗总终审生效）
// 以 contracts/copy.ts 为唯一基准，扫描六语言 i18n 字典全部字符串值：
//   1) 禁用词命中 → FAIL
//   2) 内部数字透传（8,682 / 7,760 / 480万 / 4.8 million）→ FAIL
//   3) 「直供」脱离「严选直供」单独使用 → FAIL
// 纯本地扫描、零网络零 DB，任何档位（含 QA_FAST=1 冒烟档）都必须执行。
import { FORBIDDEN_TERMS, INTERNAL_NUMBER_PATTERNS, ZHIGONG_FULL, ZHIGONG_FRAGMENT } from "../contracts/copy";

export interface CopyViolation {
  lang: string;
  key: string;
  rule: string;
  excerpt: string;
}

function flat(obj: Record<string, unknown>, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[p] = v;
    else if (Array.isArray(v)) v.forEach((x: unknown, i) => { if (typeof x === "string") out[`${p}.${i}`] = x; else flat(x as Record<string, unknown>, `${p}.${i}`, out); });
    else if (v && typeof v === "object") flat(v as Record<string, unknown>, p, out);
  }
  return out;
}

function clip(s: string, at: number): string {
  const a = Math.max(0, at - 12);
  return s.slice(a, at + 18);
}

export async function scanCopy(): Promise<CopyViolation[]> {
  const violations: CopyViolation[] = [];
  for (const lang of ["zh", "en", "es", "fr", "pt", "ka"]) {
    let dict: Record<string, unknown>;
    try {
      const mod = (await import(`../src/i18n/${lang}`)) as Record<string, unknown>;
      dict = mod[lang] as Record<string, unknown>;
    } catch {
      violations.push({ lang, key: "(file)", rule: "字典文件 import 失败", excerpt: "" });
      continue;
    }
    for (const [key, val] of Object.entries(flat(dict))) {
      for (const t of FORBIDDEN_TERMS) {
        const m = val.match(t.pattern);
        if (m) violations.push({ lang, key, rule: `禁用词「${m[0]}」（${t.reason}）`, excerpt: clip(val, m.index ?? 0) });
      }
      for (const p of INTERNAL_NUMBER_PATTERNS) {
        const m = val.match(p);
        if (m) violations.push({ lang, key, rule: `内部数字透传「${m[0]}」（永不进前台）`, excerpt: clip(val, m.index ?? 0) });
      }
      // 「直供」误用：抹掉所有完整名词「严选直供」后仍有残留即违规
      const stripped = val.split(ZHIGONG_FULL).join("");
      const at = stripped.indexOf(ZHIGONG_FRAGMENT);
      if (at >= 0) violations.push({ lang, key, rule: "「直供」脱离「严选直供」单独使用", excerpt: clip(stripped, at) });
    }
  }
  return violations;
}

// 独立可跑：npx tsx db/qa-copy-scan.ts
if (process.argv[1] && process.argv[1].endsWith("qa-copy-scan.ts")) {
  const vs = await scanCopy();
  if (vs.length) {
    console.error(`词条扫描 FAIL：${vs.length} 处违规`);
    for (const v of vs) console.error(`  [${v.lang}] ${v.key} → ${v.rule} | …${v.excerpt}…`);
    process.exit(1);
  }
  console.log("词条扫描 PASS：六语言字典无禁用词/内部数字/「直供」误用");
  process.exit(0);
}
