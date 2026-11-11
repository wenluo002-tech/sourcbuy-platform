// M5 驾驶舱：KPI + 环比、转化漏斗、30 日趋势、渠道 Top。
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { ADM, Eyebrow, Kpi, Spark, Bars, Funnel, ChannelBars, Section, RangeTabs, Empty } from "./ui";

export default function AdminDashboard() {
  const [range, setRange] = useState<"today" | "7d" | "30d">("7d");
  const q = trpc.admin.overview.useQuery({ range });

  if (q.isLoading) return <div style={{ color: ADM.ink40, fontSize: 13, padding: "40px 0" }}>载入台账…</div>;
  if (q.error) return <Empty text={`数据拉取失败：${q.error.message}`} />;
  const d = q.data!;

  const uvSeries = d.series.map((s: any) => s.uv);
  const gmvSeries = d.series.map((s: any) => s.gmv);

  return (
    <div>
      {/* 页头：衬线大标题 + 口径说明 + 周期切换 */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <Eyebrow>SOURCBUY OPS</Eyebrow>
          <h1 className="sb-display" style={{ fontSize: 34, margin: "8px 0 0", color: ADM.ink }}>经营驾驶舱</h1>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: ADM.ink40 }}>
        GMV 口径：{d.gmvLabel} · {d.note}
      </div>

      {/* KPI 六格 */}
      <div className="adm-kpi-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "28px 36px", marginTop: 30 }}>
        <Kpi en="VISITORS" label="独立访客" value={d.kpis.uv} prev={d.prev.uv} />
        <Kpi en="PAGE VIEWS" label="浏览量" value={d.kpis.pv} />
        <Kpi en="SIGNUPS" label="新注册" value={d.kpis.signups} prev={d.prev.signups} />
        <Kpi en="INQUIRIES" label="发起询价" value={d.kpis.inquiries} />
        <Kpi en="ACCEPTED" label="接受报价" value={d.kpis.accepted} prev={d.prev.accepted} />
        <Kpi en="GMV (USD)" label="成交 GMV" value={d.kpis.gmv} prev={d.prev.gmv} money />
      </div>

      {/* 趋势 */}
      <Section title="每日趋势" en="TREND">
        {d.series.length === 0 ? <Empty text="该周期内还没有埋点数据——埋点自 2026-11-11 起累计。" /> : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 }}>
            <div>
              <Eyebrow>独立访客 / 日</Eyebrow>
              <div style={{ marginTop: 12 }}><Spark points={uvSeries.length ? uvSeries : [0]} /></div>
            </div>
            <div>
              <Eyebrow>GMV / 日（接受报价口径）</Eyebrow>
              <div style={{ marginTop: 12 }}><Bars points={gmvSeries.length ? gmvSeries : [0]} /></div>
            </div>
          </div>
        )}
      </Section>

      {/* 漏斗 */}
      <Section title="转化漏斗" en="FUNNEL">
        <Funnel stages={d.funnel} />
        {d.kpis.uv === 0 ? (
          <div style={{ marginTop: 10, fontSize: 12, color: ADM.ink40 }}>
            访客段暂无数据：埋点 2026-11-11 才上线，此前只有注册/询价/成交台账。
          </div>
        ) : d.kpis.signups > d.kpis.uv ? (
          <div style={{ marginTop: 10, fontSize: 12, color: ADM.ink40 }}>
            注册数高于访客数属正常：注册含埋点上线前（2026-11-11）积累的历史买家，访客段从埋点上线才开始计。
          </div>
        ) : null}
      </Section>

      {/* 渠道 Top */}
      <Section title="渠道 Top" en="CHANNELS" right={<a href="/admin/channels" style={{ fontSize: 13, color: ADM.brand, textDecoration: "none" }}>全部渠道 →</a>}>
        {d.channels.length === 0 ? <Empty text="还没有带来源的访问。投放时在链接上加 ?utm_source=tiktok 等参数即可归因。" /> : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 70px 70px 70px 96px", gap: 12, paddingBottom: 8, fontSize: 11, letterSpacing: "0.12em", color: ADM.ink40, textTransform: "uppercase" }}>
              <div>渠道</div><div></div>
              <div style={{ textAlign: "right" }}>访客</div>
              <div style={{ textAlign: "right" }}>注册</div>
              <div style={{ textAlign: "right" }}>成交</div>
              <div style={{ textAlign: "right" }}>GMV</div>
            </div>
            <ChannelBars rows={d.channels} />
          </>
        )}
      </Section>
    </div>
  );
}
