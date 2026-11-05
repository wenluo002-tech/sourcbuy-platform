// M3a 登录/注册页（2026-11-05）：邮箱+密码，双语，登录后 anon 会话归并到账号
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { useT } from "@/i18n";
import { getAnonId, useAuth } from "@/auth";

export default function Login() {
  const { t, lang } = useT();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { refresh } = useAuth();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const onOk = () => {
    refresh();
    utils.threads.list.invalidate();
    nav(sp.get("next") || "/buyer");
  };
  const onErr = (e: { message?: string }) => {
    const code = e.message ?? "";
    setErr(
      code === "EMAIL_TAKEN" ? t("auth.errEmailTaken")
      : code === "BAD_CREDENTIALS" ? t("auth.errBadCred")
      : code === "INVALID_INPUT" ? t("auth.errInvalid")
      : t("auth.errGeneric"),
    );
  };
  const loginM = trpc.auth.login.useMutation({ onSuccess: onOk, onError: onErr });
  const registerM = trpc.auth.register.useMutation({ onSuccess: onOk, onError: onErr });
  const pending = loginM.isPending || registerM.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const anonId = getAnonId();
    if (tab === "login") loginM.mutate({ email, password, anonId });
    else registerM.mutate({ email, password, displayName: displayName || undefined, locale: lang, anonId });
  };

  const inputCls =
    "w-full rounded-lg border border-[var(--sb-line)] bg-white px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]";

  return (
    <div className="mx-auto max-w-md py-10">
      <h1 className="sb-display text-2xl font-semibold tracking-tight">{t("auth.welcome")}</h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--sb-ink-60)]">{t("auth.welcomeSub")}</p>

      <div className="mt-6 flex rounded-lg border border-[var(--sb-line)] bg-white p-1">
        {(["login", "register"] as const).map((k) => (
          <button
            key={k}
            onClick={() => { setTab(k); setErr(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
              tab === k ? "bg-[var(--sb-brand)] text-[#eef4f5]" : "text-[var(--sb-ink-60)] hover:text-[var(--sb-ink)]"
            }`}
          >
            {k === "login" ? t("auth.tabLogin") : t("auth.tabRegister")}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3 rounded-xl border border-[var(--sb-line)] bg-white p-5">
        <label className="text-xs font-medium text-[var(--sb-ink-60)]">
          {t("auth.email")}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.emailPh")} className={`mt-1 ${inputCls}`} autoComplete="email" />
        </label>
        <label className="text-xs font-medium text-[var(--sb-ink-60)]">
          {t("auth.password")}
          <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.passwordPh")} className={`mt-1 ${inputCls}`}
            autoComplete={tab === "login" ? "current-password" : "new-password"} />
        </label>
        {tab === "register" && (
          <label className="text-xs font-medium text-[var(--sb-ink-60)]">
            {t("auth.displayName")}
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t("auth.displayNamePh")} className={`mt-1 ${inputCls}`} autoComplete="name" />
          </label>
        )}
        {err && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-1 rounded-lg bg-[var(--sb-brand)] py-2.5 text-sm font-semibold text-[#eef4f5] transition-colors hover:bg-[var(--sb-brand-hover)] disabled:opacity-40"
        >
          {tab === "login" ? t("auth.submitLogin") : t("auth.submitRegister")}
        </button>
        <p className="text-center text-[11px] leading-relaxed text-[var(--sb-ink-40)]">{t("auth.noAccountNote")}</p>
      </form>

      <p className="mt-4 text-center text-xs text-[var(--sb-ink-40)]">
        <Link to="/buyer" className="underline-offset-4 hover:underline">← {t("nav.sourcing")}</Link>
      </p>
    </div>
  );
}
