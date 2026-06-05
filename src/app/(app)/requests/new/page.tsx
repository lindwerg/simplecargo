import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { IntakeStudio } from "@/components/requests/IntakeStudio";

export const dynamic = "force-dynamic";

export default function NewRequestPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <Link href="/requests" className="inline-flex items-center gap-1 text-sm text-text-tertiary hover:text-text">
          <ArrowLeft className="size-4" aria-hidden /> Запросы
        </Link>
        <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
          Новый запрос
        </h1>
        <p className="text-sm text-text-secondary">
          Загрузите план клиента, вставьте текст, скриншот или надиктуйте — ИИ разложит на направления. Проверьте и
          сохраните.
        </p>
      </header>

      <IntakeStudio />
    </div>
  );
}
