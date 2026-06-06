import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { counterpartyContacts } from "@/lib/db/schema/counterpartyContacts";
import { counterpartyDocuments } from "@/lib/db/schema/counterpartyDocuments";
import { requests } from "@/lib/db/schema/requests";
import { deals } from "@/lib/db/schema/deals";
import { counterpartyContracts, priceProtocols } from "@/lib/db/schema/pricing";
import { normalizeEmail } from "./schema";
import type {
  ContactInput,
  CreatePartnerInput,
  DocumentMetaInput,
  UpdatePartnerInput,
} from "./schema";

// Domain error mapped to an HTTP status by the route handlers (parallel to AuthError
// / DirectionError).
export class PartnerError extends Error {
  constructor(
    public readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "PartnerError";
  }
}

const LIST_LIMIT = 500;

export interface PartnerListItem {
  id: string;
  name: string;
  roles: string[];
  inn: string | null;
  contactsCount: number;
  documentsCount: number;
  directionsCount: number;
  requestsCount: number;
}

interface ListRow {
  id: string;
  name: string;
  roles: string[] | null;
  inn: string | null;
  contacts_count: number;
  documents_count: number;
  directions_count: number;
  requests_count: number;
  [column: string]: unknown;
}

// Directory list for /partners. Optional fuzzy search (trigram + substring) and a
// role filter (roles @> ARRAY[role]). Aggregate counts power the card metrics.
export async function listPartners(opts: {
  search?: string | undefined;
  role?: string | undefined;
}): Promise<PartnerListItem[]> {
  const search = opts.search?.trim() ?? "";
  const role = opts.role?.trim() ?? "";

  const roleFilter = role ? sql`AND c.roles @> ARRAY[${role}]::text[]` : sql``;
  const searchFilter = search
    ? sql`AND (c.name_canonical ILIKE ${"%" + search + "%"} OR similarity(c.name_canonical, ${search}) > 0.2)`
    : sql``;

  const result = await db.execute<ListRow>(sql`
    SELECT
      c.id,
      c.name_canonical AS name,
      c.roles,
      c.inn,
      (SELECT count(*)::int FROM counterparty_contacts cc WHERE cc.counterparty_id = c.id) AS contacts_count,
      (SELECT count(*)::int FROM counterparty_documents cd WHERE cd.counterparty_id = c.id) AS documents_count,
      (SELECT count(*)::int FROM directions d
         WHERE d.client_counterparty_id = c.id OR d.owner_counterparty_id = c.id) AS directions_count,
      (SELECT count(*)::int FROM requests r WHERE r.client_suggested_id = c.id) AS requests_count
    FROM counterparties c
    WHERE TRUE ${roleFilter} ${searchFilter}
    ORDER BY c.name_canonical ASC
    LIMIT ${LIST_LIMIT}
  `);

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    roles: r.roles ?? [],
    inn: r.inn,
    contactsCount: r.contacts_count,
    documentsCount: r.documents_count,
    directionsCount: r.directions_count,
    requestsCount: r.requests_count,
  }));
}

// Create a company. Rejects a duplicate canonical name (unique constraint surfaced
// as a friendly 409).
export async function createPartner(input: CreatePartnerInput): Promise<{ id: string }> {
  const name = input.name.trim();
  const existing = await db
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.nameCanonical, name))
    .limit(1);
  if (existing[0]) {
    throw new PartnerError(409, "Компания с таким названием уже есть в базе");
  }

  const inserted = await db
    .insert(counterparties)
    .values({
      nameCanonical: name,
      roles: input.roles,
      inn: input.inn,
      notes: input.notes,
    })
    .returning({ id: counterparties.id });
  return { id: inserted[0].id };
}

export async function updatePartner(
  id: string,
  input: UpdatePartnerInput,
): Promise<{ id: string }> {
  const current = await db
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.id, id))
    .limit(1);
  if (!current[0]) throw new PartnerError(404, "Компания не найдена");

  const patch: Partial<typeof counterparties.$inferInsert> = {};
  if (input.name !== undefined) patch.nameCanonical = input.name.trim();
  if (input.roles !== undefined) patch.roles = input.roles;
  if (input.inn !== undefined) patch.inn = input.inn ?? null;
  if (input.notes !== undefined) patch.notes = input.notes ?? null;

  if (Object.keys(patch).length > 0) {
    try {
      await db.update(counterparties).set(patch).where(eq(counterparties.id, id));
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new PartnerError(409, "Компания с таким названием уже есть в базе");
      }
      throw error;
    }
  }
  return { id };
}

