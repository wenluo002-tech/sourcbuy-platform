// M5 渠道归因页：渠道 × 访客/注册/成交/GMV + 归因口径说明 + 投放短链用法。
import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { ADM, Eyebrow, ChannelBars, Section, RangeTabs, Empty } from "./ui";

export default function AdminChannels() {
  const [range, setRange] = useState<"today" | "7d" | "30d">("30d");
  const q = trpc.admin.channels.useQuery({ range });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <Eyebrow>ATTRIBUTION</Eyebrow>
          <h1 className="sb-display" style={{ fontSize: 34, margin: "8px 0 0", color: ADM.ink }}>渠道归因</h1>
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>

      {/* 归因口径：诚实写清双触点规则 */}
      <div style={{ marginTop: 20, padding: "14px 18px", border: `1px dashed ${ADM.line}`, fontSize: 13, color: ADM.ink60, lineHeight: 1.9 }}>
        <div>归因口径：买家注册时记录<b style={{ color: ADM.ink }}>首次接触</b>（这台设备最早一条带来源的访问）；接受报价时记录<b style={{ color: ADM.ink }}>末次接触</b>（成交前最近一次来源，落空则沿用注册归因）。</div>
        <div>投放用法：广告链接加参数 <code className="sb-num" style={{ color: ADM.ink }}>?utm_source=tiktok&amp;utm_medium=cpc&amp;utm_campaign=nov</code>，无参数时按来源域名识别（TikTok / Facebook / Google 等），都没有记「直接访问」。</div>
      </div>

      <Section title="渠道明细" en="BY CHANNEL">
        {q.isLoading ? <Empty text="载入中…" /> : q.error ? <Empty text={`数据拉取失败：${q.error.message}`} /> :
          q.data!.channels.length === 0 ? (
            <Empty text="该周期内还没有带来源的访问记录。开始投放后，这里会自动出现 TikTok / Facebook / Google 等渠道行。" />
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 70px 70px 70px 96px", gap: 12, paddingBottom: 8, fontSize: 11, letterSpacing: "0.12em", color: ADM.ink40, textTransform: "uppercase" }}>
                <div>渠道</div><div></div>
                <div style={{ textAlign: "right" }}>访客</div>
                <div style={{ textAlign: "right" }}>注册</div>
                <div style={{ textAlign: "right" }}>成交</div>
                <div style={{ textAlign: "right" }}>GMV</div>
              </div>
              <ChannelBars rows={q.data!.channels} />
              <div style={{ marginTop: 14, fontSize: 12, color: ADM.ink40 }}>
                访客按当期页面访问归一化统计；注册与成交按归因快照归属，三者口径不同属正常（买家可能上月来访、本月注册）。
              </div>
            </>
          )}
      </Section>
    </div>
  );
}
