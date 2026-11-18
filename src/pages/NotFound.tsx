import { Link } from "react-router";
import { useT } from "@/i18n";

/** 全局兜底 404（v101）：未知路由不再白屏。品牌一致的安静版式 + 两个固定出口（回首页 / 发起询价）。 */
export default function NotFound() {
  const { t } = useT();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="sb-eyebrow">{t("notFound.kicker")}</p>
      <h1 className="sb-display mt-4 text-[40px] leading-tight tracking-tight text-[var(--sb-ink)] sm:text-[48px]">
        {t("notFound.title")}
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--sb-ink-60)]">
        {t("notFound.desc")}
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="sb-pill border border-black/15 px-6 py-2.5 text-sm font-medium hover:bg-black/[0.03]"
        >
          {t("notFound.backHome")}
        </Link>
        <Link
          to="/buyer"
          className="sb-pill bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--sb-brand-hover)]"
        >
          {t("notFound.goSourcing")}
        </Link>
      </div>
    </div>
  );
}
