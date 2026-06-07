// Single source of truth for the «Входящие» tabs: URL key ↔ Russian label, the
// per-tab description + empty-state copy, and the per-kind chip styling. The URL
// ?tab= value equals the classifier kind (or "all" / "review"), so the API speaks
// kinds directly. Pure module — imported by server (page, InboxTabs) and client
// (EmailList).

import type { MailPartKind } from "@/lib/mail-intake/classify-schema";

export type InboxTabKey = "all" | MailPartKind | "review";

export interface InboxTabDef {
  key: InboxTabKey;
  label: string;
  blurb: string; // подзаголовок страницы на этой вкладке
  empty: string; // пустое состояние
}

export const INBOX_TABS: InboxTabDef[] = [
  {
    key: "all",
    label: "Все",
    blurb: "Все письма из почты — с вёрсткой и вложениями. Откройте письмо и отнесите его к нужному типу.",
    empty: "Пока пусто. Сюда попадают все письма, принятые из почты.",
  },
  {
    key: "client_rfq",
    label: "Запросы",
    blurb: "Письма, которые вы отнесли к запросам клиентов на вагоны.",
    empty: "Пусто. Относите сюда запросы клиентов из вкладки «Все».",
  },
  {
    key: "carrier_quote",
    label: "Ответы",
    blurb: "Письма, которые вы отнесли к ответам перевозчиков (ставки).",
    empty: "Пусто. Относите сюда ответы перевозчиков из вкладки «Все».",
  },
  {
    key: "invoice",
    label: "Счета",
    blurb: "Письма, которые вы отнесли к счетам/актам — основа для «Финансов».",
    empty: "Пусто. Относите сюда счета и акты из вкладки «Все».",
  },
  {
    key: "dislocation",
    label: "Дислокация",
    blurb: "Письма, которые вы отнесли к дислокации (слежение за вагонами).",
    empty: "Пусто. Относите сюда сводки дислокации из вкладки «Все».",
  },
  {
    key: "gu12",
    label: "ГУ-12",
    blurb: "Письма, которые вы отнесли к ГУ-12 / планам перевозок.",
    empty: "Пусто. Относите сюда письма по ГУ-12 из вкладки «Все».",
  },
  {
    key: "document",
    label: "Документы",
    blurb: "Письма, которые вы отнесли к документам (договоры, реквизиты).",
    empty: "Пусто. Относите сюда документы из вкладки «Все».",
  },
  {
    key: "claim",
    label: "Претензии",
    blurb: "Письма, которые вы отнесли к претензиям и юридической переписке.",
    empty: "Пусто. Относите сюда претензии из вкладки «Все».",
  },
  {
    key: "other",
    label: "Прочее",
    blurb: "Письма, которые вы отнесли к прочему.",
    empty: "Пусто. Относите сюда прочее из вкладки «Все».",
  },
  {
    key: "review",
    label: "Требует проверки",
    blurb: "Письма, которые ИИ принял, но не смог разнести сам. Подтвердите или отклоните.",
    empty:
      "Очередь пуста — всё, что прислали на почту, ИИ разобрал сам. Сюда попадают только письма, которые нужно проверить руками.",
  },
];

export function tabDef(key: string): InboxTabDef {
  return INBOX_TABS.find((t) => t.key === key) ?? INBOX_TABS[0];
}

export function isInboxTabKey(v: string | undefined | null): v is InboxTabKey {
  return INBOX_TABS.some((t) => t.key === v);
}

// Per-kind chip: short label + token-based tone. Differentiated by type so a mixed
// list reads at a glance (info=запросы, amber=ответы, green=счета, red=претензии…).
export const KIND_CHIP: Record<string, { label: string; cls: string }> = {
  client_rfq: { label: "Запрос", cls: "bg-info-quiet text-info" },
  carrier_quote: { label: "Ответ", cls: "bg-warn-quiet text-warn" },
  invoice: { label: "Счёт", cls: "bg-success-quiet text-success" },
  dislocation: { label: "Дислокация", cls: "bg-surface-3 text-text-secondary" },
  gu12: { label: "ГУ-12", cls: "bg-info-quiet text-info" },
  document: { label: "Документ", cls: "bg-surface-3 text-text-secondary" },
  claim: { label: "Претензия", cls: "bg-danger-quiet text-danger" },
  other: { label: "Прочее", cls: "bg-surface-2 text-text-tertiary" },
};