export async function deletePartner(id: string): Promise<{ id: string }> {
  const deleted = await db
    .delete(counterparties)
    .where(eq(counterparties.id, id))
    .returning({ id: counterparties.id });
  if (!deleted[0]) throw new PartnerError(404, "Компания не найдена");
  return { id: deleted[0].id };
}

// ── Contacts ────────────────────────────────────────────────────────────────

export interface ContactRow {
  id: string;
  fullName: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
  note: string | null;
}

export async function listContacts(counterpartyId: string): Promise<ContactRow[]> {
  const rows = await db
    .select({
      id: counterpartyContacts.id,
      fullName: counterpartyContacts.fullName,
      position: counterpartyContacts.position,
      phone: counterpartyContacts.phone,
      email: counterpartyContacts.email,
      isPrimary: counterpartyContacts.isPrimary,
      note: counterpartyContacts.note,
    })
    .from(counterpartyContacts)
    .where(eq(counterpartyContacts.counterpartyId, counterpartyId))
    .orderBy(desc(counterpartyContacts.isPrimary), asc(counterpartyContacts.createdAt));
  return rows;
}

async function assertPartnerExists(id: string): Promise<void> {
  const rows = await db
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.id, id))
    .limit(1);
  if (!rows[0]) throw new PartnerError(404, "Компания не найдена");
}

export async function addContact(
  counterpartyId: string,
  input: ContactInput,
): Promise<{ id: string }> {
  await assertPartnerExists(counterpartyId);
  const inserted = await db
    .insert(counterpartyContacts)
    .values({
      counterpartyId,
      fullName: input.fullName,
      position: input.position,
      phone: input.phone,
      email: input.email,
      isPrimary: input.isPrimary,
      note: input.note,
    })
    .returning({ id: counterpartyContacts.id });
  return { id: inserted[0].id };
}

export async function updateContact(
  counterpartyId: string,
  contactId: string,
  input: ContactInput,
): Promise<{ id: string }> {
  const updated = await db
    .update(counterpartyContacts)
    .set({
      fullName: input.fullName ?? null,
      position: input.position ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      isPrimary: input.isPrimary,
      note: input.note ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(counterpartyContacts.id, contactId),
        eq(counterpartyContacts.counterpartyId, counterpartyId),
      ),
    )
    .returning({ id: counterpartyContacts.id });
  if (!updated[0]) throw new PartnerError(404, "Контакт не найден");
  return { id: updated[0].id };
}

export async function deleteContact(
  counterpartyId: string,
  contactId: string,
): Promise<{ id: string }> {
  const deleted = await db
    .delete(counterpartyContacts)
    .where(
      and(
        eq(counterpartyContacts.id, contactId),
        eq(counterpartyContacts.counterpartyId, counterpartyId),
      ),
    )
    .returning({ id: counterpartyContacts.id });
  if (!deleted[0]) throw new PartnerError(404, "Контакт не найден");
  return { id: deleted[0].id };
}

// Reverse resolution "incoming e-mail → company" (foundation for the future
// inbound-mail flow). Uses idx_cp_contact_email_lower.
export async function resolveCounterpartyByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (normalized === "") return null;
  const rows = await db
    .select({ id: counterpartyContacts.counterpartyId })
    .from(counterpartyContacts)
    .where(sql`lower(${counterpartyContacts.email}) = ${normalized}`)
    .limit(1);
  return rows[0]?.id ?? null;
}

// ── Documents (metadata) ──────────────────────────────────────────────────────

