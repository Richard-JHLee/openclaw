/**
 * SmartModelRouter 사용 예제
 *
 * OpenClaw 에이전트에서 SmartModelRouter를 실제로 사용하는 방법을 보여줍니다.
 *
 * @example
 * ```bash
 * # resolveDefaultModelForAgent 대신 smartModelRouter 사용
 * const decision = resolveSmartModelRef({ input: userInput, cfg });
 * ```
 */

import type { OpenClawConfig } from "../config/config.js";
import type { ModelRef } from "./model-selection.js";
import {
  resolveSmartModelRef,
  checkAndPromoteSmartModel,
  getSmartRoutingStats,
  resolveDefaultModelForAgent,
} from "./model-selection.js";

/**
 * 스마트 모델 선택을 통합한 모델 해석 함수
 *
 * 1. SmartModelRouter로 최적 모델 선택 시도
 * 2. 비활성화 또는 null 반환 시 기본 모델 사용
 */
export function resolveModelWithSmartRouting(params: {
  cfg: OpenClawConfig;
  input: string;
  agentId?: string;
  hasAttachments?: boolean;
}): ModelRef {
  // SmartModelRouter 시도
  const smartDecision = resolveSmartModelRef({
    input: params.input,
    cfg: params.cfg,
    hasAttachments: params.hasAttachments,
  });

  if (smartDecision) {
    console.log(`[SmartRouter] ${smartDecision.reason}`);
    return {
      provider: smartDecision.model.split("/")[0],
      model: smartDecision.model.split("/")[1],
    };
  }

  // 스마트 라우팅 비활성화 시 기본값 사용
  return resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
}

/**
 * 응답 후 신뢰도 평가 및 자동 승격
 *
 * 저가 모델의 응답을 분석하여 신뢰도가 낮으면
 * 자동으로 상위 모델로 재질의합니다.
 */
export async function executeWithAutoPromotion(params: {
  cfg: OpenClawConfig;
  input: string;
  model: ModelRef;
  callModel: (model: ModelRef, input: string) => Promise<string>;
}): Promise<{ response: string; promoted: boolean; newModel?: ModelRef }> {
  // 1단계: 초기 모델 선택
  const decision = resolveSmartModelRef({
    input: params.input,
    cfg: params.cfg,
  });

  if (!decision) {
    // 스마트 라우팅 비활성화
    const response = await params.callModel(params.model, params.input);
    return { response, promoted: false };
  }

  // 2단계: 모델 호출
  const modelRef: ModelRef = {
    provider: decision.model.split("/")[0],
    model: decision.model.split("/")[1],
  };

  const response = await params.callModel(modelRef, params.input);

  // 3단계: 신뢰도 평가 및 자동 승격
  const check = checkAndPromoteSmartModel(decision, response, params.cfg);

  if (check.promoted && check.newDecision) {
    console.log(
      `[AutoPromotion] ${decision.tier} → ${check.newDecision.tier} (confidence: ${(check.confidence.score * 100).toFixed(1)}%)`
    );

    // 더 강력한 모델로 재질의
    const promotedModel: ModelRef = {
      provider: check.newDecision.model.split("/")[0],
      model: check.newDecision.model.split("/")[1],
    };

    const promotedResponse = await params.callModel(promotedModel, params.input);

    return {
      response: promotedResponse,
      promoted: true,
      newModel: promotedModel,
    };
  }

  // 신뢰도 로그
  if (check.confidence.signals.length > 0) {
    console.log(
      `[Confidence] ${(check.confidence.score * 100).toFixed(1)}% - Signals: ${check.confidence.signals.map((s) => s.type).join(", ")}`
    );
  }

  return { response, promoted: false };
}

/**
 * 라우팅 통계 리포트
 */
export function printSmartRoutingStats(cfg?: OpenClawConfig): void {
  const stats = getSmartRoutingStats(cfg);

  if (stats.total === 0) {
    console.log("[SmartRouter Stats] 라우팅 기록 없음");
    return;
  }

  console.log("[SmartRouter Stats]");
  console.log(`  총 라우팅: ${stats.total}`);
  console.log(`  Cheap: ${stats.byTier.cheap}, Mid: ${stats.byTier.mid}, Premium: ${stats.byTier.premium}`);
  console.log(`  총 승격: ${stats.promotions}`);
  console.log(`  평균 점수: ${stats.avgScore}/100`);
  console.log(`  비용 효율: ${((stats.byTier.cheap / stats.total) * 100).toFixed(1)}% 저가 모델 사용`);
}

/**
 * Agent 실행 함수 (대략적인 구조)
 *
 * @example
 * ```ts
 * const result = await runAgentWithSmartRouting({
 *   cfg: openClawConfig,
 *   userInput: "복잡한 작업 분석해줘",
 *   agentId: "my-agent",
 *   callLLM: async (model, input) => {
 *     // 실제 LLM 호출 로직
 *     return await anthropic.messages.create({ ... });
 *   }
 * });
 * ```
 */
export async function runAgentWithSmartRouting(params: {
  cfg: OpenClawConfig;
  userInput: string;
  agentId?: string;
  callLLM: (modelRef: ModelRef, input: string) => Promise<string>;
}): Promise<string> {
  // 모델 선택
  const modelRef = resolveModelWithSmartRouting({
    cfg: params.cfg,
    input: params.userInput,
    agentId: params.agentId,
  });

  // 신뢰도 기반 자동 승격과 함께 실행
  const result = await executeWithAutoPromotion({
    cfg: params.cfg,
    input: params.userInput,
    model: modelRef,
    callModel: params.callLLM,
  });

  // 통계 출력 (디버그)
  printSmartRoutingStats(params.cfg);

  return result.response;
}
