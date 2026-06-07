import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";

import { auth } from "@/lib/auth";
import { AttachmentChips } from "@/components/inbox/AttachmentChips";
import { MarkReadOnMount } from "@/components/inbox/MarkReadOnMount";
import { KIND_CHIP } from "@/components/inbox/inbox-tabs";
import { getInboxEmailDetail } from "@/lib/mail-intake/inbox-repo";

export const metadata = { title: "Письмо" };
export const dynamic = "force-dynamic";

export default async function InboxEmailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { id } = await params;
  const email = await getInboxEmailDetail(id);
  if (!email) notFound();

  const chip = email.kind ? KIND_CHIP[email.kind] : undefined;

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
          {chip && (
            <span className={`rounded-pill px-2 py-0.5 text-2xs font-medium ${chip.cls}`}>{chip.label}</span>
          )}
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
          {email.receivedAt && (
            <>
              {" · "}
              <time dateTime={email.receivedAt}>{new Date(email.receivedAt).toLocaleString("ru-RU")}</time>
            </>
          )}
        </p>
      </header>

      {email.documents.length > 0 && (
        <section className="space-y-1.5">
          <p className="label-caps">Вложения</p>
          <AttachmentChips documents={email.documents} />
        </section>
      )}

      <section className="rounded-lg border border-border bg-surface-1 p-1">
        {email.hasHtml ? (
          // Песочница: без allow-scripts → JS не выполняется (плюс строгий CSP на роуте).
          <iframe
            src={`/api/inbox/${email.id}/html`}
            title="Тело письма"
            sandbox="allow-same-origin allow-popups"
            className="h-[70vh] w-full rounded-[var(--radius-md)] bg-white"
          />
        ) : email.bodyText ? (
          <div className="space-y-2 p-4">
            <p className="text-sm text-text-tertiary">HTML-вид недоступен — откройте текст письма:</p>
            <AttachmentChips documents={[email.bodyText]} />
          </div>
        ) : (
          <p className="p-4 text-sm text-text-tertiary">Тело письма недоступно.</p>
        )}
      </section>
    </div>
  );
}
