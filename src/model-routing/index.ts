/**
 * OpenClaw Smart Model Router
 *
 * 입력 복잡도 기반 LLM 모델 자동 라우팅 시스템
 *
 * @example
 * ```ts
 * import { SmartModelRouter } from "./src/model-routing";
 *
 * const router = new SmartModelRouter({ debug: true });
 *
 * // 1단계: 입력 분석 → 모델 선택
 * const decision = router.route("안녕하세요");
 * console.log(decision.model); // "anthropic/claude-haiku-4-5"
 * console.log(decision.tier);  // "cheap"
 *
 * // 2단계: 응답 신뢰도 체크 → 필요시 승격
 * const response = await callModel(decision.model, "안녕하세요");
 * const check = router.checkAndPromote(decision, response);
 * if (check.promoted) {
 *   const betterResponse = await callModel(check.newDecision!.model, "안녕하세요");
 * }
 * ```
 */

// ─── Core Classes ────────────────────────────────────────────

export { SmartModelRouter, getSmartRouter, resetSmartRouter } from "./model-router.js";

// ─── Scoring Functions ───────────────────────────────────────

export {
  scoreInput,
  extractFeatures,
  calculateFeatureScores,
  estimateTokenCount,
} from "./input-scorer.js";

// ─── Confidence Assessment ───────────────────────────────────

export { assessConfidence } from "./confidence-checker.js";

// ─── Configuration & Defaults ────────────────────────────────

export {
  DEFAULT_CONFIG,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_PROMOTION,
  DEFAULT_TIERS,
  mergeConfig,
  promoteTier,
  scoreToTier,
} from "./defaults.js";

// ─── Types ───────────────────────────────────────────────────

export type {
  ModelTier,
  TierModelConfig,
  InputFeatures,
  FeatureScores,
  ComplexityScore,
  RoutingDecision,
  ConfidenceSignal,
  ConfidenceAssessment,
  ScoringWeights,
  RoutingThresholds,
  PromotionConfig,
  SmartRoutingConfig,
  RoutingEvent,
  RoutingStats,
} from "./types.js";
