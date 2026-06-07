import Link from "next/link";
import { ArrowLeft, Landmark } from "lucide-react";

import { buildCounterpartyRegistry } from "@/lib/partners/registry-build";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { RegistryBuildTable } from "@/components/partners/RegistryBuildTable";

export const dynamic = "force-dynamic";

// «Контрагенты из банка и почты — на проверку». Read-only сводка: все контрагенты
// из выписок Точки + реестра, с оборотами, подсказкой роли и подобранными почтами.
// Запись в реестр здесь НЕ происходит — это выгрузка для сверки оператором.
export default async function FromBankPage() {
  let rows: Awaited<ReturnType<typeof buildCounterpartyRegistry>> = [];
  let failed = false;
  try {
    rows = await buildCounterpartyRegistry();
  } catch (error: unknown) {
    failed = true;
    console.error("[partners] from-bank failed:", error instanceof Error ? error.message : error);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/partners"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К партнёрам
        </Link>
        <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
          Контрагенты из банка и почты
        </h1>
        <p className="max-w-3xl text-sm text-text-secondary">
          Сводка всех контрагентов из банковских выписок Точки: обороты по приходу/расходу,
          примеры назначений платежей и подсказка роли (перевозчик / клиент / прочее). Подобранные
          почты — из переписки по совпадению названия. Отметьте нужных, проверьте роль и почту и нажмите
          <strong> «Занести в партнёры»</strong> — карточки появятся в реестре.
        </p>
      </header>

      {failed ? (
        <ErrorState
          variant="page"
          message="Не удалось собрать выгрузку. Проверьте, что банк синхронизирован, и обновите страницу."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Данных пока нет"
          description="В банковских операциях ещё нет контрагентов. Запустите синхронизацию Точки, затем обновите страницу."
        />
      ) : (
        <RegistryBuildTable rows={rows} />
      )}
    </div>
  );
}
