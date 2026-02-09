/**
 * OpenClaw Smart Model Router - Main Router
 *
 * 전체 흐름:
 *   1단계: 입력 분석 → 복잡도 점수(0~100) → 티어 결정
 *   2단계: 티어 → 모델 선택
 *   3단계(선택): cheap/mid 응답의 confidence < 0.55 → 상위 티어로 승격 재질의
 *
 * Usage:
 *   const router = new SmartModelRouter(config?);
 *   const decision = router.route("복잡한 알고리즘 설계해줘");
 *   // → { model: "anthropic/claude-opus-4-6", tier: "premium", score: {...} }
 *
 *   // 응답 받은 후 승격 체크
 *   const check = router.checkAndPromote(decision, modelResponse);
 *   if (check.promoted) {
 *     // check.newDecision.model 로 재질의
 *   }
 */

import type {
  SmartRoutingConfig,
  RoutingDecision,
  ConfidenceAssessment,
  ModelTier,
  RoutingEvent,
  RoutingStats,
} from "./types.js";
import { mergeConfig, promoteTier } from "./defaults.js";
import { scoreInput } from "./input-scorer.js";
import { assessConfidence } from "./confidence-checker.js";

// ─── SmartModelRouter Class ──────────────────────────────────

export class SmartModelRouter {
  private config: SmartRoutingConfig;
  private eventLog: RoutingEvent[] = [];
  private readonly MAX_LOG_SIZE = 1000;
  private readonly TRIM_TO = 500;

  constructor(config?: Partial<SmartRoutingConfig>) {
    this.config = mergeConfig(config);
  }

  // ─── Primary Routing ─────────────────────────────────────

  /**
   * 입력 텍스트를 분석하여 최적 모델을 선택한다.
   *
   * @param input 사용자 입력 텍스트
   * @param hasAttachments 외부 첨부파일 존재 여부
   * @param sessionId 세션 ID (로깅용)
   * @returns RoutingDecision
   */
  route(input: string, hasAttachments: boolean = false, sessionId?: string): RoutingDecision {
    const score = scoreInput(
      input,
      hasAttachments,
      this.config.weights,
      this.config.thresholds
    );

    const model = this.resolveModelForTier(score.tier);
    const reason = this.buildReason(score);

    const decision: RoutingDecision = {
      model,
      tier: score.tier,
      score,
      reason,
      promoted: false,
    };

    if (this.config.debug) {
      this.logEvent({
        timestamp: Date.now(),
        sessionId,
        inputPreview: input.slice(0, 200),
        decision,
      });
    }

    return decision;
  }

  // ─── 2-Stage Promotion ───────────────────────────────────

  /**
   * 모델 응답의 신뢰도를 평가하고, 낮으면 상위 티어로 승격한다.
   *
   * @param originalDecision route()가 반환한 원래 결정
   * @param response 모델이 생성한 응답 텍스트
   * @param sessionId 세션 ID (로깅용)
   * @returns 승격 여부 + 새 결정 + 신뢰도 평가
   */
  checkAndPromote(
    originalDecision: RoutingDecision,
    response: string,
    sessionId?: string
  ): {
    promoted: boolean;
    newDecision?: RoutingDecision;
    confidence: ConfidenceAssessment;
  } {
    // 승격 비활성화 또는 이미 최상위
    if (!this.config.promotion.enabled) {
      return {
        promoted: false,
        confidence: { score: 1.0, signals: [], needsPromotion: false },
      };
    }

    if (originalDecision.tier === "premium") {
      return {
        promoted: false,
        confidence: { score: 1.0, signals: [], needsPromotion: false },
      };
    }

    // 이미 승격된 결정
    if (originalDecision.promoted) {
      return {
        promoted: false,
        confidence: { score: 1.0, signals: [], needsPromotion: false },
      };
    }

    // 신뢰도 평가
    const confidence = assessConfidence(
      response,
      originalDecision.score.features.tokenCount,
      this.config.promotion
    );

    if (!confidence.needsPromotion) {
      // 로그에 신뢰도 기록
      if (this.config.debug) {
        this.updateLastEventConfidence(confidence);
      }
      return { promoted: false, confidence };
    }

    // 승격 실행
    const newTier = promoteTier(
      originalDecision.tier,
      this.config.promotion.maxTierJump
    );
    const newModel = this.resolveModelForTier(newTier);

    const newDecision: RoutingDecision = {
      model: newModel,
      tier: newTier,
      score: originalDecision.score,
      reason: `승격: confidence ${confidence.score.toFixed(2)} < ${this.config.promotion.confidenceThreshold} → ${originalDecision.tier} → ${newTier}`,
      promoted: true,
      originalTier: originalDecision.tier,
    };

    if (this.config.debug) {
      this.updateLastEventPromotion(confidence, newDecision);
    }

    return {
      promoted: true,
      newDecision,
      confidence,
    };
  }

