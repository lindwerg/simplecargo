import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { PartnerForm } from "@/components/partners/PartnerForm";

export const dynamic = "force-dynamic";

export default function NewPartnerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/partners"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К партнёрам
        </Link>
        <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
          Новый партнёр
        </h1>
      </div>
      <PartnerForm />
    </div>
  );
}
