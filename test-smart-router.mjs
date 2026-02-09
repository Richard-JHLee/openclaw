#!/usr/bin/env node
/**
 * SmartModelRouter 실제 사용 테스트
 * 
 * 다양한 입력으로 SmartModelRouter가 어떤 모델을 선택하는지 확인합니다.
 */

import { resolveDefaultModelForAgent } from './dist/agents/model-selection.js';

const testCases = [
    {
        name: "간단한 인사",
        input: "안녕하세요",
        expectedTier: "cheap",
    },
    {
        name: "짧은 질문",
        input: "오늘 날씨 어때?",
        expectedTier: "cheap",
    },
    {
        name: "중간 복잡도 - 코딩",
        input: "JavaScript로 간단한 REST API를 만들어주세요. 사용자 인증과 데이터 검증이 필요합니다.",
        expectedTier: "mid",
    },
    {
        name: "중간 복잡도 - 설명",
        input: "React의 useEffect 훅에 대해 설명해주세요. 의존성 배열의 역할과 클린업 함수의 사용법을 포함해주세요.",
        expectedTier: "mid",
    },
    {
        name: "복잡한 작업 - 알고리즘",
        input: `AlexNet과 ResNet을 PyTorch로 구현하고 비교해주세요.
    - 아키텍처 분석
    - ImageNet 데이터셋으로 훈련 (epoch 100)
    - 성능 지표: precision > 90%, recall > 88%
    - 프로덕션 최적화
    - 배포 전략`,
        expectedTier: "premium",
    },
    {
        name: "복잡한 작업 - 수학",
        input: `다음 미분방정식을 풀어주세요:
    d²y/dx² + 3dy/dx + 2y = e^(-x)
    초기 조건: y(0) = 1, y'(0) = 0
    
    단계별 풀이 과정을 보여주고, 일반해와 특수해를 구한 후,
    그래프로 시각화하는 Python 코드도 작성해주세요.`,
        expectedTier: "premium",
    },
    {
        name: "첨부파일 있음",
        input: "이 이미지를 분석해주세요",
        hasAttachments: true,
        expectedTier: "mid/premium",
    },
];

const config = {
    agents: {
        defaults: {
            model: {
                primary: "anthropic/claude-sonnet-4-5",
            },
            smartRouting: {
                enabled: true,
                debug: true,
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
                        fallbacks: ["openai/o3", "google/gemini-exp-1206", "anthropic/claude-sonnet-4-5"],
                        alias: "Premium",
                    },
                },
            },
        },
    },
};

console.log("🚀 SmartModelRouter 실제 사용 테스트\n");
console.log("=".repeat(80));
console.log();

for (const testCase of testCases) {
    console.log(`📝 테스트: ${testCase.name}`);
    console.log(`   입력: "${testCase.input.substring(0, 60)}${testCase.input.length > 60 ? '...' : ''}"`);
    console.log(`   예상 티어: ${testCase.expectedTier}`);
    console.log(`   첨부파일: ${testCase.hasAttachments ? 'Yes' : 'No'}`);

    try {
        const result = resolveDefaultModelForAgent({
            cfg: config,
            agentId: "default",
            input: testCase.input,
            hasAttachments: testCase.hasAttachments || false,
        });

        const selectedModel = `${result.provider}/${result.model}`;
        console.log(`   ✅ 선택된 모델: ${selectedModel}`);

        // 티어 판별
        let tier = "unknown";
        if (selectedModel.includes("haiku") || selectedModel.includes("gpt-4o-mini") || selectedModel.includes("gemini-2.0-flash-exp")) {
            tier = "cheap";
        } else if (selectedModel.includes("sonnet") || selectedModel.includes("gpt-4o") || selectedModel.includes("gemini-2.0-flash-thinking")) {
            tier = "mid";
        } else if (selectedModel.includes("opus") || selectedModel.includes("o3") || selectedModel.includes("gemini-exp")) {
            tier = "premium";
        }

        console.log(`   📊 실제 티어: ${tier}`);

    } catch (error) {
        console.log(`   ❌ 에러: ${error.message}`);
    }

    console.log();
}

console.log("=".repeat(80));
console.log("\n✅ 테스트 완료!");
console.log("\n💡 팁:");
console.log("   - API 키가 없는 provider는 자동으로 건너뜁니다");
console.log("   - Primary 모델에 API 키가 없으면 fallback 모델을 사용합니다");
console.log("   - 모든 모델에 API 키가 없으면 기본 설정 모델을 사용합니다");
