// Activation guard for OPEN → ACTIVE (PRODUCT_DIRECTIONS §1.3). Pure logic — the route
// gathers the facts (DB counts) and passes them in, so this stays unit-testable.
//
// All five prerequisites must hold:
//  1. client_counterparty_id set (operator-confirmed, D16 — client never auto-filled).
//  2. client_rate AND owner_rate both confirmed (non-null; the *_suggested columns never count).
//  3. Sanity: client_rate > owner_rate. A non-positive planned margin BLOCKS with a hard
//     warning (catches an LLM/operator rate-swap, H1) — there is no acknowledge-override.
//  4. ≥1 active owner mailbox binding AND ≥1 active client forward binding.
//  5. The owner mailbox is not already live on another open/active direction (M1; per-wagon
//     fan-out for shared mailboxes is post-MVP).

export interface ActivationFacts {
  clientCounterpartyId: string | null;
  rateClient: number | null;
  rateOwner: number | null;
  activeOwnerBindings: number;
  activeClientBindings: number;
  ownerMailboxConflict: boolean;
}

export type GuardStatus = "passed" | "failed";

export interface GuardResult {
  key: string;
  status: GuardStatus;
  message?: string;
}

export interface ActivationResult {
  ok: boolean;
  guards: GuardResult[];
  hardWarning?: string;
}

export function evaluateActivation(facts: ActivationFacts): ActivationResult {
  const guards: GuardResult[] = [];
  let hardWarning: string | undefined;

  const pass = (key: string): GuardResult => ({ key, status: "passed" });
  const fail = (key: string, message: string): GuardResult => ({ key, status: "failed", message });

  // 1. client confirmed (D16)
  guards.push(
    facts.clientCounterpartyId
      ? pass("client_set")
      : fail("client_set", "Клиент не подтверждён (D16)"),
  );

  // 2. both rates confirmed
  const ratesConfirmed = facts.rateClient !== null && facts.rateOwner !== null;
  guards.push(
    ratesConfirmed
      ? pass("rates_confirmed")
      : fail("rates_confirmed", "Ставки клиента и собственника не подтверждены"),
  );

  // 3. sanity: positive planned margin (only when both rates are present)
  if (ratesConfirmed) {
    if ((facts.rateClient as number) > (facts.rateOwner as number)) {
      guards.push(pass("margin_positive"));
    } else {
      hardWarning = "Ставка клиента ≤ ставки собственника — отрицательная маржа (H1)";
      guards.push(fail("margin_positive", hardWarning));
    }
  }

  // 4. mailbox + forward bindings exist
  guards.push(
    facts.activeOwnerBindings >= 1
      ? pass("owner_binding")
      : fail("owner_binding", "Нет активной привязки ящика собственника"),
  );
  guards.push(
    facts.activeClientBindings >= 1
      ? pass("client_forward")
      : fail("client_forward", "Нет активной пересылки клиенту"),
  );

  // 5. mailbox not already live elsewhere (M1)
  guards.push(
    facts.ownerMailboxConflict
      ? fail("mailbox_unique", "Ящик уже привязан к другому активному направлению")
      : pass("mailbox_unique"),
  );

  const ok = guards.every((g) => g.status !== "failed");
  return hardWarning ? { ok, guards, hardWarning } : { ok, guards };
}
