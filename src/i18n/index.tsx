// SourcBuy 轻量 i18n：零新依赖。目标买家是海外中小B，默认英文。
// 语言检测优先级：手动选择（localStorage sb-lang）> 服务端注入的 IP/浏览器头提示（__SB_LANG_HINT__）> navigator.language > en。
// IP 归属地会骗人（VPN/出差党），所以只做提示不强制；买家手动选择永远最高优先。
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { zh } from "./zh";
import { en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { pt } from "./pt";
import { ka } from "./ka";

export const LANGS = ["zh", "en", "es", "fr", "pt", "ka"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = {
  zh: "中文",
  en: "EN",
  es: "ES",
  fr: "FR",
  pt: "PT",
  ka: "KA",
};

const DICTS: Record<Lang, any> = { zh, en, es, fr, pt, ka };

function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

function detect(): Lang {
  try {
    const saved = localStorage.getItem("sb-lang");
    if (isLang(saved)) return saved;
  } catch { /* 私密模式等场景 */ }
  // 服务端注入的提示（IP 归属地 + Accept-Language 综合判断，见 boot.ts）
  const hint = (globalThis as any).__SB_LANG_HINT__;
  if (isLang(hint)) return hint;
  if (typeof navigator !== "undefined") {
    const two = (navigator.language || "").slice(0, 2).toLowerCase();
    if (isLang(two)) return two;
  }
  return "en";
}

const I18nCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "zh",
  setLang: () => {},
});

const HTML_LANG: Record<Lang, string> = { zh: "zh-CN", en: "en", es: "es", fr: "fr", pt: "pt", ka: "ka" };

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("sb-lang", l); } catch { /* ignore */ }
  };
  useEffect(() => {
    document.documentElement.lang = HTML_LANG[lang];
  }, [lang]);
  return <I18nCtx.Provider value={{ lang, setLang }}>{children}</I18nCtx.Provider>;
}

// 点路径取值，字符串支持 {var} 插值；数组/对象原样返回（调用方知道形状）
// 回落链：当前语言 → en → zh → 键名（开发期可见，绝不白屏）
export function useT() {
  const { lang, setLang } = useContext(I18nCtx);
  const t = (path: string, vars?: Record<string, string | number>): any => {
    let cur: any = DICTS[lang];
    for (const k of path.split(".")) cur = cur?.[k];
    if (cur == null) {
      cur = path.split(".").reduce<any>((o, k) => o?.[k], DICTS.en);
    }
    if (cur == null) {
      cur = path.split(".").reduce<any>((o, k) => o?.[k], DICTS.zh);
    }
    if (typeof cur === "string" && vars) {
      return cur.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    }
    return cur ?? path;
  };
  return { lang, setLang, t };
}
