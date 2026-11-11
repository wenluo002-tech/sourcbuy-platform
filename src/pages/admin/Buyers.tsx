// M5 买家管理：列表（搜索 + 渠道 + 台账聚合）→ 详情页。
import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { ADM, Eyebrow, Empty, fmtUsd, fmtInt, fmtDate, fmtTime } from "./ui";

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: ADM.ink40, textAlign: right ? "right" : "left", paddingBottom: 8 }}>{children}</div>
);

export default function AdminBuyers() {
  const [kw, setKw] = useState("");
  const [q, setQ] = useState<string | undefined>(undefined);
  const list = trpc.admin.buyers.useQuery({ q });

  return (
    <div>
      <Eyebrow>BUYERS</Eyebrow>
      <h1 className="sb-display" style={{ fontSize: 34, margin: "8px 0 0", color: ADM.ink }}>买家管理</h1>

      <div style={{ display: "flex", gap: 12, marginTop: 24, alignItems: "center" }}>
        <input
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setQ(kw.trim() || undefined); }}
          placeholder="按邮箱或名称搜索，回车确认"
          style={{ flex: 1, maxWidth: 360, border: "none", borderBottom: `1px solid ${ADM.ink}`, background: "transparent", padding: "8px 2px", fontSize: 14, outline: "none", color: ADM.ink }}
        />
        <button
          onClick={() => setQ(kw.trim() || undefined)}
          style={{ background: ADM.brand, color: "#fff", border: "none", padding: "8px 20px", fontSize: 13, cursor: "pointer" }}
        >
          搜索
        </button>
      </div>

      <div style={{ marginTop: 26 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 110px 90px 70px 70px 100px", gap: 14, borderBottom: `1px solid ${ADM.ink}` }}>
          <TH>邮箱</TH><TH>来源渠道</TH><TH>注册时间</TH><TH>最近登录</TH><TH right>询价</TH><TH right>成交</TH><TH right>GMV</TH>
        </div>
        {list.isLoading ? <Empty text="载入中…" /> : list.error ? <Empty text={`数据拉取失败：${list.error.message}`} /> :
          list.data!.length === 0 ? <Empty text="没有匹配的买家。" /> : (
            list.data!.map((b) => (
              <Link
                key={b.id}
                to={`/admin/buyers/${b.id}`}
                style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 110px 90px 70px 70px 100px", gap: 14, padding: "11px 0", borderBottom: `1px solid ${ADM.line}`, textDecoration: "none", color: ADM.ink, fontSize: 13, alignItems: "center" }}
              >
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.email}
                  {b.name && <span style={{ color: ADM.ink40, marginLeft: 8 }}>{b.name}</span>}
                </div>
                <div style={{ color: ADM.ink60 }}>{b.channel}</div>
                <div className="sb-num" style={{ color: ADM.ink60 }}>{fmtDate(b.createdAt)}</div>
                <div className="sb-num" style={{ color: ADM.ink40 }}>{b.lastLoginAt ? fmtDate(b.lastLoginAt) : "—"}</div>
                <div className="sb-num" style={{ textAlign: "right" }}>{fmtInt(b.orders)}</div>
                <div className="sb-num" style={{ textAlign: "right" }}>{fmtInt(b.accepted)}</div>
                <div className="sb-num" style={{ textAlign: "right", fontWeight: 600 }}>{b.gmv > 0 ? fmtUsd(b.gmv) : "—"}</div>
              </Link>
            ))
          )}
      </div>
    </div>
  );
}
