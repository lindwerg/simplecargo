import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { IntakeStudio } from "@/components/requests/IntakeStudio";
import { getEmailExtractableText } from "@/lib/mail-intake/inbox-repo";

export const dynamic = "force-dynamic";

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ emailId?: string; target?: string }>;
}) {
  const { emailId, target: targetParam } = await searchParams;
  const target = targetParam === "deal" ? "deal" : "request";

  // Предзаполнение из письма: достаём текст тела + таблицы из вложений для ИИ.
  let prefillText = "";
  if (emailId) {
    try {
      prefillText = await getEmailExtractableText(emailId);
    } catch {
      // нет письма/текста — открываем пустую форму
    }
  }

  const isDeal = target === "deal";
  const fromEmail = Boolean(emailId);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link
          href={isDeal ? "/deals" : "/requests"}
          className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> {isDeal ? "Сделки" : "Запросы"}
        </Link>
        <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
          {isDeal ? "Новая заявка" : "Новый запрос"}
        </h1>
        <p className="text-sm text-text-secondary">
          {fromEmail
            ? "Распознаём письмо — проверьте строки направлений и сохраните."
            : "Загрузите план клиента, вставьте текст, скриншот или надиктуйте — ИИ разложит на направления. Проверьте и сохраните."}
        </p>
      </header>

      <IntakeStudio target={target} {...(prefillText ? { prefill: { text: prefillText } } : {})} />
    </div>
  );
}
