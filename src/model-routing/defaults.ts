/**
 * OpenClaw Smart Model Router - Default Configuration
 *
 * 기본 스코어링 가중치, 티어 매핑, 승격 규칙 정의
 */

import type {
  SmartRoutingConfig,
  PromotionConfig,
  ScoringWeights,
  RoutingThresholds,
  TierModelConfig,
  ModelTier,
} from "./types.js";

// ─── Default Scoring Weights ─────────────────────────────────

export const DEFAULT_WEIGHTS: ScoringWeights = {
  lengthMax: 25,
  codeBonus: 25,
  mathBonus: 20,
  multiStepBonus: 15,
  constraintBonus: 10,
  ambiguityBonus: 10,
  attachmentBonus: 5,
};

// ─── Default Routing Thresholds ──────────────────────────────

export const DEFAULT_THRESHOLDS: RoutingThresholds = {
  cheapToMid: 35,
  midToPremium: 65,
};

// ─── Default Promotion Config ────────────────────────────────

export const DEFAULT_PROMOTION: PromotionConfig = {
  enabled: true,
  confidenceThreshold: 0.55,
  maxPromotions: 1,
  maxTierJump: 1,
};

// ─── Default Tier Model Mapping ──────────────────────────────

export const DEFAULT_TIERS: Record<ModelTier, TierModelConfig> = {
  cheap: {
    primary: "anthropic/claude-haiku-4-5",
    fallbacks: [
      "openai/gpt-4o-mini",
      "google/gemini-2.0-flash-exp",
    ],
    alias: "Light",
  },
  mid: {
    primary: "anthropic/claude-sonnet-4-5",
    fallbacks: [
      "openai/gpt-4o",
      "google/gemini-2.0-flash-thinking-exp",
    ],
    alias: "Standard",
  },
  premium: {
    primary: "anthropic/claude-opus-4-6",
    fallbacks: [
      "openai/o3",
      "google/gemini-exp-1206",
      "anthropic/claude-sonnet-4-5",
    ],
    alias: "Premium",
  },
};

// ─── Complete Default Config ─────────────────────────────────

export const DEFAULT_CONFIG: SmartRoutingConfig = {
  enabled: true,
  tiers: DEFAULT_TIERS,
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
  promotion: DEFAULT_PROMOTION,
  debug: false,
};

// ─── Tier Ordering (for promotion) ───────────────────────────

const TIER_ORDER: ModelTier[] = ["cheap", "mid", "premium"];

/**
 * 현재 티어에서 N단계 위 티어 반환
 * 이미 최상위면 "premium" 유지
 */
export function promoteTier(current: ModelTier, steps: number = 1): ModelTier {
  const idx = TIER_ORDER.indexOf(current);
  const newIdx = Math.min(idx + steps, TIER_ORDER.length - 1);
  return TIER_ORDER[newIdx];
}

/**
 * 점수 → 티어 변환
 */
export function scoreToTier(score: number, thresholds: RoutingThresholds): ModelTier {
  if (score < thresholds.cheapToMid) return "cheap";
  if (score < thresholds.midToPremium) return "mid";
  return "premium";
}

/**
 * 부분 설정을 기본값과 깊은 병합
 */
export function mergeConfig(partial?: Partial<SmartRoutingConfig>): SmartRoutingConfig {
  if (!partial) return { ...DEFAULT_CONFIG };

  return {
    enabled: partial.enabled ?? DEFAULT_CONFIG.enabled,
    tiers: partial.tiers
      ? {
        cheap: { ...DEFAULT_TIERS.cheap, ...partial.tiers.cheap },
        mid: { ...DEFAULT_TIERS.mid, ...partial.tiers.mid },
        premium: { ...DEFAULT_TIERS.premium, ...partial.tiers.premium },
      }
      : { ...DEFAULT_TIERS },
    weights: { ...DEFAULT_WEIGHTS, ...partial.weights },
    thresholds: { ...DEFAULT_THRESHOLDS, ...partial.thresholds },
    promotion: { ...DEFAULT_PROMOTION, ...partial.promotion },
    debug: partial.debug ?? DEFAULT_CONFIG.debug,
  };
}
