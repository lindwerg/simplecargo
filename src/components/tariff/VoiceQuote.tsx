"use client";

import * as React from "react";
import { Mic, Square, Loader2, AlertTriangle, Calculator, Wand2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { StationField, type StationValue } from "@/components/common/StationField";

// ── Серверные формы ответа (зеркало MatrixResult / VoiceResponse) ───────────────
interface MatrixCell {
  tariffNoVat: number;
  tariffWithVat: number;
  inventoryNoVat: number | null;
  inventoryWithVat: number | null;
  provisionNoVat: number | null;
  provisionWithVat: number | null;
  inventoryConfidence: "yellow" | "red";
  inventoryRedReason: string | null;
}
interface MatrixRow {
  band: string;
  bandLabel: string;
  representativeCount: number;
  classic: MatrixCell;
  innovative: MatrixCell;
}
interface MatrixResult {
  scope: "supported" | "out-of-scope";
  confidence: "green" | "yellow" | "red";
  distanceKm: number | null;
  distanceLegs: ReadonlyArray<{ kind: string; km: number }>;
  tariffClass: 1 | 2 | 3 | null;
  etsngCode: string;
  etsngName: string | null;
  classicCapacityT: number;
  innovativeCapacityT: number;
  ownerCoeff: number;
  wagonType: string;
  vatRate: number;
  rows: MatrixRow[];
  warnings: string[];
}
interface VoiceIntent {
  originRaw: string | null;
  destRaw: string | null;
  markupPct: number | null;
  classicCapacityT?: number | null;
  innovativeCapacityT?: number | null;
  etsngHint?: string | null;
  transcript?: string | null;
}
interface StationResolution {
  status: "exact" | "ambiguous" | "none";
  esr: string | null;
  name: string | null;
}
interface VoiceResponse {
  intent: VoiceIntent;
  origin: StationResolution;
  dest: StationResolution;
  matrix: MatrixResult | null;
}

const rub = (n: number | null): string =>
  n === null ? "—" : `${Math.round(n).toLocaleString("ru-RU")} ₽`;

/** Первая red-причина по матрице (одна на тип вагона — все ячейки несут одну причину). */
function invRedReason(matrix: MatrixResult): string | null {
  for (const r of matrix.rows) {
    if (r.classic.inventoryConfidence === "red" && r.classic.inventoryRedReason) {
      return r.classic.inventoryRedReason;
    }
  }
  return null;
}

const LEG_RU: Record<string, string> = {
  "spur-origin": "Подвоз к ТП (отпр.)",
  backbone: "ТП ↔ ТП (Книга 3)",
  "spur-dest": "Подвоз от ТП (назн.)",
  "hub-adder": "Узловая надбавка",
  special: "Особое расстояние",
  direct: "Прямое ребро",
};

const fieldClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("read failed"));
    fr.readAsDataURL(blob);
  });
}

