import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n";

// 附件/拍照按钮共用形态：真实 input 全尺寸覆盖在图标上，指尖直点文件控件本体
// （htmlFor 转发和 JS click 在部分 WebView 都会被静默吞掉——v81 罗总手机实测复现后的根治形态）。
// 关键：「死环境看门狗」——部分预览容器在系统层拦截文件选择器，点了永远没反应（v82 罗总实测复现）。
// 文件选择器真正弹出时页面必然 blur 或 visibilitychange(hidden)（相册/相机是系统级界面）；
// 点了 2.5s 后既没选到文件、页面也没失焦 = 选择器被拦 → 通知父组件亮出「浏览器打开」逃生门。
export function AttachButton(props: {
  title: string;
  accept: string;
  capture?: string;
  className?: string;
  children: React.ReactNode;
  onFile: (f: File) => void;
  onChooserBlocked: () => void;
}) {
  const cancelRef = useRef<(() => void) | null>(null);
  const blockedRef = useRef(props.onChooserBlocked);
  blockedRef.current = props.onChooserBlocked;

  useEffect(() => () => cancelRef.current?.(), []);

  function cancel() {
    cancelRef.current?.();
    cancelRef.current = null;
  }

  function arm() {
    cancel();
    let alive = true;
    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("blur", done);
      document.removeEventListener("visibilitychange", onVis);
    }
    function done() {
      alive = false;
      cleanup();
    }
    function onVis() {
      if (document.visibilityState === "hidden") done();
    }
    const timer = window.setTimeout(() => {
      if (!alive) return;
      alive = false;
      cleanup();
      blockedRef.current();
    }, 2500);
    window.addEventListener("blur", done);
    document.addEventListener("visibilitychange", onVis);
    cancelRef.current = () => {
      alive = false;
      cleanup();
    };
  }

  return (
    <label title={props.title} className={`relative cursor-pointer ${props.className ?? ""}`}>
      {props.children}
      <input
        type="file"
        accept={props.accept}
        {...(props.capture ? ({ capture: props.capture } as object) : {})}
        aria-label={props.title}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        onPointerDown={arm}
        onClick={arm}
        onChange={(e) => {
          cancel();
          const f = e.target.files?.[0];
          if (f) props.onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// 死环境逃生门：选择器被拦时亮出——复制链接，改用手机浏览器打开（5 语言文案走 i18n）
export function PickerBlockedHint() {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [showUrl, setShowUrl] = useState(false); // 两条复制路径都挂→亮出可选中的链接输入框，绝不摆死按钮
  async function copy() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    } catch { /* 走兜底 */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      const okCopy = document.execCommand("copy");
      ta.remove();
      if (okCopy) { setCopied(true); return; }
    } catch { /* 继续兜底 */ }
    setShowUrl(true);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e9d5a1] bg-[#fdf6e3] px-3 py-2">
      <span className="text-xs leading-relaxed text-[#92610a]">{t("chat.pickerBlocked")}</span>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg border border-[#d9b96a] bg-white px-2.5 py-1 text-xs font-medium text-[#92610a] transition-colors hover:bg-[#fdf0d0]"
      >
        {copied ? t("chat.linkCopied") : t("chat.copyLink")}
      </button>
      {showUrl && (
        <input
          readOnly
          value={window.location.href}
          onFocus={(e) => e.target.select()}
          className="w-full rounded-md border border-[#e9d5a1] bg-white px-2 py-1 text-[11px] text-[#92610a]"
        />
      )}
    </div>
  );
}
