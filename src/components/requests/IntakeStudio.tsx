"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Loader2, Mic, Plus, Square, Trash2, Type } from "lucide-react";

import { cn } from "@/lib/utils";
import { ClientPicker, type ClientValue } from "./ClientPicker";
import { ClientConfirmBanner } from "./ClientConfirmBanner";
import { RateModeInput } from "./RateModeInput";
import { StationField } from "./StationField";
import { WagonTypePicker } from "./WagonTypePicker";

const DEFAULT_TARIFF_REF = "10-01";

type Channel = "upload" | "voice" | "paste" | "manual";
type Phase = "intake" | "review";

interface LineDraft {
  key: string;
  originRaw: string;
  originRoadRaw: string;
  originEsr: string | null;
  destRaw: string;
  destRoadRaw: string;
  destEsr: string | null;
  cargoName: string;
  wagonsRequested: string;
  tonnagePerWagon: string;
  wagonType: string;
  targetRateRaw: string;
  targetRateKind: string;
  targetRateMarkupPct: string;
  targetTariffClass: string;
}

interface ExtractedLine {
  originRaw: string | null;
  originRoadRaw: string | null;
  originEsr: string | null;
  destRaw: string | null;
  destRoadRaw: string | null;
  destEsr: string | null;
  cargoName: string | null;
  wagonsRequested: number | null;
  tonnagePerWagon: number | null;
  targetRatePerWagon: number | null;
  targetRateRaw: string | null;
  wagonType: string | null;
  targetRateKind: string | null;
  targetRateMarkupPct: number | null;
  targetTariffClass: number | null;
}

interface ExtractionResult {
  clientGuess: string | null;
  wagonType: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  lines: ExtractedLine[];
  warnings: string[];
}

const inputClass =
  "h-11 w-full min-w-0 rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

let keySeq = 0;
function emptyLine(headerWagonType = ""): LineDraft {
  keySeq += 1;
  return {
    key: `l${keySeq}`,
    originRaw: "",
    originRoadRaw: "",
    originEsr: null,
    destRaw: "",
    destRoadRaw: "",
    destEsr: null,
    cargoName: "",
    wagonsRequested: "",
    tonnagePerWagon: "",
    wagonType: headerWagonType,
    targetRateRaw: "",
    targetRateKind: "flat_rub",
    targetRateMarkupPct: "",
    targetTariffClass: "1",
  };
}

function fromExtracted(l: ExtractedLine, headerWagonType = ""): LineDraft {
  keySeq += 1;
  return {
    key: `l${keySeq}`,
    originRaw: l.originRaw ?? "",
    originRoadRaw: l.originRoadRaw ?? "",
    originEsr: l.originEsr ?? null,
    destRaw: l.destRaw ?? "",
    destRoadRaw: l.destRoadRaw ?? "",
    destEsr: l.destEsr ?? null,
    cargoName: l.cargoName ?? "",
    wagonsRequested: l.wagonsRequested != null ? String(l.wagonsRequested) : "",
    tonnagePerWagon: l.tonnagePerWagon != null ? String(l.tonnagePerWagon) : "",
    wagonType: l.wagonType ?? headerWagonType,
    targetRateRaw: l.targetRateRaw ?? (l.targetRatePerWagon != null ? String(l.targetRatePerWagon) : ""),
    targetRateKind: l.targetRateKind ?? "flat_rub",
    targetRateMarkupPct: l.targetRateMarkupPct != null ? String(l.targetRateMarkupPct) : "",
    targetTariffClass: l.targetTariffClass != null ? String(l.targetTariffClass) : "1",
  };
}

function esrOrUndef(esr: string | null): string | undefined {
  return esr && esr.length === 6 ? esr : undefined;
}

function parseRub(raw: string): number {
  return Number(raw.replace(/[^\d.,]/g, "").replace(",", "."));
}

