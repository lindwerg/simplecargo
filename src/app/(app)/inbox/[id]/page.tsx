import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { auth } from "@/lib/auth";
import { AttachmentChips } from "@/components/inbox/AttachmentChips";
import { MarkReadOnMount } from "@/components/inbox/MarkReadOnMount";
import { LetterActions } from "@/components/inbox/LetterActions";
import { formatMailDate } from "@/components/inbox/mail-format";
import { getInboxEmailDetail } from "@/lib/mail-intake/inbox-repo";
import { getSavedDislocationSummary } from "@/lib/mail-intake/apply-dislocation";

export const metadata = { title: "Письмо" };
export const dynamic = "force-dynamic";

export default async function InboxEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { id } = await params;
  const email = await getInboxEmailDetail(id);
  if (!email) notFound();

  // Сохранённый разбор дислокации (wagon_movements по письму) — чтобы счётчики
  // «груж/порож» были видны после перезагрузки, а не один рендер после клика.
  const savedDislocation = await getSavedDislocationSummary(email.id);

  const when = formatMailDate(email.receivedAt);

  return (
    <div className="space-y-5">
      <MarkReadOnMount id={email.id} />

      <Link
        href="/inbox"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden /> Входящие
      </Link>

      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {email.hasRawEml && (
            <a
              href={`/api/inbox/${email.id}/eml`}
              className="ml-auto inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 px-2 py-0.5 text-2xs text-text-secondary transition-colors hover:bg-surface-3"
              title="Скачать оригинал письма (.eml)"
            >
              <Download className="size-3" aria-hidden /> .eml
            </a>
          )}
        </div>
        <h1 className="break-words text-lg font-semibold tracking-tight text-text">
          {email.subject && email.subject !== "email" ? email.subject : "(без темы)"}
        </h1>
        <p className="text-xs text-text-tertiary">
          {email.senderEmail ?? "отправитель неизвестен"}
          {when && (
            <>
              {" · "}
              <time dateTime={email.receivedAt ?? undefined}>{when}</time>
            </>
          )}
        </p>
      </header>

      {/* Тело письма — сразу видно: HTML 1:1 через srcDoc (песочница без
          allow-scripts режет JS), иначе текст inline. srcDoc обходит глобальные
          X-Frame-Options: DENY / frame-ancestors 'none', из-за которых src-iframe
          оставался пустым. */}
      <section className="rounded-lg border border-border bg-surface-1 p-1">
        {email.bodyHtml ? (
          <iframe
            srcDoc={email.bodyHtml}
            title="Тело письма"
            sandbox="allow-same-origin allow-popups"
            className="h-[70vh] w-full rounded-[var(--radius-md)] bg-white"
          />
        ) : email.bodyTextContent ? (
          <div className="whitespace-pre-wrap break-words p-4 text-sm leading-relaxed text-text">
            {email.bodyTextContent}
          </div>
        ) : (
          <p className="p-4 text-sm text-text-tertiary">Тело письма недоступно.</p>
        )}
      </section>

      {email.documents.length > 0 && (
        <section className="space-y-1.5">
          <p className="label-caps">Вложения</p>
          <AttachmentChips documents={email.documents} />
        </section>
      )}

      {/* Действия из письма: создать запрос/заявку, привязать к направлению, дислокация. */}
      <LetterActions
        emailId={email.id}
        directionId={email.directionId}
        directionLabel={email.directionLabel}
        savedDislocation={savedDislocation}
      />
    </div>
  );
}
