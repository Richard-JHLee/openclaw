/**
 * SmartModelRouter OpenClaw Integration Tests
 *
 * OpenClaw에서 SmartModelRouter의 통합 테스트
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SmartModelRouter } from "./model-router.js";
import { scoreInput, estimateTokenCount } from "./input-scorer.js";
import { assessConfidence } from "./confidence-checker.js";
import { DEFAULT_CONFIG, DEFAULT_THRESHOLDS } from "./defaults.js";

describe("SmartModelRouter - Input Scoring", () => {
  it("should estimate token count correctly for mixed Korean/English text", () => {
    const input = "Hello world 한국어 텍스트입니다";
    const tokens = estimateTokenCount(input);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(100);
  });

  it("should score simple input as 'cheap' tier", () => {
    const input = "안녕하세요";
    const score = scoreInput(input, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);
    expect(score.tier).toBe("cheap");
    expect(score.normalizedScore).toBeLessThan(35);
  });

  it("should score code-heavy input higher", () => {
    const input = `
    function fibonacci(n) {
      if (n <= 1) return n;
      return fibonacci(n-1) + fibonacci(n-2);
    }
    이 함수를 최적화해주세요.
    `;
    const score = scoreInput(input, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);
    expect(score.features.hasCode).toBe(true);
    expect(score.featureScores.code).toBe(25);
    expect(score.normalizedScore).toBeGreaterThan(35);
  });

  it("should detect math patterns", () => {
    const input = "수학 문제를 풀어줘. ∑ 공식을 사용하세요. ∫ f(x)dx = F(x) + C";
    const score = scoreInput(input, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);
    expect(score.features.mathLike).toBe(true);
    expect(score.featureScores.math).toBe(20);
  });

  it("should detect multi-step tasks", () => {
    const input = "데이터 분석 프로젝트를 설계하고 구현한 후 테스트해줄 수 있을까요?";
    const score = scoreInput(input, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);
    expect(score.features.multiStep).toBe(true);
    expect(score.featureScores.multiStep).toBe(15);
  });

  it("should detect constraints", () => {
    const input = "100ms 이하의 지연으로 응답해야 합니다. 보안은 반드시 준수하세요.";
    const score = scoreInput(input, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);
    expect(score.features.constraints).toBe(true);
    expect(score.featureScores.constraints).toBe(10);
  });

  it("should tier input based on complexity", () => {
    const simple = "안녕";
    const medium = "JavaScript로 REST API를 만들어주세요. 다음 기능이 필요합니다: 사용자 인증, 데이터 검증, 에러 처리";
    const complex = `
    복잡한 머신러닝 모델을 설계해주세요.
    - 데이터 전처리: 정규화, 결측값 처리, 이상치 제거
    - 모델 선택: Random Forest, SVM, Neural Network 비교 분석
    - 교차 검증으로 최적화 (성능: F1 > 0.95 필수)
    - 프로덕션 배포 고려
    `;

    const simpleScore = scoreInput(simple, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);
    const mediumScore = scoreInput(medium, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);
    const complexScore = scoreInput(complex, false, DEFAULT_CONFIG.weights, DEFAULT_THRESHOLDS);

    expect(simpleScore.tier).toBe("cheap");
    expect(mediumScore.tier).toBe("mid");
    expect(complexScore.tier).toBe("premium");
  });
});

describe("SmartModelRouter - Confidence Assessment", () => {
  it("should assess high confidence for good response", () => {
    const response = "다음은 요청하신 작업에 대한 완전한 구현입니다. 단계별로 설명하겠습니다.";
    const confidence = assessConfidence(response, 50, DEFAULT_CONFIG.promotion);
    expect(confidence.score).toBeGreaterThan(0.7);
    expect(confidence.needsPromotion).toBe(false);
  });

  it("should detect hedging language", () => {
    const response = "아마도 이렇게 할 수 있을 것 같습니다. 하지만 확실하지 않습니다.";
    const confidence = assessConfidence(response, 50, DEFAULT_CONFIG.promotion);
    expect(confidence.signals.some((s) => s.type === "hedging")).toBe(true);
    expect(confidence.score).toBeLessThan(0.7);
  });

  it("should detect short response", () => {
    const response = "네";
    const confidence = assessConfidence(response, 100, DEFAULT_CONFIG.promotion);
    expect(confidence.signals.some((s) => s.type === "short_response")).toBe(true);
  });

  it("should detect incomplete response", () => {
    const response = `
    다음은 코드입니다:
    \`\`\`python
    def calculate():
        result = sum([1, 2, 3])
    `;
    const confidence = assessConfidence(response, 50, DEFAULT_CONFIG.promotion);
    expect(confidence.signals.some((s) => s.type === "incomplete")).toBe(true);
  });

  it("should mark for promotion when confidence is low", () => {
    const response = "할 수 없습니다. 이것은 내 능력 밖입니다.";
    const confidence = assessConfidence(response, 50, DEFAULT_CONFIG.promotion);
    expect(confidence.needsPromotion).toBe(true);
  });
});

describe("SmartModelRouter - Routing", () => {
  let router: SmartModelRouter;

  beforeEach(() => {
    router = new SmartModelRouter({ debug: true });
  });

  it("should route simple input to cheap tier", () => {
    const decision = router.route("안녕하세요", false);
    expect(decision.tier).toBe("cheap");
    expect(decision.model).toBe("anthropic/claude-haiku-4-5");
  });

  it("should route complex input to premium tier", () => {
    const input = `
    AlexNet과 ResNet의 아키텍처를 비교하고 PyTorch로 구현해주세요.
    - 각 레이어 구조 분석
    - ImageNet 데이터셋으로 훈련 (epoch 100, batch size 128, learning rate 0.01)
    - 성능 평가: precision > 90%, recall > 88%
    - 프로덕션 배포 최적화
    `;
    const decision = router.route(input, false);
    expect(decision.tier).toBe("premium");
    expect(decision.model).toBe("anthropic/claude-opus-4-6");
  });

  it("should provide reason for routing decision", () => {
    const decision = router.route("코드를 작성해주세요", false);
    expect(decision.reason).toContain("점수");
    expect(decision.reason).toContain("→");
  });

  it("should return models for each tier", () => {
    const cheapModels = router.getModelsForTier("cheap");
    const midModels = router.getModelsForTier("mid");
    const premiumModels = router.getModelsForTier("premium");

    expect(cheapModels).toContain("anthropic/claude-haiku-4-5");
    expect(midModels).toContain("anthropic/claude-sonnet-4-5");
    expect(premiumModels).toContain("anthropic/claude-opus-4-6");
  });
});

describe("SmartModelRouter - Promotion", () => {
  let router: SmartModelRouter;

  beforeEach(() => {
    router = new SmartModelRouter({ debug: true });
  });

  it("should not promote when response is good", () => {
    const decision = router.route("간단한 작업", false);
    const response = "이것은 완전한 답변입니다. 모든 세부 사항을 포함하고 있습니다.";

    const check = router.checkAndPromote(decision, response);
    expect(check.promoted).toBe(false);
    expect(check.confidence.score).toBeGreaterThan(0.6);
  });

  it("should promote when confidence is low", () => {
    const decision = router.route("복잡한 작업", false);
    if (decision.tier !== "premium") {
      const response = "할 수 없습니다. 이것은 너무 복잡합니다.";
      const check = router.checkAndPromote(decision, response);
      expect(check.promoted).toBe(true);
      expect(check.newDecision).toBeDefined();
      if (check.newDecision) {
        expect(check.newDecision.tier).toBeGreaterThan(decision.tier);
      }
    }
  });

  it("should not promote premium tier", () => {
    const input = "매우 복잡한 ML 모델 구현";
    const decision = router.route(input, false);
    if (decision.tier === "premium") {
      const response = "약간 어렵습니다...";
      const check = router.checkAndPromote(decision, response);
      expect(check.promoted).toBe(false);
    }
  });

  it("should track statistics", () => {
    router.route("테스트 1", false);
    router.route("테스트 2", false);
    router.route("테스트 3", false);

    const stats = router.getStats();
    expect(stats.total).toBe(3);
    expect(stats.byTier.cheap + stats.byTier.mid + stats.byTier.premium).toBe(3);
  });
});

describe("SmartModelRouter - Configuration", () => {
  it("should update config at runtime", () => {
    const router = new SmartModelRouter();
    const originalConfig = router.getConfig();

    router.updateConfig({
      thresholds: {
        cheapToMid: 40,
        midToPremium: 70,
      },
    });

    const updatedConfig = router.getConfig();
    expect(updatedConfig.thresholds.cheapToMid).toBe(40);
    expect(updatedConfig.thresholds.midToPremium).toBe(70);
  });

  it("should support custom tier mappings", () => {
    const router = new SmartModelRouter({
      tiers: {
        cheap: {
          primary: "custom/model-1",
          fallbacks: [],
          alias: "Custom Light",
        },
        mid: {
          primary: "custom/model-2",
          fallbacks: [],
          alias: "Custom Mid",
        },
        premium: {
          primary: "custom/model-3",
          fallbacks: [],
          alias: "Custom Premium",
        },
      },
    });

    const decision = router.route("테스트", false);
    expect(decision.model).toMatch(/^custom\//);
  });

  it("should respect enabled flag", () => {
    const router = new SmartModelRouter({ enabled: false });
    expect(router.enabled).toBe(false);
  });
});
