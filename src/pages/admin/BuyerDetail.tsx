// M5 买家详情：身份卡 + 首次接触归因链路 + 全部订单台账。
import { Link, useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { ADM, Eyebrow, Empty, Section, fmtUsd, fmtTime, fmtDate } from "./ui";
import { normalizeChannel } from "@contracts/metrics";

export default function AdminBuyerDetail() {
  const { id } = useParams<{ id: string }>();
  const q = trpc.admin.buyerDetail.useQuery({ id: Number(id) }, { enabled: !!id });

  if (q.isLoading) return <div style={{ color: ADM.ink40, fontSize: 13, padding: "40px 0" }}>载入中…</div>;
  if (q.error) return <Empty text={`数据拉取失败：${q.error.message}`} />;
  if (!q.data) return <Empty text="买家不存在。" />;
  const { user, orders, threads } = q.data;
  const attr = user.attr as { source?: string | null; medium?: string | null; campaign?: string | null; referrer?: string | null; landing?: string | null; at?: string } | null;
  const channel = attr ? normalizeChannel(attr.source ?? null, attr.referrer ?? null) : "直接访问";

  return (
    <div>
      <Link to="/admin/buyers" style={{ fontSize: 13, color: ADM.ink40, textDecoration: "none" }}>← 买家列表</Link>
      <div style={{ marginTop: 18 }}>
        <Eyebrow>BUYER #{user.id}</Eyebrow>
        <h1 className="sb-display" style={{ fontSize: 30, margin: "8px 0 0", color: ADM.ink }}>{user.display_name || user.email}</h1>
        {user.display_name && <div style={{ marginTop: 4, fontSize: 13, color: ADM.ink60 }}>{user.email}</div>}
      </div>

      {/* 身份与归因卡：两栏事实表 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, marginTop: 28 }}>
        <div style={{ borderTop: `1px solid ${ADM.ink}`, paddingTop: 14 }}>
          <Eyebrow>身份</Eyebrow>
          <dl style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 2.1 }}>
            <Row k="注册时间" v={fmtTime(user.created_at)} />
            <Row k="最近登录" v={fmtTime(user.last_login_at)} />
            <Row k="界面语言" v={user.locale || "—"} />
            <Row k="会话数" v={String(threads)} />
          </dl>
        </div>
        <div style={{ borderTop: `1px solid ${ADM.ink}`, paddingTop: 14 }}>
          <Eyebrow>首次接触归因</Eyebrow>
          {attr ? (
            <dl style={{ margin: "12px 0 0", fontSize: 13, lineHeight: 2.1 }}>
              <Row k="渠道" v={channel} strong />
              <Row k="utm_source" v={attr.source || "—"} />
              <Row k="utm_medium / campaign" v={`${attr.medium || "—"} / ${attr.campaign || "—"}`} />
              <Row k="来源页" v={attr.referrer || "—"} />
              <Row k="落地页" v={attr.landing || "—"} />
              <Row k="记录时间" v={fmtTime(attr.at)} />
            </dl>
          ) : (
            <div style={{ marginTop: 12, fontSize: 13, color: ADM.ink40 }}>该买家注册于埋点上线前，或无来源记录 → 记「直接访问」。</div>
          )}
        </div>
      </div>

      <Section title="订单台账" en="ORDERS">
        {orders.length === 0 ? <Empty text="该买家还没有发起询价。" /> : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "130px 1fr 110px 100px 110px", gap: 14, paddingBottom: 8, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: ADM.ink40, borderBottom: `1px solid ${ADM.ink}` }}>
              <div>单号</div><div>商品 / 目的地</div><div>状态</div><div style={{ textAlign: "right" }}>GMV</div><div style={{ textAlign: "right" }}>创建时间</div>
            </div>
            {orders.map((o: any) => (
              <div key={o.id} style={{ display: "grid", gridTemplateColumns: "130px 1fr 110px 100px 110px", gap: 14, padding: "10px 0", borderBottom: `1px solid ${ADM.line}`, fontSize: 13, alignItems: "center" }}>
                <div className="sb-num" style={{ color: ADM.brand }}>{o.order_no}</div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: ADM.ink60 }}>
                  {(o.product_title || "文字需求")}{o.destination ? ` · ${o.destination}` : ""}{o.quantity ? ` · ×${o.quantity}` : ""}
                </div>
                <div style={{ color: ADM.ink60 }}>{o.status}</div>
                <div className="sb-num" style={{ textAlign: "right", fontWeight: 600 }}>{o.gmv_usd ? fmtUsd(Number(o.gmv_usd)) : "—"}</div>
                <div className="sb-num" style={{ textAlign: "right", color: ADM.ink40 }}>{fmtDate(o.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 12 }}>
      <dt style={{ color: ADM.ink40 }}>{k}</dt>
      <dd style={{ margin: 0, color: ADM.ink, fontWeight: strong ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v}>{v}</dd>
    </div>
  );
}