export interface DocumentRow {
  id: string;
  kind: string;
  title: string;
  docRef: string | null;
  docDate: Date | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

export async function listDocuments(counterpartyId: string): Promise<DocumentRow[]> {
  return db
    .select({
      id: counterpartyDocuments.id,
      kind: counterpartyDocuments.kind,
      title: counterpartyDocuments.title,
      docRef: counterpartyDocuments.docRef,
      docDate: counterpartyDocuments.docDate,
      originalFilename: counterpartyDocuments.originalFilename,
      mimeType: counterpartyDocuments.mimeType,
      sizeBytes: counterpartyDocuments.sizeBytes,
      createdAt: counterpartyDocuments.createdAt,
    })
    .from(counterpartyDocuments)
    .where(eq(counterpartyDocuments.counterpartyId, counterpartyId))
    .orderBy(desc(counterpartyDocuments.createdAt));
}

export interface CreateDocumentArgs extends DocumentMetaInput {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedBy: string | null;
}

export async function createDocument(
  counterpartyId: string,
  args: CreateDocumentArgs,
): Promise<{ id: string }> {
  await assertPartnerExists(counterpartyId);
  const inserted = await db
    .insert(counterpartyDocuments)
    .values({
      counterpartyId,
      kind: args.kind,
      title: args.title,
      docRef: args.docRef,
      docDate: args.docDate ? new Date(args.docDate) : null,
      originalFilename: args.originalFilename,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      storageKey: args.storageKey,
      uploadedBy: args.uploadedBy,
    })
    .returning({ id: counterpartyDocuments.id });
  return { id: inserted[0].id };
}

export interface StoredDocument {
  id: string;
  counterpartyId: string;
  originalFilename: string;
  mimeType: string;
  storageKey: string;
}

// Full record incl. storageKey — used by the download/delete routes only.
export async function getDocument(id: string): Promise<StoredDocument | null> {
  const rows = await db
    .select({
      id: counterpartyDocuments.id,
      counterpartyId: counterpartyDocuments.counterpartyId,
      originalFilename: counterpartyDocuments.originalFilename,
      mimeType: counterpartyDocuments.mimeType,
      storageKey: counterpartyDocuments.storageKey,
    })
    .from(counterpartyDocuments)
    .where(eq(counterpartyDocuments.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// Deletes the metadata row and returns the storageKey so the caller can unlink the
// blob. Returns null if the row was already gone.
export async function deleteDocument(id: string): Promise<string | null> {
  const deleted = await db
    .delete(counterpartyDocuments)
    .where(eq(counterpartyDocuments.id, id))
    .returning({ storageKey: counterpartyDocuments.storageKey });
  return deleted[0]?.storageKey ?? null;
}

// ── Dossier: "all deals by this company" ──────────────────────────────────────

export interface DossierRequest {
  id: string;
  requestNumber: string | null;
  status: string;
  clientRaw: string | null;
  linesCount: number;
  createdAt: Date;
}

export interface DossierDirection {
  id: string;
  displayName: string | null;
  status: string;
  originRaw: string | null;
  destRaw: string | null;
  wagonCountPlanned: number | null;
  asClient: boolean;
  asOwner: boolean;
}

export interface DossierDeal {
  id: string;
  reportMonth: string;
  status: string;
  wagonNumber: string;
  revenueUa: number | null;
  costOwner: number | null;
  margin: number | null;
  dateTripEndTs: Date | null;
  asClient: boolean;
  asOwner: boolean;
}

export interface DossierContract {
  id: string;
  contractRef: string;
  signedOn: Date | null;
}

export interface DossierProtocol {
  id: string;
  protocolNumber: string | null;
  side: string;
  validFrom: Date | null;
  status: string;
}

export interface DealsSummary {
  count: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
}

export interface PartnerDossier {
  partner: {
    id: string;
    name: string;
    roles: string[];
    inn: string | null;
    notes: string | null;
  };
  contacts: ContactRow[];
  documents: DocumentRow[];
  requests: DossierRequest[];
  directions: DossierDirection[];
  deals: DossierDeal[];
  dealsSummary: DealsSummary;
  contracts: DossierContract[];
  protocols: DossierProtocol[];
}

function toNum(v: string | number | null): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

interface DirRow {
  id: string;
  display_name: string | null;
  status: string;
  station_origin_raw: string | null;
  station_dest_raw: string | null;
  wagon_count_planned: number | null;
  as_client: boolean;
  as_owner: boolean;
  [column: string]: unknown;
}

export async function getPartnerDossier(id: string): Promise<PartnerDossier> {
  const partnerRows = await db
    .select({
      id: counterparties.id,
      name: counterparties.nameCanonical,
      roles: counterparties.roles,
      inn: counterparties.inn,
      notes: counterparties.notes,
    })
    .from(counterparties)
    .where(eq(counterparties.id, id))
    .limit(1);
  const partner = partnerRows[0];
  if (!partner) throw new PartnerError(404, "Компания не найдена");

  const [contacts, documents, requestRows, dirResult, dealRows, contractRows, protocolRows] =
    await Promise.all([
      listContacts(id),
      listDocuments(id),
      db
        .select({
          id: requests.id,
          requestNumber: requests.requestNumber,
          status: requests.status,
          clientRaw: requests.clientRaw,
          createdAt: requests.createdAt,
          linesCount: sql<number>`(SELECT count(*)::int FROM request_lines rl WHERE rl.request_id = ${requests.id})`,
        })
        .from(requests)
        .where(eq(requests.clientSuggestedId, id))
        .orderBy(desc(requests.createdAt)),
      // Directions where the company is client, primary owner, or a bound owner.
      db.execute<DirRow>(sql`
        SELECT DISTINCT
          d.id,
          d.display_name,
          d.status,
          d.station_origin_raw,
          d.station_dest_raw,
          d.wagon_count_planned,
          (d.client_counterparty_id = ${id}) AS as_client,
          (d.owner_counterparty_id = ${id} OR dob.owner_id = ${id}) AS as_owner,
          d.created_at
        FROM directions d
        LEFT JOIN direction_owner_bindings dob
          ON dob.direction_id = d.id AND dob.owner_id = ${id}
        WHERE d.client_counterparty_id = ${id}
           OR d.owner_counterparty_id = ${id}
           OR dob.owner_id = ${id}
        ORDER BY d.created_at DESC
      `),
      db
        .select({
          id: deals.id,
          reportMonth: deals.reportMonth,
          status: deals.status,
          wagonNumber: deals.wagonNumber,
          revenueUa: deals.revenueUa,
          costOwner: deals.costOwner,
          margin: deals.margin,
          dateTripEndTs: deals.dateTripEndTs,
          clientId: deals.clientId,
          ownerId: deals.ownerId,
        })
        .from(deals)
        .where(or(eq(deals.clientId, id), eq(deals.ownerId, id)))
        .orderBy(desc(deals.dateTripEndTs)),
      db
        .select({
          id: counterpartyContracts.id,
          contractRef: counterpartyContracts.contractRef,
          signedOn: counterpartyContracts.signedOn,
        })
        .from(counterpartyContracts)
        .where(eq(counterpartyContracts.counterpartyId, id))
        .orderBy(desc(counterpartyContracts.createdAt)),
      db
        .select({
          id: priceProtocols.id,
          protocolNumber: priceProtocols.protocolNumber,
          side: priceProtocols.side,
          validFrom: priceProtocols.validFrom,
          status: priceProtocols.status,
        })
        .from(priceProtocols)
        .where(eq(priceProtocols.counterpartyId, id))
        .orderBy(desc(priceProtocols.createdAt)),
    ]);

  const dealList: DossierDeal[] = dealRows.map((d) => ({
    id: d.id,
    reportMonth: d.reportMonth,
    status: d.status,
    wagonNumber: d.wagonNumber,
    revenueUa: toNum(d.revenueUa),
    costOwner: toNum(d.costOwner),
    margin: toNum(d.margin),
    dateTripEndTs: d.dateTripEndTs,
    asClient: d.clientId === id,
    asOwner: d.ownerId === id,
  }));

  const dealsSummary = dealList.reduce<DealsSummary>(
    (acc, d) => ({
      count: acc.count + 1,
      totalRevenue: acc.totalRevenue + (d.asClient ? d.revenueUa ?? 0 : 0),
      totalCost: acc.totalCost + (d.asOwner ? d.costOwner ?? 0 : 0),
      totalMargin: acc.totalMargin + (d.margin ?? 0),
    }),
    { count: 0, totalRevenue: 0, totalCost: 0, totalMargin: 0 },
  );

  return {
    partner: {
      id: partner.id,
      name: partner.name,
      roles: partner.roles ?? [],
      inn: partner.inn,
      notes: partner.notes,
    },
    contacts,
    documents,
    requests: requestRows.map((r) => ({
      id: r.id,
      requestNumber: r.requestNumber,
      status: r.status,
      clientRaw: r.clientRaw,
      linesCount: r.linesCount,
      createdAt: r.createdAt,
    })),
    directions: dirResult.rows.map((d) => ({
      id: d.id,
      displayName: d.display_name,
      status: d.status,
      originRaw: d.station_origin_raw,
      destRaw: d.station_dest_raw,
      wagonCountPlanned: d.wagon_count_planned,
      asClient: d.as_client,
      asOwner: d.as_owner,
    })),
    deals: dealList,
    dealsSummary,
    contracts: contractRows,
    protocols: protocolRows,
  };
}

// Drizzle wraps the pg error; the SQLSTATE may live on the error or its `.cause`.
function isUniqueViolation(error: unknown): boolean {
  const has23505 = (e: unknown): boolean =>
    typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";
  if (has23505(error)) return true;
  if (typeof error === "object" && error !== null && "cause" in error) {
    return has23505((error as { cause?: unknown }).cause);
  }
  return false;
}