// Map a LineDraft → /api/requests line payload. flat_rub sends the parsed ₽ amount;
// the tariff-indicative kind sends the kind + numeric markup% + 1|2|3 class + 10-01 ref.
function buildLinePayload(l: LineDraft, headerWagonType: string) {
  const base = {
    originRaw: l.originRaw.trim(),
    originRoadRaw: l.originRoadRaw.trim() || undefined,
    originEsr: esrOrUndef(l.originEsr),
    destRaw: l.destRaw.trim(),
    destRoadRaw: l.destRoadRaw.trim() || undefined,
    destEsr: esrOrUndef(l.destEsr),
    cargoName: l.cargoName.trim() || undefined,
    wagonsRequested: Number(l.wagonsRequested) || 1,
    tonnagePerWagon: l.tonnagePerWagon ? Number(l.tonnagePerWagon) : undefined,
    wagonType: l.wagonType.trim() || headerWagonType.trim() || undefined,
    targetRateRaw: l.targetRateRaw.trim() || undefined,
  };

  if (l.targetRateKind === "flat_rub") {
    const rate = parseRub(l.targetRateRaw);
    return {
      ...base,
      targetRateKind: "flat_rub" as const,
      targetRatePerWagon: Number.isFinite(rate) && rate > 0 ? rate : undefined,
    };
  }

  const markup = Number(String(l.targetRateMarkupPct).replace(",", "."));
  const cls = Number(l.targetTariffClass);
  return {
    ...base,
    targetRateKind: l.targetRateKind,
    targetRateMarkupPct: Number.isFinite(markup) ? markup : 0,
    targetTariffClass: cls >= 1 && cls <= 3 ? cls : undefined,
    targetTariffRef: DEFAULT_TARIFF_REF,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("read error"));
    reader.readAsDataURL(blob);
  });
}