  // ─── Model Resolution ────────────────────────────────────

  /**
   * 티어에 매핑된 기본 모델 반환
   */
  private resolveModelForTier(tier: ModelTier): string {
    return this.config.tiers[tier].primary;
  }

  /**
   * 티어의 전체 모델 목록 (기본 + 폴백) 반환
   */
  getModelsForTier(tier: ModelTier): string[] {
    const tierConfig = this.config.tiers[tier];
    return [tierConfig.primary, ...tierConfig.fallbacks];
  }

  /**
   * 티어의 별칭 반환 (UI 표시용)
   */
  getTierAlias(tier: ModelTier): string {
    return this.config.tiers[tier].alias;
  }

  // ─── Reason Builder ──────────────────────────────────────

  private buildReason(score: ReturnType<typeof scoreInput>): string {
    const parts: string[] = [];
    const fs = score.featureScores;

    parts.push(`점수 ${score.normalizedScore}/100`);

    if (fs.length > 0) parts.push(`길이 ${fs.length.toFixed(0)}pt`);
    if (fs.code > 0) parts.push(`코드 +${fs.code}pt`);
    if (fs.math > 0) parts.push(`수학 +${fs.math}pt`);
    if (fs.multiStep > 0) parts.push(`멀티스텝 +${fs.multiStep}pt`);
    if (fs.constraints > 0) parts.push(`제약 +${fs.constraints}pt`);
    if (fs.ambiguity > 0) parts.push(`모호 +${fs.ambiguity}pt`);
    if (fs.attachments > 0) parts.push(`첨부 +${fs.attachments}pt`);

    const tierAlias = this.getTierAlias(score.tier);
    parts.push(`→ ${tierAlias} (${score.tier})`);

    return parts.join(" | ");
  }

  // ─── Configuration ───────────────────────────────────────

  /**
   * 런타임에 설정 업데이트
   */
  updateConfig(partial: Partial<SmartRoutingConfig>): void {
    this.config = mergeConfig({ ...this.config, ...partial });
  }

  /**
   * 현재 설정 반환 (읽기 전용 복사본)
   */
  getConfig(): Readonly<SmartRoutingConfig> {
    return { ...this.config };
  }

  /**
   * 스마트 라우팅 활성화 여부
   */
  get enabled(): boolean {
    return this.config.enabled;
  }

  // ─── Event Logging ───────────────────────────────────────

  private logEvent(event: RoutingEvent): void {
    this.eventLog.push(event);
    if (this.eventLog.length > this.MAX_LOG_SIZE) {
      this.eventLog = this.eventLog.slice(-this.TRIM_TO);
    }
  }

  private updateLastEventConfidence(confidence: ConfidenceAssessment): void {
    const last = this.eventLog[this.eventLog.length - 1];
    if (last) {
      last.confidence = confidence;
    }
  }

  private updateLastEventPromotion(
    confidence: ConfidenceAssessment,
    newDecision: RoutingDecision
  ): void {
    const last = this.eventLog[this.eventLog.length - 1];
    if (last) {
      last.confidence = confidence;
      last.promotedDecision = newDecision;
    }
  }

  /**
   * 이벤트 로그 조회 (읽기 전용)
   */
  getEventLog(): readonly RoutingEvent[] {
    return this.eventLog;
  }

  /**
   * 이벤트 로그 초기화
   */
  clearEventLog(): void {
    this.eventLog = [];
  }

  /**
   * 통계 요약
   */
  getStats(): RoutingStats {
    const events = this.eventLog;
    const stats: RoutingStats = {
      total: events.length,
      byTier: { cheap: 0, mid: 0, premium: 0 },
      promotions: 0,
      avgScore: 0,
    };

    if (events.length === 0) return stats;

    let totalScore = 0;
    for (const event of events) {
      stats.byTier[event.decision.tier]++;
      totalScore += event.decision.score.normalizedScore;
      if (event.promotedDecision) {
        stats.promotions++;
      }
    }

    stats.avgScore = Math.round(totalScore / events.length);
    return stats;
  }
}

// ─── Singleton ───────────────────────────────────────────────

let _instance: SmartModelRouter | null = null;

/**
 * 전역 싱글톤 라우터 인스턴스 반환
 */
export function getSmartRouter(config?: Partial<SmartRoutingConfig>): SmartModelRouter {
  if (!_instance || config) {
    _instance = new SmartModelRouter(config);
  }
  return _instance;
}

/**
 * 싱글톤 초기화 (테스트용)
 */
export function resetSmartRouter(): void {
  _instance = null;
}
