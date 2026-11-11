// M5 管理端壳：左栏文本导航 + 白名单守卫（服务端 opsQuery 是真闸，这里只做体验层）。
import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "@/auth";
import { ADM } from "./ui";

const NAV = [
  { to: "/admin", end: true, zh: "经营驾驶舱", en: "OVERVIEW" },
  { to: "/admin/channels", zh: "渠道归因", en: "CHANNELS" },
  { to: "/admin/buyers", zh: "买家管理", en: "BUYERS" },
  { to: "/admin/orders", zh: "订单管理", en: "ORDERS" },
  { to: "/admin/health", zh: "货源与成本", en: "HEALTH" },
];

export default function AdminLayout() {
  const { me, loading } = useAuth();
  const nav = useNavigate();

  if (loading) {
    return <div style={{ minHeight: "100vh", background: ADM.paper, display: "grid", placeItems: "center", color: ADM.ink40, fontSize: 13 }}>载入中…</div>;
  }
  if (!me) {
    nav("/login?next=/admin", { replace: true });
    return null;
  }
  if (!me.isAdmin) {
    return (
      <div style={{ minHeight: "100vh", background: ADM.paper, display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div className="sb-display" style={{ fontSize: 22, color: ADM.ink }}>此账号无管理权限</div>
          <div style={{ marginTop: 10, fontSize: 13, color: ADM.ink40 }}>当前登录：{me.email}。如需开通请联系系统负责人。</div>
          <button onClick={() => nav("/")} style={{ marginTop: 22, background: "none", border: `1px solid ${ADM.line}`, padding: "8px 18px", fontSize: 13, cursor: "pointer", color: ADM.ink60 }}>
            返回前台首页
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-shell" style={{ minHeight: "100vh", background: ADM.paper, color: ADM.ink, display: "grid", gridTemplateColumns: "216px 1fr" }}>
      {/* 窄屏降级：侧栏收为顶部横滚导航条（管理端桌面优先，但手机上至少能用） */}
      <style>{`
        @media (max-width: 768px) {
          .adm-shell { grid-template-columns: 1fr !important; }
          .adm-rail { position: static !important; height: auto !important; border-right: none !important; border-bottom: 1px solid ${ADM.line}; }
          .adm-rail nav { display: flex !important; overflow-x: auto; padding: 8px 12px !important; gap: 4px; }
          .adm-rail nav a { white-space: nowrap; padding: 8px 10px !important; border-left: none !important; border-bottom: 2px solid transparent; }
          .adm-rail nav a[aria-current="page"] { border-bottom: 2px solid ${ADM.brand} !important; background: none !important; }
          .adm-rail .adm-rail-foot { display: none !important; }
          .adm-main { padding: 20px 16px 60px !important; }
          .adm-kpi-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
      {/* 左栏：文本式导航，激活态 = 墨字 + 左侧蓝标 */}
      <aside className="adm-rail" style={{ borderRight: `1px solid ${ADM.line}`, padding: "26px 0", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "0 24px 24px", borderBottom: `1px solid ${ADM.line}` }}>
          <div className="sb-display" style={{ fontSize: 19, fontWeight: 600 }}>SourcBuy</div>
          <div style={{ marginTop: 5, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: ADM.ink40 }}>经营后台</div>
        </div>
        <nav style={{ padding: "18px 0", flex: 1 }}>
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end as any}
              style={({ isActive }) => ({
                display: "flex", alignItems: "baseline", gap: 10, padding: "10px 24px",
                fontSize: 14, textDecoration: "none",
                color: isActive ? ADM.ink : ADM.ink60,
                fontWeight: isActive ? 600 : 400,
                borderLeft: isActive ? `2px solid ${ADM.brand}` : "2px solid transparent",
                background: isActive ? "rgba(47,157,240,0.06)" : "transparent",
              })}
            >
              <span>{n.zh}</span>
              <span style={{ fontSize: 10, letterSpacing: "0.14em", color: ADM.ink40 }}>{n.en}</span>
            </NavLink>
          ))}
        </nav>
        <div className="adm-rail-foot" style={{ padding: "16px 24px", borderTop: `1px solid ${ADM.line}`, fontSize: 12, color: ADM.ink40 }}>
          <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{me.email}</div>
          <NavLink to="/" style={{ color: ADM.brand, textDecoration: "none", display: "inline-block", marginTop: 6 }}>← 返回前台</NavLink>
        </div>
      </aside>
      <main className="adm-main" style={{ padding: "34px 44px 80px", maxWidth: 1080, minWidth: 0 }}>
        <Outlet />
      </main>
    </div>
  );
}
