import type { PartnerFinance, PartnerMail } from "@/lib/partners/general";
import type { ContactRow, DocumentRow } from "@/lib/partners/repository";
import { ContactsEditor } from "./ContactsEditor";
import { DocumentsPanel } from "./DocumentsPanel";
import { PaymentsPanel } from "./general/PaymentsPanel";
import { EmailBindingPanel } from "./general/EmailBindingPanel";

interface GeneralInfoTabProps {
  counterpartyId: string;
  finance: PartnerFinance;
  mail: PartnerMail;
  contacts: ContactRow[];
  documents: DocumentRow[];
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

/** «Общая информация»: payments (auto by ИНН), mail (manual), contacts and documents. */
export function GeneralInfoTab({
  counterpartyId,
  finance,
  mail,
  contacts,
  documents,
}: GeneralInfoTabProps) {
  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <PaymentsPanel finance={finance} />
      <EmailBindingPanel
        counterpartyId={counterpartyId}
        initialEmails={mail.boundEmails.map((e) => ({
          ...e,
          lastLetterAt: toIso(e.lastLetterAt),
        }))}
        initialLetters={mail.letters.map((l) => ({
          ...l,
          receivedAt: toIso(l.receivedAt),
        }))}
      />
      <ContactsEditor counterpartyId={counterpartyId} initialContacts={contacts} />
      <DocumentsPanel counterpartyId={counterpartyId} initialDocuments={documents} />
    </div>
  );
}
