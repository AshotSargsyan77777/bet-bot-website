/** Presentation-only metadata for the fixed package catalogue (prices/availability come from the API). */
export const packageMeta: Record<string, { multiplier: string; tier: "standard" | "hot" | "elite" | "cl" | "vip" | "promo" }> = {
  standard_3x: { multiplier: "3x", tier: "standard" },
  standard_5x: { multiplier: "5x", tier: "standard" },
  standard_10x: { multiplier: "10x", tier: "hot" },
  standard_20x: { multiplier: "20x", tier: "elite" },
  champions_3x: { multiplier: "CL 3x", tier: "cl" },
  champions_5x: { multiplier: "CL 5x", tier: "cl" },
  champions_10x: { multiplier: "CL 10x", tier: "cl" },
  europa_3x: { multiplier: "EL 3x", tier: "cl" },
  europa_5x: { multiplier: "EL 5x", tier: "cl" },
  europa_10x: { multiplier: "EL 10x", tier: "cl" },
  pkg_vip: { multiplier: "VIP", tier: "vip" },
  promo_5x: { multiplier: "Promo", tier: "promo" },
  pkg_5: { multiplier: "Promo", tier: "promo" },
};

/** i18n keys of payment statuses. */
export const paymentStatusKey = {
  pending: "payStatus.pending",
  approved: "payStatus.approved",
  rejected: "payStatus.rejected",
} as const;

export function isPaymentStatus(s: string): s is keyof typeof paymentStatusKey {
  return s in paymentStatusKey;
}
