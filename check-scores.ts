/**
 * SmartModelRouter 복잡도 점수 상세 확인
 */

import { scoreInput } from './src/model-routing/input-scorer.js';

const testCases = [
    "안녕하세요",
    "오늘 날씨 어때?",
    "JavaScript로 간단한 REST API를 만들어주세요. 사용자 인증과 데이터 검증이 필요합니다.",
    "React의 useEffect 훅에 대해 설명해주세요. 의존성 배열의 역할과 클린업 함수의 사용법을 포함해주세요.",
    `AlexNet과 ResNet을 PyTorch로 구현하고 비교해주세요.
    - 아키텍처 분석
    - ImageNet 데이터셋으로 훈련 (epoch 100)
    - 성능 지표: precision > 90%, recall > 88%
    - 프로덕션 최적화
    - 배포 전략`,
    `다음 미분방정식을 풀어주세요:
    d²y/dx² + 3dy/dx + 2y = e^(-x)
    초기 조건: y(0) = 1, y'(0) = 0
    
    단계별 풀이 과정을 보여주고, 일반해와 특수해를 구한 후,
    그래프로 시각화하는 Python 코드도 작성해주세요.`,
];

console.log("🔍 SmartModelRouter 복잡도 점수 상세 분석\n");
console.log("=".repeat(80));
console.log();

for (const input of testCases) {
    const score = scoreInput(input, false);

    console.log(`📝 입력: "${input.substring(0, 60)}${input.length > 60 ? '...' : ''}"`);
    console.log(`   📊 점수: ${score.normalizedScore}/100 (raw: ${score.rawScore})`);
    console.log(`   🎯 티어: ${score.tier}`);
    console.log(`   📈 피처 점수:`);
    console.log(`      - 길이: ${score.featureScores.length.toFixed(1)}pt (토큰: ${score.features.tokenCount})`);
    console.log(`      - 코드: ${score.featureScores.code}pt (${score.features.hasCode ? 'Yes' : 'No'})`);
    console.log(`      - 수학: ${score.featureScores.math}pt (${score.features.mathLike ? 'Yes' : 'No'})`);
    console.log(`      - 멀티스텝: ${score.featureScores.multiStep}pt (${score.features.multiStep ? 'Yes' : 'No'})`);
    console.log(`      - 제약조건: ${score.featureScores.constraints}pt (${score.features.constraints ? 'Yes' : 'No'})`);
    console.log(`      - 모호함: ${score.featureScores.ambiguity}pt (${score.features.ambiguity ? 'Yes' : 'No'})`);
    console.log(`      - 첨부파일: ${score.featureScores.attachments}pt (${score.features.attachments ? 'Yes' : 'No'})`);
    console.log();
}

console.log("=".repeat(80));
console.log("\n📊 임계값:");
console.log("   - cheap → mid: 35점");
console.log("   - mid → premium: 65점");
console.log("\n💡 해석:");
console.log("   - 0~34점: cheap 티어");
console.log("   - 35~64점: mid 티어");
console.log("   - 65~100점: premium 티어");
