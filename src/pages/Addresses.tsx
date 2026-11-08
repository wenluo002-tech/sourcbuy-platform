// M4a 收货地址簿：DDP 到门履约刚需；海外买家按国际地址习惯（国家/州/市/街道/邮编）
import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/auth";
import { useT } from "@/i18n";

type AddrForm = {
  label: string; contactName: string; phone: string; country: string;
  state: string; city: string; address1: string; address2: string; postcode: string;
};
const EMPTY: AddrForm = { label: "", contactName: "", phone: "", country: "", state: "", city: "", address1: "", address2: "", postcode: "" };

export default function Addresses() {
  const { me, loading } = useAuth();
  const { t } = useT();
  const utils = trpc.useUtils();
  const listQ = trpc.addresses.list.useQuery(undefined, { enabled: !!me });
  const invalidate = () => {
    utils.addresses.list.invalidate();
    utils.dashboard.summary.invalidate();
  };
  const createMut = trpc.addresses.create.useMutation({ onSuccess: invalidate });
  const updateMut = trpc.addresses.update.useMutation({ onSuccess: invalidate });
  const removeMut = trpc.addresses.remove.useMutation({ onSuccess: invalidate });
  const defaultMut = trpc.addresses.setDefault.useMutation({ onSuccess: invalidate });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<AddrForm>(EMPTY);
  const [err, setErr] = useState("");

  if (loading) return null;

  if (!me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">{t("dash.loginTitle")}</h1>
        <p className="mt-3 text-sm text-[var(--sb-ink-60)]">{t("dash.loginBody")}</p>
        <Link to="/login?next=/addresses" className="mt-6 inline-block rounded-xl bg-[var(--sb-brand)] px-6 py-2.5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)]">
          {t("dash.loginCta")}
        </Link>
      </div>
    );
  }

  const set = (k: keyof AddrForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function startEdit(a: any) {
    setEditId(a.id);
    setForm({
      label: a.label ?? "", contactName: a.contactName ?? "", phone: a.phone ?? "",
      country: a.country ?? "", state: a.state ?? "", city: a.city ?? "",
      address1: a.address1 ?? "", address2: a.address2 ?? "", postcode: a.postcode ?? "",
    });
    setShowForm(true);
    setErr("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactName.trim()) return setErr(t("addr.needName"));
    if (!form.phone.trim() || form.phone.trim().length < 3) return setErr(t("addr.needPhone"));
    if (!form.country.trim()) return setErr(t("addr.needCountry"));
    if (!form.address1.trim()) return setErr(t("addr.needAddr"));
    setErr("");
    const payload = {
      label: form.label.trim() || undefined,
      contactName: form.contactName.trim(),
      phone: form.phone.trim(),
      country: form.country.trim(),
      state: form.state.trim() || undefined,
      city: form.city.trim() || undefined,
      address1: form.address1.trim(),
      address2: form.address2.trim() || undefined,
      postcode: form.postcode.trim() || undefined,
    };
    if (editId) {
      updateMut.mutate({ id: editId, ...payload }, { onSuccess: () => { setShowForm(false); setEditId(null); setForm(EMPTY); } });
    } else {
      createMut.mutate(payload, { onSuccess: () => { setShowForm(false); setForm(EMPTY); } });
    }
  }

  const busy = createMut.isPending || updateMut.isPending;
  const fields: { k: keyof AddrForm; label: string; req?: boolean; span?: boolean }[] = [
    { k: "label", label: t("addr.label") },
    { k: "contactName", label: t("addr.contactName"), req: true },
    { k: "phone", label: t("addr.phone"), req: true },
    { k: "country", label: t("addr.country"), req: true },
    { k: "state", label: t("addr.state") },
    { k: "city", label: t("addr.city") },
    { k: "address1", label: t("addr.address1"), req: true, span: true },
    { k: "address2", label: t("addr.address2"), span: true },
    { k: "postcode", label: t("addr.postcode") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-[var(--sb-font-display)] text-2xl font-semibold">{t("addr.title")}</h1>
          <p className="mt-1 text-xs text-[var(--sb-ink-40)]">{t("addr.sub")}</p>
        </div>
        <button
          onClick={() => { setShowForm((v) => !v); setEditId(null); setForm(EMPTY); setErr(""); }}
          className="shrink-0 rounded-xl border border-[var(--sb-line)] bg-white px-4 py-2 text-xs font-medium text-[var(--sb-ink-60)] transition-colors hover:border-[var(--sb-brand)] hover:text-[var(--sb-brand)]"
        >
          {t("addr.add")}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mt-4 rounded-2xl border border-[var(--sb-line)] bg-white p-4">
          <p className="text-sm font-medium">{editId ? t("addr.editTitle") : t("addr.formTitle")}</p>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {fields.map((f) => (
              <label key={f.k} className={f.span ? "sm:col-span-2" : ""}>
                <span className="mb-1 block text-xs text-[var(--sb-ink-60)]">
                  {f.label}{f.req && <span className="text-[#b45309]"> *</span>}
                </span>
                <input
                  value={form[f.k]}
                  onChange={set(f.k)}
                  className="h-10 w-full rounded-xl border border-[var(--sb-line)] bg-transparent px-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--sb-brand)]"
                />
              </label>
            ))}
          </div>
          {err && <p className="mt-2 text-xs text-[#b45309]">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy} className="h-10 rounded-xl bg-[var(--sb-brand)] px-5 text-sm font-semibold text-[#eef4f5] hover:bg-[var(--sb-brand-hover)] disabled:opacity-40">
              {busy ? t("addr.saving") : t("addr.save")}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setEditId(null); setForm(EMPTY); }} className="h-10 rounded-xl border border-[var(--sb-line)] px-5 text-sm text-[var(--sb-ink-60)]">
              {t("addr.cancel")}
            </button>
          </div>
        </form>
      )}

      <div className="mt-5 space-y-3">
        {listQ.isLoading ? (
          <p className="py-10 text-center text-sm text-[var(--sb-ink-40)]">…</p>
        ) : !listQ.data?.length ? (
          <div className="rounded-2xl border border-dashed border-[var(--sb-line)] py-12 text-center">
            <p className="text-sm text-[var(--sb-ink-40)]">{t("addr.empty")}</p>
          </div>
        ) : (
          listQ.data.map((a) => (
            <div key={a.id} className="rounded-2xl border border-[var(--sb-line)] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {a.contactName}
                    {a.label && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-[var(--sb-ink-60)]">{a.label}</span>}
                    {a.isDefault && <span className="rounded-full bg-[var(--sb-brand-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--sb-brand)]">{t("addr.defaultBadge")}</span>}
                  </p>
                  <p className="mt-1 text-xs text-[var(--sb-ink-60)]">{a.phone}</p>
                  <p className="mt-1 text-sm text-[var(--sb-ink)]">
                    {[a.address1, a.address2, a.city, a.state, a.postcode, a.country].filter(Boolean).join(", ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center">
                  {!a.isDefault && (
                    <button onClick={() => defaultMut.mutate({ id: a.id })} className="text-xs text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline">
                      {t("addr.setDefault")}
                    </button>
                  )}
                  <button onClick={() => startEdit(a)} className="text-xs text-[var(--sb-ink-60)] underline-offset-4 hover:text-[var(--sb-brand)] hover:underline">
                    {t("addr.edit")}
                  </button>
                  <button
                    onClick={() => { if (confirm(t("addr.deleteConfirm"))) removeMut.mutate({ id: a.id }); }}
                    className="text-xs text-[var(--sb-ink-40)] underline-offset-4 hover:text-[#b45309] hover:underline"
                  >
                    {t("addr.delete")}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
