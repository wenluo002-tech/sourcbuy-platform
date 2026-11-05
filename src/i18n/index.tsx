// SourcBuy 轻量 i18n：零新依赖。默认规则：浏览器中文→zh，其余→en（目标买家是海外中小B）。
// 用户手动切换存 localStorage("sb-lang")，优先级最高。
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { zh } from "./zh";
import { en } from "./en";

export type Lang = "zh" | "en";
const DICTS = { zh, en } as const;

function detect(): Lang {
  try {
    const saved = localStorage.getItem("sb-lang");
    if (saved === "zh" || saved === "en") return saved;
  } catch { /* 私密模式等场景 */ }
  if (typeof navigator !== "undefined" && /^zh\b/i.test(navigator.language)) return "zh";
  return "en";
}

const I18nCtx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "zh",
  setLang: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detect);
  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("sb-lang", l); } catch { /* ignore */ }
  };
  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);
  return <I18nCtx.Provider value={{ lang, setLang }}>{children}</I18nCtx.Provider>;
}

// 点路径取值，字符串支持 {var} 插值；数组/对象原样返回（调用方知道形状）
export function useT() {
  const { lang, setLang } = useContext(I18nCtx);
  const t = (path: string, vars?: Record<string, string | number>): any => {
    let cur: any = DICTS[lang];
    for (const k of path.split(".")) cur = cur?.[k];
    if (cur == null) {
      // 回落中文，再落空就返回键名（开发期可见，绝不白屏）
      cur = path.split(".").reduce<any>((o, k) => o?.[k], DICTS.zh);
    }
    if (typeof cur === "string" && vars) {
      return cur.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
    }
    return cur ?? path;
  };
  return { lang, setLang, t };
}