export function IntakeStudio() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intake");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);

  const [channel, setChannel] = useState<Channel>("manual");
  const [client, setClient] = useState<ClientValue>(null);
  const [showGuess, setShowGuess] = useState<string | null>(null);
  const [wagonType, setWagonType] = useState("ПВ");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([]);

  const [pasteText, setPasteText] = useState("");
  const [recording, setRecording] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function applyResult(data: ExtractionResult, ch: Channel) {
    setChannel(ch);
    const headerType = data.wagonType ?? "";
    if (headerType) setWagonType(headerType);
    // D16: never auto-confirm — set a temp client + raise the «это они?» banner.
    if (data.clientGuess && client?.kind !== "existing") {
      setClient({ kind: "temp", name: data.clientGuess });
      setShowGuess(data.clientGuess);
    }
    const drafts = data.lines.map((l) => fromExtracted(l, headerType));
    setLines(drafts.length > 0 ? drafts : [emptyLine(headerType)]);
    setWarnings(data.warnings ?? []);
    setPhase("review");
  }

  async function runExtract(body: FormData | object, isForm: boolean, ch: Channel) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/requests/extract", {
        method: "POST",
        ...(isForm
          ? { body: body as FormData }
          : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Не удалось распознать");
      }
      applyResult(json.data as ExtractionResult, ch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка распознавания");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    if (client?.name) fd.append("clientHint", client.name);
    await runExtract(fd, true, "upload");
  }

  async function onPaste() {
    if (!pasteText.trim()) return;
    await runExtract({ modality: "text", text: pasteText, clientHint: client?.name }, false, "paste");
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        const dataUrl = await blobToDataUrl(blob);
        await runExtract({ modality: "audio", dataUrl, clientHint: client?.name }, false, "voice");
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Не удалось получить доступ к микрофону");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function save() {
    setError(null);
    const payloadLines = lines
      .filter((l) => l.originRaw.trim() && l.destRaw.trim())
      .map((l) => buildLinePayload(l, wagonType));

    if (payloadLines.length === 0) {
      setError("Добавьте хотя бы одно направление со станциями");
      return;
    }

    const body = {
      clientSuggestedId: client?.kind === "existing" ? client.id : undefined,
      clientRaw: client?.kind === "temp" ? client.name : undefined,
      channel,
      wagonType: wagonType.trim() || undefined,
      notes: notes.trim() || undefined,
      lines: payloadLines,
    };

    setBusy(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Не удалось сохранить");
      router.push("/requests/actual?view=clients");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
      setBusy(false);
    }
  }

  // ── INTAKE PHASE ──────────────────────────────────────────────────────────
  if (phase === "intake") {
    return (
      <div className="flex flex-col gap-6">
        {error && <Banner tone="danger">{error}</Banner>}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) void onFile(f);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-[var(--radius-xl)] border-2 border-dashed border-border bg-surface-inset px-6 py-8 text-center transition-[border-color,background-color] duration-[var(--duration-fast)] sm:px-8 sm:py-14",
            dragging && "intake-dropzone--drag",
          )}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3 text-text-secondary">
              <Loader2 className="size-6 animate-spin text-accent" aria-hidden />
              <p className="text-sm">ИИ распознаёт запрос…</p>
            </div>
          ) : (
            <>
              <div className="flex size-12 items-center justify-center rounded-[var(--radius-lg)] bg-surface-3 text-accent">
                <FileUp className="size-6" aria-hidden strokeWidth={1.8} />
              </div>
              <div>
                <p className="text-md text-text">Перетащите файл клиента</p>
                <p className="mt-1 text-sm text-text-tertiary">xlsx, xls, png, jpg — план направлений или скриншот</p>
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 text-sm text-text hover:border-accent hover:bg-accent-quiet focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
              >
                Выбрать файл
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.png,.jpg,.jpeg,.webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onFile(f);
                }}
              />
            </>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* paste */}
          <div className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-4">
            <div className="flex items-center gap-2 text-sm text-text">
              <Type className="size-4 text-accent" aria-hidden /> Вставить текст
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Вставьте сообщение клиента: маршруты, вагоны, ставки…"
              rows={4}
              className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface-inset p-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            />
            <button
              type="button"
              disabled={busy || !pasteText.trim()}
              onClick={() => void onPaste()}
              className="self-start inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse disabled:opacity-50 hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
            >
              Распознать
            </button>
          </div>

          {/* voice */}
          <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-4">
            <div className="flex items-center gap-2 text-sm text-text">
              <Mic className="size-4 text-accent" aria-hidden /> Надиктовать голосом
            </div>
            <p className="text-sm text-text-tertiary">
              Нажмите и продиктуйте: «Дай 20 вагонов Екатеринбург — Москва…» — ИИ заполнит карточки.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => (recording ? stopRecording() : void startRecording())}
              aria-pressed={recording}
              className={cn(
                "self-start inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-semibold focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
                recording
                  ? "bg-danger-quiet text-danger status-dot--pulse"
                  : "border border-border bg-surface-3 text-text hover:border-accent",
              )}
            >
              {recording ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
              {recording ? "Остановить" : "Записать"}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 text-sm text-text-tertiary">
          <span className="h-px flex-1 bg-border-subtle" />
          или
          <span className="h-px flex-1 bg-border-subtle" />
        </div>
        <button
          type="button"
          onClick={() => {
            setChannel("manual");
            setLines([emptyLine(wagonType)]);
            setPhase("review");
          }}
          className="mx-auto inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 text-sm text-text hover:bg-surface-3 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
        >
          <Plus className="size-4" aria-hidden /> Ввести вручную
        </button>
      </div>
    );
  }

  // ── REVIEW PHASE ──────────────────────────────────────────────────────────
  const totalWagons = lines.reduce((s, l) => s + (Number(l.wagonsRequested) || 0), 0);

  return (
    <div className="flex flex-col gap-6">
      {error && <Banner tone="danger">{error}</Banner>}
      {warnings.length > 0 && (
        <Banner tone="warn">
          <ul className="list-disc pl-4">
            {warnings.slice(0, 6).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-4">
        {showGuess && (
          <ClientConfirmBanner
            guess={showGuess}
            onConfirm={(m) => {
              setClient({ kind: "existing", id: m.id, name: m.name });
              setShowGuess(null);
            }}
            onReject={() => setShowGuess(null)}
          />
        )}
        <ClientPicker value={client} onChange={setClient} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            Вагон
            <WagonTypePicker value={wagonType} onChange={setWagonType} className="w-44" />
          </label>
          <span className="font-mono text-sm tabular-nums text-text-secondary">
            {lines.length} напр. · {totalWagons} ваг
          </span>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Примечание к запросу (необязательно)"
          rows={2}
          className="w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface-inset p-2.5 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        />
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <div key={l.key} className="rounded-[var(--radius-lg)] border border-border bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-xs text-text-tertiary">#{i + 1}</span>
              <button
                type="button"
                onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))}
                aria-label="Удалить направление"
                className="-mr-2 inline-flex size-11 items-center justify-center text-text-tertiary hover:text-danger md:size-9"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <StationField
                label="Станция отправления"
                raw={l.originRaw}
                road={l.originRoadRaw}
                esr={l.originEsr}
                onChange={(p) =>
                  updateLine(l.key, {
                    ...(p.raw !== undefined ? { originRaw: p.raw } : {}),
                    ...(p.road !== undefined ? { originRoadRaw: p.road } : {}),
                    ...(p.esr !== undefined ? { originEsr: p.esr } : {}),
                  })
                }
              />
              <StationField
                label="Станция назначения"
                raw={l.destRaw}
                road={l.destRoadRaw}
                esr={l.destEsr}
                onChange={(p) =>
                  updateLine(l.key, {
                    ...(p.raw !== undefined ? { destRaw: p.raw } : {}),
                    ...(p.road !== undefined ? { destRoadRaw: p.road } : {}),
                    ...(p.esr !== undefined ? { destEsr: p.esr } : {}),
                  })
                }
              />
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Вагонов">
                  <input className={inputClass} inputMode="numeric" value={l.wagonsRequested} onChange={(e) => updateLine(l.key, { wagonsRequested: e.target.value })} />
                </Field>
                <Field label="Тонн/ваг">
                  <input className={inputClass} inputMode="decimal" value={l.tonnagePerWagon} onChange={(e) => updateLine(l.key, { tonnagePerWagon: e.target.value })} />
                </Field>
                <Field label="Тип вагона">
                  <WagonTypePicker value={l.wagonType} onChange={(v) => updateLine(l.key, { wagonType: v })} />
                </Field>
                <Field label="Груз">
                  <input className={inputClass} value={l.cargoName} onChange={(e) => updateLine(l.key, { cargoName: e.target.value })} />
                </Field>
              </div>
              <Field label="Желаемая ставка">
                <RateModeInput
                  kind={l.targetRateKind}
                  flatRaw={l.targetRateRaw}
                  markupPct={l.targetRateMarkupPct}
                  tariffClass={l.targetTariffClass}
                  onChange={(p) =>
                    updateLine(l.key, {
                      ...(p.kind !== undefined ? { targetRateKind: p.kind } : {}),
                      ...(p.flatRaw !== undefined ? { targetRateRaw: p.flatRaw } : {}),
                      ...(p.markupPct !== undefined ? { targetRateMarkupPct: p.markupPct } : {}),
                      ...(p.tariffClass !== undefined ? { targetTariffClass: p.tariffClass } : {}),
                    })
                  }
                />
              </Field>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, emptyLine(wagonType)])}
          className="inline-flex h-11 items-center gap-2 self-start rounded-[var(--radius-md)] border border-dashed border-border px-4 text-sm text-text-secondary hover:border-accent hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9"
        >
          <Plus className="size-4" aria-hidden /> Добавить направление
        </button>
      </div>

      <div className="sticky bottom-[calc(var(--bottombar-clearance)+env(safe-area-inset-bottom))] flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-3 md:bottom-[calc(1rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => setPhase("intake")}
          className="h-10 rounded-[var(--radius-md)] px-4 text-sm text-text-secondary hover:text-text"
        >
          Назад
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-5 text-sm font-semibold text-text-inverse disabled:opacity-50 hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Сохранить запрос
        </button>
      </div>
    </div>
  );
}

function Field({ label, span2, children }: { label: string; span2?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", span2 && "col-span-2")}>
      <span className="label-caps">{label}</span>
      {children}
    </label>
  );
}

function Banner({ tone, children }: { tone: "danger" | "warn"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "rounded-[var(--radius-md)] border px-4 py-3 text-sm",
        tone === "danger" ? "border-danger bg-danger-quiet text-danger" : "border-warn bg-warn-quiet text-warn",
      )}
    >
      {children}
    </div>
  );
}
