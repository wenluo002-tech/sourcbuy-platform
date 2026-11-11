// M5 管理端共享 UI：KPI 卡 / 迷你趋势线 / 漏斗 / 渠道条 / 空态。
// 设计口径：暖米白账簿底 + 深墨字 + 品牌蓝唯一行动色；数字一律 tabular-nums 逐位对齐；
// 诚实红线：没有数据就摆空态，绝不摆假数字。
import type { ReactNode } from "react";

export const ADM = {
  paper: "#FAF8F4",
  ink: "#1C1A16",
  ink60: "rgba(28,26,22,0.62)",
  ink40: "rgba(28,26,22,0.42)",
  line: "rgba(28,26,22,0.12)",
  brand: "#2F9DF0",
  brandDeep: "#184B8C",
  good: "#1E7B4F",
  bad: "#B0443C",
};

export const fmtInt = (n: number) => new Intl.NumberFormat("en-US").format(Math.round(n));
export const fmtUsd = (n: number) =>
  "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
export const fmtCny = (n: number) =>
  "¥" + new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
export const fmtTime = (s: string | Date | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fmtDate = (s: string | Date | null | undefined) => fmtTime(s).slice(0, 10);

// 大写宽字距小标签（账簿栏目名）
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase", color: ADM.ink40 }}>
      {children}
    </div>
  );
}

// KPI 卡：无卡片套娃，细线分区；label + 大数字 + 环比
export function Kpi({ label, en, value, prev, money }: { label: string; en: string; value: number; prev?: number; money?: boolean }) {
  const delta = prev === undefined ? null : value - prev;
  const pct = prev && prev > 0 ? ((value - prev) / prev) * 100 : null;
  return (
    <div style={{ borderTop: `1px solid ${ADM.ink}`, paddingTop: 14, minWidth: 0 }}>
      <Eyebrow>{en}</Eyebrow>
      <div style={{ marginTop: 4, fontSize: 13, color: ADM.ink60 }}>{label}</div>
      <div className="sb-num" style={{ marginTop: 10, fontSize: 30, fontWeight: 600, letterSpacing: "-0.01em", color: ADM.ink }}>
        {money ? fmtUsd(value) : fmtInt(value)}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: ADM.ink40 }}>
        {delta === null ? "环比 —" : pct === null
          ? `上期 ${money ? fmtUsd(prev!) : fmtInt(prev!)}`
          : (
            <span style={{ color: delta >= 0 ? ADM.good : ADM.bad }}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}%
              <span style={{ color: ADM.ink40 }}>（上期 {money ? fmtUsd(prev!) : fmtInt(prev!)}）</span>
            </span>
          )}
      </div>
    </div>
  );
}

