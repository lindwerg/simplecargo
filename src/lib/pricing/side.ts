// ПСЦ side is DERIVED from РНС's role in the protocol, never asked
// (examples/psc-vektor-rns.md):
//   РНС = ЗАКАЗЧИК (customer)  → owner/COST ПСЦ  → counterparty is the wagon owner,
//                                                  feeds `Сумма от Поставщика`.
//   РНС = ИСПОЛНИТЕЛЬ (executor) → client/REVENUE ПСЦ → counterparty is the client,
//                                                  feeds `Сумма УА`.

export type RnsRole = "zakazchik" | "ispolnitel";
export type PscSide = "owner_cost" | "client_revenue";

export function deriveSide(rnsRole: RnsRole): PscSide {
  return rnsRole === "zakazchik" ? "owner_cost" : "client_revenue";
}

// The counterparty's commercial role implied by the ПСЦ side — drives the form label.
export function counterpartyRoleFor(side: PscSide): "owner" | "client" {
  return side === "owner_cost" ? "owner" : "client";
}
