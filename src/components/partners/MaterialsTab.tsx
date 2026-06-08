"use client";

import { useRef, useState } from "react";
import { FileText, Mountain, Pencil, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";

import { Banner, Field, inputClass } from "./form-primitives";
import { Money } from "@/components/ui/Money";

interface Material {
  id: string;
  materialName: string;
  fraction: string | null;
  gost: string | null;
  strengthGrade: string | null;
  flakiness: string | null;
  frostResistance: string | null;
  radioactivityClass: string | null;
  abrasion: string | null;
  bulkDensity: number | null;
  passportFields: Record<string, string> | null;
  pricePerTon: number | null;
  currency: string;
  locationRaw: string | null;
  passportDocumentId: string | null;
  quarryRaw: string | null;
  notes: string | null;
}

interface MaterialsTabProps {
  counterpartyId: string;
  initialMaterials: Material[];
}

// Editable string fields of the form (numbers are parsed on submit).
interface FormState {
  materialName: string;
  fraction: string;
  gost: string;
  strengthGrade: string;
  flakiness: string;
  frostResistance: string;
  radioactivityClass: string;
  abrasion: string;
  bulkDensity: string;
  pricePerTon: string;
  locationRaw: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  materialName: "щебень",
  fraction: "",
  gost: "",
  strengthGrade: "",
  flakiness: "",
  frostResistance: "",
  radioactivityClass: "",
  abrasion: "",
  bulkDensity: "",
  pricePerTon: "",
  locationRaw: "",
  notes: "",
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png";

function formFromMaterial(m: Material): FormState {
  return {
    materialName: m.materialName,
    fraction: m.fraction ?? "",
    gost: m.gost ?? "",
    strengthGrade: m.strengthGrade ?? "",
    flakiness: m.flakiness ?? "",
    frostResistance: m.frostResistance ?? "",
    radioactivityClass: m.radioactivityClass ?? "",
    abrasion: m.abrasion ?? "",
    bulkDensity: m.bulkDensity != null ? String(m.bulkDensity) : "",
    pricePerTon: m.pricePerTon != null ? String(m.pricePerTon) : "",
    locationRaw: m.locationRaw ?? "",
    notes: m.notes ?? "",
  };
}

export function MaterialsTab({ counterpartyId, initialMaterials }: MaterialsTabProps) {
  const [materials, setMaterials] = useState<Material[]>(initialMaterials);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [passportDocId, setPassportDocId] = useState<string | null>(null);
  const [passportName, setPassportName] = useState<string | null>(null);
  const [passportFields, setPassportFields] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function refresh() {
    const resp = await fetch(`/api/partners/${counterpartyId}/materials`);
    const json = await resp.json();
    if (resp.ok && json?.success) setMaterials(json.data as Material[]);
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPassportDocId(null);
    setPassportName(null);
    setPassportFields(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function startCreate() {
    resetForm();
    setError(null);
    setOpen(true);
  }

  function startEdit(m: Material) {
    setForm(formFromMaterial(m));
    setEditingId(m.id);
    setPassportDocId(m.passportDocumentId);
    setPassportName(null);
    setPassportFields(m.passportFields);
    setError(null);
    setOpen(true);
  }

  // Upload the passport file as a counterparty document → keep its id for linking + AI extract.
  async function onPassportSelected(file: File) {
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", "other");
      fd.set("title", `Паспорт: ${file.name.replace(/\.[^.]+$/, "")}`);
      const resp = await fetch(`/api/partners/${counterpartyId}/documents`, { method: "POST", body: fd });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось загрузить паспорт");
      setPassportDocId(json.data.id as string);
      setPassportName(file.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить паспорт");
    } finally {
      setBusy(false);
    }
  }

  async function extract() {
    if (!passportDocId) return;
    setError(null);
    setExtracting(true);
    try {
      const resp = await fetch(`/api/partners/${counterpartyId}/materials/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: passportDocId }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось извлечь");
      const d = json.data as Partial<Record<keyof FormState, string | number | null>> & {
        passportFields?: Record<string, string> | null;
      };
      setForm((f) => ({
        ...f,
        materialName: (d.materialName as string) || f.materialName,
        fraction: (d.fraction as string) ?? f.fraction,
        gost: (d.gost as string) ?? f.gost,
        strengthGrade: (d.strengthGrade as string) ?? f.strengthGrade,
        flakiness: (d.flakiness as string) ?? f.flakiness,
        frostResistance: (d.frostResistance as string) ?? f.frostResistance,
        radioactivityClass: (d.radioactivityClass as string) ?? f.radioactivityClass,
        abrasion: (d.abrasion as string) ?? f.abrasion,
        bulkDensity: d.bulkDensity != null ? String(d.bulkDensity) : f.bulkDensity,
      }));
      if (d.passportFields) setPassportFields(d.passportFields);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось извлечь");
    } finally {
      setExtracting(false);
    }
  }

  function buildPayload() {
    const num = (s: string): number | null => {
      const v = Number(s.replace(",", ".").trim());
      return s.trim() !== "" && Number.isFinite(v) ? v : null;
    };
    const str = (s: string): string | null => (s.trim() === "" ? null : s.trim());
    return {
      materialName: form.materialName.trim() || "щебень",
      fraction: str(form.fraction),
      gost: str(form.gost),
      strengthGrade: str(form.strengthGrade),
      flakiness: str(form.flakiness),
      frostResistance: str(form.frostResistance),
      radioactivityClass: str(form.radioactivityClass),
      abrasion: str(form.abrasion),
      bulkDensity: num(form.bulkDensity),
      pricePerTon: num(form.pricePerTon),
      currency: "RUB",
      locationRaw: str(form.locationRaw),
      notes: str(form.notes),
      passportFields: passportFields ?? null,
      passportDocumentId: passportDocId,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const url = editingId
        ? `/api/partners/${counterpartyId}/materials/${editingId}`
        : `/api/partners/${counterpartyId}/materials`;
      const resp = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось сохранить");
      await refresh();
      resetForm();
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(`/api/partners/${counterpartyId}/materials/${id}`, { method: "DELETE" });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось удалить");
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mountain className="size-4 text-text-tertiary" aria-hidden />
          <h2 className="text-md text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
            Каталог щебня
          </h2>
          <span className="font-mono text-xs tabular-nums text-text-tertiary">{materials.length}</span>
        </div>
        {!open && (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-3 px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Plus className="size-4" aria-hidden />
            Добавить материал
          </button>
        )}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {open && (
        <form onSubmit={submit} className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
          <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-dashed border-border bg-surface-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-3 px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2">
                <Upload className="size-4" aria-hidden />
                {passportName ?? (passportDocId ? "Паспорт загружен" : "Загрузить паспорт (PDF/фото)")}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onPassportSelected(f);
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!passportDocId || extracting || busy}
                onClick={extract}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-3 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
              >
                <Sparkles className="size-4" aria-hidden />
                {extracting ? "Читаю паспорт…" : "Заполнить из паспорта (ИИ)"}
              </button>
            </div>
            <p className="text-xs text-text-tertiary">
              ИИ заберёт характеристики из паспорта — проверьте и поправьте перед сохранением.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Материал">
              <input value={form.materialName} onChange={(e) => set("materialName", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Фракция">
              <input value={form.fraction} onChange={(e) => set("fraction", e.target.value)} placeholder="5-20" className={inputClass} />
            </Field>
            <Field label="ГОСТ">
              <input value={form.gost} onChange={(e) => set("gost", e.target.value)} placeholder="ГОСТ 8267-93" className={inputClass} />
            </Field>
            <Field label="Марка прочности (М)">
              <input value={form.strengthGrade} onChange={(e) => set("strengthGrade", e.target.value)} placeholder="М1200" className={inputClass} />
            </Field>
            <Field label="Лещадность">
              <input value={form.flakiness} onChange={(e) => set("flakiness", e.target.value)} placeholder="1 группа" className={inputClass} />
            </Field>
            <Field label="Морозостойкость (F)">
              <input value={form.frostResistance} onChange={(e) => set("frostResistance", e.target.value)} placeholder="F150" className={inputClass} />
            </Field>
            <Field label="Радиоактивность (класс)">
              <input value={form.radioactivityClass} onChange={(e) => set("radioactivityClass", e.target.value)} placeholder="1 класс" className={inputClass} />
            </Field>
            <Field label="Истираемость (И)">
              <input value={form.abrasion} onChange={(e) => set("abrasion", e.target.value)} placeholder="И1" className={inputClass} />
            </Field>
            <Field label="Насыпная плотность, кг/м³">
              <input value={form.bulkDensity} onChange={(e) => set("bulkDensity", e.target.value)} inputMode="decimal" placeholder="1380" className={inputClass} />
            </Field>
            <Field label="Цена за тонну, ₽">
              <input value={form.pricePerTon} onChange={(e) => set("pricePerTon", e.target.value)} inputMode="decimal" placeholder="1100" className={inputClass} />
            </Field>
            <Field label="Станция / место">
              <input value={form.locationRaw} onChange={(e) => set("locationRaw", e.target.value)} placeholder="ст. Асбест" className={inputClass} />
            </Field>
            <Field label="Примечание">
              <input value={form.notes} onChange={(e) => set("notes", e.target.value)} className={inputClass} />
            </Field>
          </div>

          {passportFields && Object.keys(passportFields).length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="label-caps">Прочее из паспорта</span>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(passportFields).map(([k, v]) => (
                  <span key={k} className="rounded-pill bg-surface-3 px-2.5 py-1 text-2xs text-text-secondary">
                    <span className="text-text-tertiary">{k}:</span> {v}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
            >
              {busy ? "Сохранение…" : editingId ? "Сохранить" : "Добавить"}
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setOpen(false);
                setError(null);
              }}
              className="inline-flex h-9 items-center gap-1.5 px-3 text-sm text-text-secondary transition-colors hover:text-text"
            >
              <X className="size-4" aria-hidden />
              Отмена
            </button>
          </div>
        </form>
      )}

      {materials.length === 0 && !open ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface-1 px-4 py-10 text-center">
          <Mountain className="mx-auto size-6 text-text-tertiary" aria-hidden />
          <p className="mt-2 text-sm text-text-secondary">Каталог щебня пуст.</p>
          <p className="mt-1 text-xs text-text-tertiary">
            Загрузите паспорт — ИИ заполнит характеристики автоматически.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {materials.map((m) => (
            <li key={m.id} className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
                    {m.materialName}
                    {m.fraction ? ` · фр. ${m.fraction}` : ""}
                  </span>
                  {m.gost && <span className="text-xs text-text-tertiary">{m.gost}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Изменить"
                    onClick={() => startEdit(m)}
                    className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить"
                    disabled={busy}
                    onClick={() => remove(m.id)}
                    className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-danger-quiet hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {m.strengthGrade && <Chip label="прочность" value={m.strengthGrade} />}
                {m.frostResistance && <Chip label="морозостойк." value={m.frostResistance} />}
                {m.flakiness && <Chip label="лещадность" value={m.flakiness} />}
                {m.radioactivityClass && <Chip label="радиоакт." value={m.radioactivityClass} />}
                {m.abrasion && <Chip label="истир." value={m.abrasion} />}
                {m.bulkDensity != null && <Chip label="плотность" value={`${m.bulkDensity} кг/м³`} />}
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm">
                  {m.pricePerTon != null ? (
                    <>
                      <Money value={m.pricePerTon} className="text-sm" />
                      <span className="text-text-tertiary"> / т</span>
                    </>
                  ) : (
                    <span className="text-text-tertiary">цена не указана</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {m.locationRaw && <span className="text-xs text-text-tertiary">{m.locationRaw}</span>}
                  {m.passportDocumentId && (
                    <a
                      href={`/api/documents/${m.passportDocumentId}`}
                      className="inline-flex items-center gap-1 text-xs text-text-secondary transition-colors hover:text-text"
                    >
                      <FileText className="size-3.5" aria-hidden />
                      паспорт
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-pill bg-surface-3 px-2 py-0.5 text-2xs text-text-secondary">
      <span className="text-text-tertiary">{label}</span> {value}
    </span>
  );
}
