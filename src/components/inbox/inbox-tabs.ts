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
    blurb: "Все письма, которые ИИ принял из почты и разложил по типам.",
    empty: "Пока пусто. Сюда попадают все письма, принятые из почты.",
  },
  {
    key: "client_rfq",
    label: "Запросы",
    blurb: "Запросы клиентов на вагоны: маршруты, объёмы, ставки.",
    empty: "Нет запросов клиентов. Сюда ИИ складывает заявки на вагоны.",
  },
  {
    key: "carrier_quote",
    label: "Ответы",
    blurb: "Ответы перевозчиков на наши запросы ставок.",
    empty: "Нет ответов перевозчиков. Здесь появляются ставки собственников.",
  },
  {
    key: "invoice",
    label: "Счета",
    blurb: "Счета, счета-фактуры и акты на оплату — основа для «Финансов».",
    empty: "Нет счетов. Сюда попадают счета, счета-фактуры и акты.",
  },
  {
    key: "dislocation",
    label: "Дислокация",
    blurb: "Сводки слежения за вагонами: местоположение, подход, отцепки.",
    empty: "Нет сводок дислокации. Здесь будут отчёты по вагонам.",
  },
  {
    key: "gu12",
    label: "ГУ-12",
    blurb: "Заявки на перевозку формы ГУ-12, планы перевозок (ППС/ПРР).",
    empty: "Нет писем по ГУ-12. Здесь будут заявки на перевозку.",
  },
  {
    key: "document",
    label: "Документы",
    blurb: "Договоры, протоколы разногласий, реквизиты, спецификации.",
    empty: "Нет документов. Сюда попадают договоры и приложения.",
  },
  {
    key: "claim",
    label: "Претензии",
    blurb: "Претензии и юридическая переписка: неоплаты, долги, суды.",
    empty: "Нет претензий. Сюда попадает претензионная переписка.",
  },
  {
    key: "other",
    label: "Прочее",
    blurb: "Прочая переписка и уведомления, не попавшие в другие типы.",
    empty: "Пусто. Сюда попадает всё остальное.",
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
