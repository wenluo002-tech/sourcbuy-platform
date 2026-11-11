// M5 货源与成本健康页：严选库盘点、API 成本、翻译缓存、质检积压——运营的每日体检表。
import { trpc } from "@/providers/trpc";
import { ADM, Eyebrow, Empty, Section, fmtInt, fmtCny } from "./ui";

export default function AdminHealth() {
  const q = trpc.admin.health.useQuery();

  if (q.isLoading) return <div style={{ color: ADM.ink40, fontSize: 13, padding: "40px 0" }}>载入中…</div>;
  if (q.error) return <Empty text={`数据拉取失败：${q.error.message}`} />;
  const d = q.data!;

  const cards: { en: string; label: string; value: string; sub?: string }[] = [
    { en: "FACTORIES", label: "严选库工厂", value: fmtInt(d.factories.total), sub: `缺评分 ${fmtInt(d.factories.noScore)} · 贸易商 ${fmtInt(d.factories.traders)} · 买家提名 ${fmtInt(d.factories.nominated)}` },
    { en: "API COST TODAY", label: "今日接口成本", value: fmtCny(d.apiToday.cost), sub: `计费调用 ${fmtInt(d.apiToday.calls)} 次` },
    { en: "TRANSLATION CACHE", label: "翻译缓存条目", value: fmtInt(d.translationCache), sub: "终身缓存，命中即零成本" },
    { en: "EVENTS TODAY", label: "今日埋点事件", value: fmtInt(d.eventsToday) },
    { en: "QC PENDING", label: "质检待判定", value: fmtInt(d.qc.pending), sub: `累计报告 ${fmtInt(d.qc.total)} 份` },
  ];

  return (
    <div>
      <Eyebrow>SUPPLY & COST</Eyebrow>
      <h1 className="sb-display" style={{ fontSize: 34, margin: "8px 0 0", color: ADM.ink }}>货源与成本</h1>
      <div style={{ marginTop: 10, fontSize: 12, color: ADM.ink40 }}>实时库内台账，刷新即最新。</div>

      <Section title="今日体检" en="VITALS">
        <div className="adm-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "28px 36px" }}>
          {cards.map((c) => (
            <div key={c.en} style={{ borderTop: `1px solid ${ADM.ink}`, paddingTop: 14 }}>
              <Eyebrow>{c.en}</Eyebrow>
              <div style={{ marginTop: 4, fontSize: 13, color: ADM.ink60 }}>{c.label}</div>
              <div className="sb-num" style={{ marginTop: 10, fontSize: 28, fontWeight: 600, color: ADM.ink }}>{c.value}</div>
              {c.sub && <div style={{ marginTop: 8, fontSize: 12, color: ADM.ink40 }}>{c.sub}</div>}
            </div>
          ))}
        </div>
      </Section>

      <Section title="运营红线" en="REMINDERS">
        <ul style={{ margin: 0, padding: 0, listStyle: "none", fontSize: 13, lineHeight: 2.2, color: ADM.ink60 }}>
          <li>· 万邦接口余额需人工充值（约剩 ¥150 时要提醒罗总）——本页成本只统计已计费调用。</li>
          <li>· 缺评分工厂不进严选库推荐位；贸易商标签永不上前台。</li>
          <li>· 质检判定权永远在人：AI 只预检，「待判定」积压超过 24h 要安排质检员。</li>
        </ul>
      </Section>
    </div>
  );
}