// 迷你趋势线：SVG polyline，无轴无刻度，面积淡填充
export function Spark({ points, height = 56, color = ADM.brand }: { points: number[]; height?: number; color?: string }) {
  const w = 100;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points.map((v, i) => `${(i * step).toFixed(2)},${(height - 4 - (v / max) * (height - 10)).toFixed(2)}`);
  const line = coords.join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      <polygon points={`0,${height} ${line} ${w},${height}`} fill={color} opacity={0.08} />
      <polyline points={line} fill="none" stroke={color} strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// GMV 每日柱：细柱，当日高亮
export function Bars({ points, height = 56, color = ADM.brandDeep }: { points: number[]; height?: number; color?: string }) {
  const max = Math.max(...points, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {points.map((v, i) => (
        <div key={i} style={{ flex: 1, height: Math.max(1, (v / max) * (height - 2)), background: color, opacity: i === points.length - 1 ? 1 : 0.35 }} />
      ))}
    </div>
  );
}

// 转化漏斗：四段横条，宽度按比例，段间转化率
export function Funnel({ stages }: { stages: { stage: string; value: number }[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div>
      {stages.map((s, i) => {
        const prevV = i > 0 ? stages[i - 1].value : 0;
        const rate = i > 0 && prevV > 0 ? ((s.value / prevV) * 100).toFixed(1) + "%" : null;
        return (
          <div key={s.stage} style={{ display: "grid", gridTemplateColumns: "88px 1fr 90px 64px", alignItems: "center", gap: 12, padding: "10px 0", borderTop: i ? `1px solid ${ADM.line}` : "none" }}>
            <div style={{ fontSize: 13, color: ADM.ink60 }}>{s.stage}</div>
            <div style={{ height: 20, background: "rgba(28,26,22,0.05)", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, width: `${Math.max(1.5, (s.value / max) * 100)}%`, background: i === stages.length - 1 ? ADM.brandDeep : ADM.brand, opacity: i === stages.length - 1 ? 1 : 0.55 + (i / stages.length) * 0.3 }} />
            </div>
            <div className="sb-num" style={{ fontSize: 15, fontWeight: 600, textAlign: "right" }}>{fmtInt(s.value)}</div>
            <div className="sb-num" style={{ fontSize: 12, color: ADM.ink40, textAlign: "right" }}>{rate ?? ""}</div>
          </div>
        );
      })}
    </div>
  );
}

// 渠道条形列表
export function ChannelBars({ rows }: { rows: { channel: string; uv: number; signups: number; accepted: number; gmv: number }[] }) {
  const max = Math.max(...rows.map((r) => r.uv), 1);
  return (
    <div>
      {rows.map((r, i) => (
        <div key={r.channel} style={{ display: "grid", gridTemplateColumns: "120px 1fr 70px 70px 70px 96px", gap: 12, alignItems: "center", padding: "9px 0", borderTop: i ? `1px solid ${ADM.line}` : "none", fontSize: 13 }}>
          <div style={{ color: ADM.ink, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.channel}</div>
          <div style={{ height: 14, background: "rgba(28,26,22,0.05)" }}>
            <div style={{ height: "100%", width: `${Math.max(1.5, (r.uv / max) * 100)}%`, background: ADM.brand, opacity: 0.7 }} />
          </div>
          <div className="sb-num" style={{ textAlign: "right", color: ADM.ink60 }}>{fmtInt(r.uv)}</div>
          <div className="sb-num" style={{ textAlign: "right", color: ADM.ink60 }}>{fmtInt(r.signups)}</div>
          <div className="sb-num" style={{ textAlign: "right", color: ADM.ink60 }}>{fmtInt(r.accepted)}</div>
          <div className="sb-num" style={{ textAlign: "right", fontWeight: 600 }}>{r.gmv > 0 ? fmtUsd(r.gmv) : "—"}</div>
        </div>
      ))}
    </div>
  );
}

// 诚实空态
export function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: "36px 0", textAlign: "center", fontSize: 13, color: ADM.ink40, borderTop: `1px dashed ${ADM.line}` }}>
      {text}
    </div>
  );
}

// 区块标题：衬线 + 细线
export function Section({ title, en, right, children }: { title: string; en: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section style={{ marginTop: 44 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", borderTop: `1px solid ${ADM.ink}`, paddingTop: 12, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h2 className="sb-display" style={{ fontSize: 20, color: ADM.ink, margin: 0 }}>{title}</h2>
          <Eyebrow>{en}</Eyebrow>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

// 周期切换：今日 / 近7天 / 近30天（文本式，激活态下划线）
export function RangeTabs({ value, onChange }: { value: string; onChange: (v: "today" | "7d" | "30d") => void }) {
  const items = [
    { k: "today", label: "今日" },
    { k: "7d", label: "近 7 天" },
    { k: "30d", label: "近 30 天" },
  ] as const;
  return (
    <div style={{ display: "flex", gap: 20 }}>
      {items.map((it) => (
        <button
          key={it.k}
          onClick={() => onChange(it.k)}
          style={{
            background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontSize: 13,
            color: value === it.k ? ADM.ink : ADM.ink40,
            fontWeight: value === it.k ? 600 : 400,
            borderBottom: value === it.k ? `2px solid ${ADM.brand}` : "2px solid transparent",
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
