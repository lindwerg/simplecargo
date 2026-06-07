// Pure deal-type derivation (PRODUCT_DIRECTIONS §1.1). A deal is a cache of its
// composition: stone lines and/or transport directions. No DB import — unit-testable.

export type DealType = "stone_only" | "wagons_only" | "stone_with_transport";

// Derive the cached deal_type from the presence of stone lines and transport
// directions. NULL when the deal is still empty (no components yet).
export function deriveDealType(hasStone: boolean, hasTransport: boolean): DealType | null {
  if (hasStone && hasTransport) return "stone_with_transport";
  if (hasStone) return "stone_only";
  if (hasTransport) return "wagons_only";
  return null;
}
