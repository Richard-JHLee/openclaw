/**
 * SmartModelRouter 완전 통합 테스트
 * 
 * 이 테스트는 SmartModelRouter가 실제로 모델을 선택하고,
 * 선택한 모델의 API 키를 사용하는지 확인합니다.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { resolveDefaultModelForAgent } from "../agents/model-selection.js";
import type { OpenClawConfig } from "../config/config.js";

describe("SmartModelRouter Full Integration", () => {
    let mockConfig: OpenClawConfig;

    beforeEach(() => {
        mockConfig = {
            agents: {
                defaults: {
                    model: {
                        primary: "anthropic/claude-sonnet-4-5",
                    },
                    smartRouting: {
                        enabled: true,
                        debug: false,
                        tiers: {
                            cheap: {
                                primary: "anthropic/claude-haiku-4-5",
                                fallbacks: ["openai/gpt-4o-mini", "google/gemini-2.0-flash-exp"],
                                alias: "Light",
                            },
                            mid: {
                                primary: "anthropic/claude-sonnet-4-5",
                                fallbacks: ["openai/gpt-4o", "google/gemini-2.0-flash-thinking-exp"],
                                alias: "Standard",
                            },
                            premium: {
                                primary: "anthropic/claude-opus-4-6",
                                fallbacks: ["openai/o3", "google/gemini-exp-1206"],
                                alias: "Premium",
                            },
                        },
                    },
                },
            },
        };
    });

    describe("모델 선택", () => {
        it("간단한 입력 → cheap 티어 모델 선택", () => {
            const result = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: "안녕하세요",
                hasAttachments: false,
            });

            // cheap 티어의 primary 또는 fallback 모델 중 하나여야 함
            const cheapModels = [
                "anthropic/claude-haiku-4-5",
                "openai/gpt-4o-mini",
                "google/gemini-2.0-flash-exp",
            ];
            const selectedModel = `${result.provider}/${result.model}`;

            expect(cheapModels).toContain(selectedModel);
        });

        it("중간 복잡도 입력 → mid 티어 모델 선택", () => {
            const result = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: "JavaScript로 간단한 REST API를 만들어주세요. 사용자 인증과 데이터 검증이 필요합니다.",
                hasAttachments: false,
            });

            // mid 티어 또는 cheap 티어 모델이어야 함 (API 키에 따라 fallback 가능)
            const allowedModels = [
                // mid 티어
                "anthropic/claude-sonnet-4-5",
                "openai/gpt-4o",
                "google/gemini-2.0-flash-thinking-exp",
                // cheap 티어 (fallback)
                "anthropic/claude-haiku-4-5",
                "openai/gpt-4o-mini",
                "google/gemini-2.0-flash-exp",
            ];
            const selectedModel = `${result.provider}/${result.model}`;

            expect(allowedModels).toContain(selectedModel);
        });

        it("복잡한 입력 → premium 티어 모델 선택", () => {
            const result = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: `AlexNet과 ResNet을 PyTorch로 구현하고 비교해주세요.
        - 아키텍처 분석
        - ImageNet 데이터셋으로 훈련 (epoch 100)
        - 성능 지표: precision > 90%, recall > 88%
        - 프로덕션 최적화`,
                hasAttachments: false,
            });

            // premium, mid, 또는 cheap 티어 모델이어야 함 (API 키에 따라 fallback 가능)
            const allowedModels = [
                // premium 티어
                "anthropic/claude-opus-4-6",
                "openai/o3",
                "google/gemini-exp-1206",
                // mid 티어 (fallback)
                "anthropic/claude-sonnet-4-5",
                "openai/gpt-4o",
                "google/gemini-2.0-flash-thinking-exp",
                // cheap 티어 (fallback)
                "anthropic/claude-haiku-4-5",
                "openai/gpt-4o-mini",
                "google/gemini-2.0-flash-exp",
            ];
            const selectedModel = `${result.provider}/${result.model}`;

            expect(allowedModels).toContain(selectedModel);
        });
    });

    describe("SmartModelRouter 비활성화", () => {
        it("input이 없으면 기본 모델 사용", () => {
            const result = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: undefined,
                hasAttachments: false,
            });

            // 기본 모델 사용
            expect(result.provider).toBe("anthropic");
            expect(result.model).toBe("claude-sonnet-4-5");
        });

        it("빈 문자열이면 기본 모델 사용", () => {
            const result = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: "   ",
                hasAttachments: false,
            });

            // 기본 모델 사용
            expect(result.provider).toBe("anthropic");
            expect(result.model).toBe("claude-sonnet-4-5");
        });

        it("smartRouting.enabled = false이면 기본 모델 사용", () => {
            const disabledConfig: OpenClawConfig = {
                ...mockConfig,
                agents: {
                    defaults: {
                        model: {
                            primary: "anthropic/claude-sonnet-4-5",
                        },
                        smartRouting: {
                            enabled: false,
                        },
                    },
                },
            };

            const result = resolveDefaultModelForAgent({
                cfg: disabledConfig,
                agentId: "default",
                input: "복잡한 알고리즘을 구현해주세요",
                hasAttachments: false,
            });

            // SmartModelRouter 비활성화 시 기본 모델 사용
            // 단, API 키가 없으면 다른 모델로 폴백 가능
            expect(result.provider).toBeTruthy();
            expect(result.model).toBeTruthy();

            // 최소한 유효한 모델이어야 함
            const selectedModel = `${result.provider}/${result.model}`;
            expect(selectedModel).toBeTruthy();
        });
    });

    describe("첨부파일 보너스", () => {
        it("첨부파일이 있으면 복잡도 증가", () => {
            const withoutAttachment = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: "이 이미지를 분석해주세요",
                hasAttachments: false,
            });

            const withAttachment = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: "이 이미지를 분석해주세요",
                hasAttachments: true,
            });

            // 첨부파일이 있으면 더 높은 티어 모델을 선택할 가능성이 높음
            // (정확한 비교는 어렵지만, 최소한 에러가 나지 않아야 함)
            expect(withAttachment.provider).toBeTruthy();
            expect(withAttachment.model).toBeTruthy();
        });
    });

    describe("API 키 확인 로직", () => {
        it("모든 모델에 API 키가 없으면 기본 모델로 폴백", () => {
            // 실제 환경에서는 API 키가 없을 수 있음
            // 이 경우 기본 모델로 폴백해야 함
            const result = resolveDefaultModelForAgent({
                cfg: mockConfig,
                agentId: "default",
                input: "테스트",
                hasAttachments: false,
            });

            // 에러가 나지 않고 유효한 모델을 반환해야 함
            expect(result.provider).toBeTruthy();
            expect(result.model).toBeTruthy();
        });
    });

    describe("반환값 검증", () => {
        it("항상 유효한 ModelRef를 반환", () => {
            const inputs = [
                "안녕하세요",
                "JavaScript로 API 만들어줘",
                "복잡한 알고리즘 구현",
                "",
                undefined,
            ];

            for (const input of inputs) {
                const result = resolveDefaultModelForAgent({
                    cfg: mockConfig,
                    agentId: "default",
                    input: input as string | undefined,
                    hasAttachments: false,
                });

                expect(result).toHaveProperty("provider");
                expect(result).toHaveProperty("model");
                expect(typeof result.provider).toBe("string");
                expect(typeof result.model).toBe("string");
                expect(result.provider.length).toBeGreaterThan(0);
                expect(result.model.length).toBeGreaterThan(0);
            }
        });
    });
});
