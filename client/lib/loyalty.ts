import type { LoyaltyTier } from "@/types";

// Must match server/src/utils/loyalty.ts
export const POINTS_PER_UNIT = 1;
export const REDEMPTION_POINTS = 100;
export const REDEMPTION_VALUE = 10;

export const TIER_LABELS: Record<LoyaltyTier, string> = {
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
};

export const TIER_TONES: Record<LoyaltyTier, "amber" | "gray" | "green"> = {
  BRONZE: "amber",
  SILVER: "gray",
  GOLD: "green",
};

export const TIER_THRESHOLDS: Record<LoyaltyTier, number> = { BRONZE: 0, SILVER: 1000, GOLD: 5000 };
export const TIER_MULTIPLIER: Record<LoyaltyTier, number> = { BRONZE: 1, SILVER: 1.1, GOLD: 1.3 };
export const TIER_DISCOUNT: Record<LoyaltyTier, number> = { BRONZE: 0, SILVER: 2, GOLD: 5 };

export function tierFor(totalEarned: number): LoyaltyTier {
  if (totalEarned >= TIER_THRESHOLDS.GOLD) return "GOLD";
  if (totalEarned >= TIER_THRESHOLDS.SILVER) return "SILVER";
  return "BRONZE";
}

export function pointsForAmount(amount: number, tier: LoyaltyTier = "BRONZE"): number {
  return Math.floor((Math.max(amount, 0) / POINTS_PER_UNIT) * TIER_MULTIPLIER[tier]);
}

export function redemptionValue(points: number): number {
  return Math.floor(points / REDEMPTION_POINTS) * REDEMPTION_VALUE;
}

export function maxRedeemablePoints(amount: number): number {
  return Math.floor(Math.max(amount, 0) / REDEMPTION_VALUE) * REDEMPTION_POINTS;
}