export function VoiceQuote() {
  const [origin, setOrigin] = React.useState<StationValue>({ raw: "", esr: null });
  const [dest, setDest] = React.useState<StationValue>({ raw: "", esr: null });
  const [classicCapT, setClassicCapT] = React.useState("70");
  const [innovCapT, setInnovCapT] = React.useState("75");
  const [ownerCoeff, setOwnerCoeff] = React.useState("1.15");
  const [wagonType, setWagonType] = React.useState("ПВ");

  const [recording, setRecording] = React.useState(false);
  const [parsing, setParsing] = React.useState(false);
  const [computing, setComputing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [transcript, setTranscript] = React.useState<string | null>(null);
  const [cargoNote, setCargoNote] = React.useState<string | null>(null);
  const [matrix, setMatrix] = React.useState<MatrixResult | null>(null);
  const [withVat, setWithVat] = React.useState(false);
  const [textCmd, setTextCmd] = React.useState("");

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const chunksRef = React.useRef<Blob[]>([]);

  const canCompute = Boolean(origin.esr && dest.esr) && !computing;

  // ── Применить ответ распознавания к полям формы ──────────────────────────────
  function applyVoiceResponse(data: VoiceResponse) {
    const { intent, origin: o, dest: d } = data;
    setTranscript(intent.transcript ?? null);
    setCargoNote(
      intent.etsngHint && intent.etsngHint.trim()
        ? `Назван груз «${intent.etsngHint.trim()}» — расчёт по умолчанию для щебня (класс 1). Иной груз задайте в основном калькуляторе.`
        : null,
    );
    // «предоставление под +15» → коэффициент собственника 1.15.
    if (intent.markupPct != null) setOwnerCoeff(String(1 + intent.markupPct / 100));
    if (intent.classicCapacityT != null) setClassicCapT(String(intent.classicCapacityT));
    if (intent.innovativeCapacityT != null) setInnovCapT(String(intent.innovativeCapacityT));
    setOrigin({ raw: o.name ?? intent.originRaw ?? "", esr: o.esr });
    setDest({ raw: d.name ?? intent.destRaw ?? "", esr: d.esr });
    setMatrix(data.matrix);
    if (!data.matrix && (o.status !== "exact" || d.status !== "exact")) {
      setError("Уточните станции из подсказок — затем «Пересчитать».");
    }
  }

  async function sendVoice(payload: { dataUrl?: string; text?: string }) {
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/tariff/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error ?? "Не удалось распознать команду");
        return;
      }
      applyVoiceResponse(json.data as VoiceResponse);
    } catch {
      setError("Сеть недоступна — попробуйте ещё раз.");
    } finally {
      setParsing(false);
    }
  }

  async function startRecording() {
    setError(null);
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
        await sendVoice({ dataUrl });
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Не удалось получить доступ к микрофону.");
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function recompute() {
    if (!origin.esr || !dest.esr) {
      setError("Подтвердите станции отправления и назначения (выберите из подсказок).");
      return;
    }
    setComputing(true);
    setError(null);
    try {
      const res = await fetch("/api/tariff/matrix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originEsr: origin.esr,
          destEsr: dest.esr,
          classicCapacityT: Number(classicCapT) || undefined,
          innovativeCapacityT: Number(innovCapT) || undefined,
          ownerCoeff: ownerCoeff === "" ? undefined : Number(ownerCoeff),
          wagonType: wagonType || undefined,
        }),
      });
      const json = await res.json();
      if (!json?.success) {
        setError(json?.error ?? "Ошибка расчёта");
        return;
      }
      setMatrix(json.data as MatrixResult);
    } catch {
      setError("Сеть недоступна — попробуйте ещё раз.");
    } finally {
      setComputing(false);
    }
  }

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="label-caps">Быстрый расчёт голосом</p>
          <p className="mt-1 text-2xs text-text-tertiary">
            «посчитай тариф со станции Асбест на станцию Голышманово и предоставление под +15»
          </p>
        </div>
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={parsing}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-medium md:h-10",
            "focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-40",
            recording
              ? "bg-danger text-text-inverse"
              : "bg-accent text-text-inverse hover:opacity-90",
          )}
        >
          {parsing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : recording ? (
            <Square className="size-4" aria-hidden />
          ) : (
            <Mic className="size-4" aria-hidden />
          )}
          {parsing ? "Распознаю…" : recording ? "Стоп" : "Надиктовать"}
        </button>
      </div>

      {/* Текстовый фолбэк */}
      <div className="mt-3 flex gap-2">
        <input
          className={fieldClass}
          value={textCmd}
          placeholder="…или впишите команду текстом"
          onChange={(e) => setTextCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && textCmd.trim()) void sendVoice({ text: textCmd.trim() });
          }}
        />
        <button
          type="button"
          onClick={() => textCmd.trim() && sendVoice({ text: textCmd.trim() })}
          disabled={parsing || !textCmd.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border px-3 text-2xs text-text-secondary hover:text-text disabled:opacity-40 md:h-9"
        >
          <Wand2 className="size-3.5" aria-hidden /> Разобрать
        </button>
      </div>

      {transcript && (
        <p className="mt-2 text-2xs text-text-tertiary">
          Распознано: <span className="text-text-secondary">«{transcript}»</span>
        </p>
      )}

      {/* Поля (редактируемые) */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <StationField label="Откуда" value={origin} onChange={setOrigin} />
        <StationField label="Куда" value={dest} onChange={setDest} />
      </div>
      <div className="mt-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-text-tertiary">Род вагона (инвентарный/предоставление)</span>
          <select
            className={cn(fieldClass, "appearance-none")}
            value={wagonType}
            onChange={(e) => setWagonType(e.target.value)}
          >
            <option value="ПВ">Полувагон (ПВ) — И1 + В4</option>
            <option value="ПЛ">Платформа (ПЛ) — И1 + В1</option>
            <option value="КР">Крытый (КР) — без коэф. п.1.5, не выдаётся</option>
          </select>
        </label>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-text-tertiary">Г/п обычного, т</span>
          <input
            className={cn(fieldClass, "tabular-nums")}
            value={classicCapT}
            inputMode="decimal"
            onChange={(e) => setClassicCapT(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-text-tertiary">Г/п инновац., т</span>
          <input
            className={cn(fieldClass, "tabular-nums")}
            value={innovCapT}
            inputMode="decimal"
            onChange={(e) => setInnovCapT(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-text-tertiary">Коэфф. собственника ×</span>
          <input
            className={cn(fieldClass, "tabular-nums")}
            value={ownerCoeff}
            inputMode="decimal"
            onChange={(e) => setOwnerCoeff(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </label>
      </div>

      <button
        type="button"
        onClick={recompute}
        disabled={!canCompute}
        className={cn(
          "mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-medium md:h-10",
          "bg-accent text-text-inverse transition-opacity hover:opacity-90 disabled:opacity-40",
          "focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
        )}
      >
        {computing ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Calculator className="size-4" aria-hidden />
        )}
        Пересчитать матрицу
      </button>

      {error && (
        <p className="mt-2 flex items-center gap-1.5 text-2xs text-danger">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
      {cargoNote && <p className="mt-2 text-2xs text-text-tertiary">{cargoNote}</p>}

      {matrix && (
        <MatrixView matrix={matrix} withVat={withVat} onToggleVat={() => setWithVat((v) => !v)} />
      )}
    </section>
  );
}

function MatrixView({
  matrix,
  withVat,
  onToggleVat,
}: {
  matrix: MatrixResult;
  withVat: boolean;
  onToggleVat: () => void;
}) {
  const supported = matrix.scope === "supported" && matrix.rows.length > 0;
  return (
    <div className="mt-4 space-y-3">
      {/* Расстояние */}
      <div className="rounded-[var(--radius-sm)] border border-border/60 bg-surface-2 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-2xs text-text-tertiary">Тарифное расстояние</span>
          <span className="num text-lg font-semibold tabular-nums text-text">
            {matrix.distanceKm !== null
              ? `${matrix.distanceKm.toLocaleString("ru-RU")} км`
              : "—"}
          </span>
        </div>
        {matrix.distanceLegs.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {matrix.distanceLegs.map((l, i) => (
              <li key={i} className="flex justify-between text-2xs text-text-secondary">
                <span>{LEG_RU[l.kind] ?? l.kind}</span>
                <span className="tabular-nums">{l.km.toLocaleString("ru-RU")} км</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {supported ? (
        <>
          <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-quiet p-2 text-2xs text-text-secondary">
            <span className="font-medium text-accent">⚠ Инвентарный тариф и предоставление — «проверяется».</span>{" "}
            Считаются из официальных таблиц И+В (род вагона: {matrix.wagonType}), но НЕ сверены до рубля
            с R-Тарифом общего парка. Собственный тариф (нижняя строка) — выверен. Ставка
            предоставления = инвентарный × {matrix.ownerCoeff}.
          </div>
          {invRedReason(matrix) && (
            <div className="rounded-[var(--radius-sm)] border border-danger/30 bg-surface-2 p-2 text-2xs text-text-secondary">
              <span className="font-medium text-danger">Инвентарный для «{matrix.wagonType}» не выдан:</span>{" "}
              {invRedReason(matrix)}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-2xs text-text-tertiary">
              Крупным — <span className="text-accent">предоставление</span>; ниже — инвентарный (И+В); внизу — собственный тариф
            </p>
            <div className="inline-flex overflow-hidden rounded-pill border border-border text-2xs">
              <button
                type="button"
                onClick={onToggleVat}
                className={cn(
                  "px-2.5 py-1",
                  !withVat ? "bg-accent text-text-inverse" : "text-text-secondary",
                )}
              >
                без НДС
              </button>
              <button
                type="button"
                onClick={onToggleVat}
                className={cn(
                  "px-2.5 py-1",
                  withVat ? "bg-accent text-text-inverse" : "text-text-secondary",
                )}
              >
                с НДС {matrix.vatRate}%
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-[var(--radius-sm)] border border-border/60">
            <table className="w-full text-2xs">
              <thead className="bg-surface-2 text-text-tertiary">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Группа</th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    Обычный {matrix.classicCapacityT} т
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    Инновац. {matrix.innovativeCapacityT} т ⚡
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {matrix.rows.map((r) => (
                  <tr key={r.band} className="text-text-secondary">
                    <td className="px-2 py-2">{r.bandLabel}</td>
                    <Cell cell={r.classic} withVat={withVat} />
                    <Cell cell={r.innovative} withVat={withVat} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {matrix.etsngName && (
            <p className="text-2xs text-text-tertiary">
              Груз: {matrix.etsngName} · класс {matrix.tariffClass ?? "—"} · цена за вагон
            </p>
          )}
        </>
      ) : (
        <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-quiet p-3 text-2xs text-text-secondary">
          <p className="font-medium text-accent">Цена не рассчитана автоматически</p>
          {matrix.warnings.map((w, i) => (
            <p key={i} className="mt-1">
              {w}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function Cell({ cell, withVat }: { cell: MatrixCell; withVat: boolean }) {
  const tariff = withVat ? cell.tariffWithVat : cell.tariffNoVat;
  const inventory = withVat ? cell.inventoryWithVat : cell.inventoryNoVat;
  const provision = withVat ? cell.provisionWithVat : cell.provisionNoVat;
  return (
    <td className="px-2 py-2 text-right tabular-nums">
      <div className="text-sm font-semibold text-accent">{rub(provision)}</div>
      <div className="text-2xs text-text-secondary">инв. {rub(inventory)}</div>
      <div className="text-2xs text-text-tertiary">свой {rub(tariff)}</div>
    </td>
  );
}

