# SmartModelRouter OpenClaw 통합 가이드

OpenClaw에 SmartModelRouter를 통합하여 입력 복잡도 기반 자동 모델 선택 기능을 제공합니다.

## 개요

SmartModelRouter는 사용자 입력을 분석하여:
1. **복잡도 점수 계산** (0-100)
2. **최적 모델 티어 선택** (cheap/mid/premium)
3. **응답 신뢰도 평가** 및 필요시 자동 승격

## 파일 구조

```
openclaw/src/
├── model-routing/                 # SmartModelRouter 통합
│   ├── types.ts                   # 핵심 타입 정의
│   ├── defaults.ts                # 기본 설정 및 상수
│   ├── input-scorer.ts            # 입력 복잡도 분석
│   ├── confidence-checker.ts       # 응답 신뢰도 평가
│   ├── model-router.ts            # 메인 라우터 클래스
│   ├── index.ts                   # 공개 API
│   └── integration.test.ts        # 통합 테스트
├── agents/
│   └── model-selection.ts         # OpenClaw 통합 함수
└── config/
    └── types.agent-defaults.ts    # smartRouting 설정 타입
```

## 설정

### 1. OpenClaw 설정 파일에서 활성화

```yaml
agents:
  defaults:
    # SmartModelRouter 설정
    smartRouting:
      enabled: true
      debug: true  # 선택사항: 라우팅 상세 로그
      # 스코어링 가중치 (선택사항)
      weights:
        lengthMax: 25
        codeBonus: 25
        mathBonus: 20
        multiStepBonus: 15
        constraintBonus: 10
        ambiguityBonus: 10
        attachmentBonus: 5
      # 라우팅 임계값 (선택사항)
      thresholds:
        cheapToMid: 35      # cheap → mid 경계
        midToPremium: 65    # mid → premium 경계
      # 승격 설정 (선택사항)
      promotion:
        enabled: true
        confidenceThreshold: 0.55  # 이 값 이하이면 승격
        maxPromotions: 1           # 요청당 최대 승격 횟수
        maxTierJump: 1             # 한 번에 점프 가능한 최대 티어 수
      # 모델 매핑 (선택사항)
      tiers:
        cheap:
          primary: "anthropic/claude-haiku-4-5"
          fallbacks: ["openai/gpt-4o-mini"]
          alias: "Light"
        mid:
          primary: "anthropic/claude-sonnet-4-5"
          fallbacks: ["openai/gpt-4o"]
          alias: "Standard"
        premium:
          primary: "anthropic/claude-opus-4-6"
          fallbacks: ["openai/o3"]
          alias: "Premium"
```

## 사용 방법

### 방법 1: 간단한 사용

```typescript
import { resolveSmartModelRef } from "./src/agents/model-selection.js";

// 입력 분석 후 최적 모델 선택
const decision = resolveSmartModelRef({
  input: "복잡한 알고리즘 설계해줘",
  cfg: openClawConfig,
  hasAttachments: false,
  sessionId: "session-123"
});

if (decision) {
  console.log(`선택된 모델: ${decision.model}`);
  console.log(`티어: ${decision.tier}`);
  console.log(`점수: ${decision.score.normalizedScore}/100`);
  console.log(`사유: ${decision.reason}`);

  // 선택된 모델로 호출
  const response = await callModel(decision.model, "복잡한 알고리즘 설계해줘");
}
```

### 방법 2: 응답 신뢰도 체크 및 자동 승격

```typescript
import {
  resolveSmartModelRef,
  checkAndPromoteSmartModel
} from "./src/agents/model-selection.js";

// 1단계: 초기 모델 선택
const decision = resolveSmartModelRef({
  input: userInput,
  cfg: openClawConfig
});

if (!decision) {
  // 스마트 라우팅 비활성화 시 기존 로직 사용
  const defaultModel = resolveDefaultModelForAgent({ cfg: openClawConfig });
  // ...
  return;
}

// 2단계: 모델 호출
const response = await callModel(decision.model, userInput);

// 3단계: 신뢰도 평가 및 자동 승격
const check = checkAndPromoteSmartModel(decision, response, openClawConfig);

if (check.promoted && check.newDecision) {
  console.log(`승격: ${decision.tier} → ${check.newDecision.tier}`);

  // 더 강력한 모델로 재질의
  const betterResponse = await callModel(check.newDecision.model, userInput);
  return betterResponse;
} else {
  console.log(`신뢰도: ${(check.confidence.score * 100).toFixed(1)}%`);
  return response;
}
```

### 방법 3: 고급 설정

```typescript
import { SmartModelRouter } from "./src/model-routing/index.js";

// 커스텀 설정으로 직접 인스턴스 생성
const router = new SmartModelRouter({
  enabled: true,
  debug: true,
  weights: {
    lengthMax: 30,           // 길이 가중치 증가
    codeBonus: 30,           // 코드 감지 가중치 증가
    mathBonus: 25,
    multiStepBonus: 20,
    constraintBonus: 15,
    ambiguityBonus: 10,
    attachmentBonus: 5
  },
  thresholds: {
    cheapToMid: 40,          // 경계값 조정
    midToPremium: 70
  },
  promotion: {
    enabled: true,
    confidenceThreshold: 0.50,  // 더 엄격한 승격 기준
    maxPromotions: 2,
    maxTierJump: 1
  }
});

// 라우팅
const decision = router.route(userInput, hasAttachments);

// 신뢰도 평가
const check = router.checkAndPromote(decision, response);

// 통계 조회
const stats = router.getStats();
console.log(`총 라우팅: ${stats.total}`);
console.log(`Cheap: ${stats.byTier.cheap}, Mid: ${stats.byTier.mid}, Premium: ${stats.byTier.premium}`);
console.log(`총 승격: ${stats.promotions}`);
console.log(`평균 점수: ${stats.avgScore}`);
```

## 복잡도 점수 계산

### 입력 분석 (7가지 피처)

| 피처 | 최대 점수 | 감지 패턴 | 예시 |
|------|---------|---------|------|
| 길이 | 25 | 토큰 수 | 1000 토큰 = 25점 |
| 코드 | 25 | 프로그래밍 키워드, ```코드 블록``` | Python, JavaScript 코드 |
| 수학 | 20 | 수학 기호 ∑∫, LaTeX, 증명 | 미분 적분, 행렬 계산 |
| 멀티스텝 | 15 | 설계, 구현, 테스트, 배포 | "구현 후 테스트" |
| 제약조건 | 10 | 반드시, 금지, 성능 요구사항 | "100ms 이내 응답" |
| 모호성 | 10 | 이거, 저거, 모호한 표현 | "이것 고쳐줘" |
| 첨부파일 | 5 | URL, 이미지 첨부, 파일 | "screenshot.png 포함" |

### 상호작용 보너스

여러 피처가 동시에 활성화되면 비선형 추가 점수:
- 2개 피처: +5점
- 3개 피처: +12점
- 4개 이상: +20점

### 티어 결정

```
점수 범위    →    선택 모델
───────────────────────────────
0-34점      →    cheap (Haiku)
35-64점     →    mid (Sonnet)
65-100점    →    premium (Opus)
```

## 신뢰도 평가 (응답 분석)

### 감지 신호 6가지

| 신호 | 최대 감점 | 감지 기준 | 예시 |
|------|---------|---------|------|
| 헤징 | -30% | "아마도", "perhaps", "maybe" | "아마도 이렇게 할 수 있을 것 같아요" |
| 짧은 응답 | -35% | 입력 대비 극도로 짧은 출력 | 입력 100토큰, 응답 10자 |
| 반복 | -20% | 유사 문장 반복 (유사도>80%) | 같은 내용 여러 번 반복 |
| 거부 | -35% | "할 수 없습니다", "어렵습니다" | "이것은 내 능력 밖입니다" |
| 불완전 | -20% | 미닫힌 코드블록, 끊긴 목록 | \`\`\`code (닫히지 않음) |
| 모순 | -25% | "정정합니다", "틀렸습니다" | "아, 실수했습니다" |

### 신뢰도 점수

```
신뢰도 = 1.0 - Σ(감점 가중치)
승격 필요 = 신뢰도 < 0.55
```

## 로깅 및 디버깅

### Debug 모드 활성화

```typescript
const router = new SmartModelRouter({ debug: true });

// 이벤트 로그 조회
const events = router.getEventLog();
events.forEach(event => {
  console.log({
    timestamp: new Date(event.timestamp),
    input: event.inputPreview,
    decision: event.decision,
    confidence: event.confidence,
    promoted: !!event.promotedDecision
  });
});
```

### 출력 예시

```
라우팅 결정:
- 모델: anthropic/claude-opus-4-6
- 티어: premium
- 점수: 78/100
- 사유: 점수 78/100 | 길이 12pt | 코드 +25pt | 멀티스텝 +15pt → Premium (premium)
- 승격: 아니오

신뢰도 평가:
- 점수: 0.85
- 신호: []
- 승격 필요: 아니오
```

## API 레퍼런스

### `resolveSmartModelRef(params)`

입력 분석 후 최적 모델 선택

**파라미터:**
- `input: string` - 사용자 입력 텍스트
- `cfg?: OpenClawConfig` - OpenClaw 설정
- `hasAttachments?: boolean` - 첨부파일 유무 (기본: false)
- `sessionId?: string` - 세션 ID

**반환:**
- `RoutingDecision | null` - 라우팅 결정 또는 null

### `checkAndPromoteSmartModel(decision, response, cfg?, sessionId?)`

응답 신뢰도 평가 및 자동 승격

**파라미터:**
- `decision: RoutingDecision` - 원래 라우팅 결정
- `response: string` - 모델 응답
- `cfg?: OpenClawConfig` - OpenClaw 설정
- `sessionId?: string` - 세션 ID

**반환:**
```typescript
{
  promoted: boolean;           // 승격 여부
  newDecision?: RoutingDecision; // 승격된 새 결정
  confidence: ConfidenceAssessment; // 신뢰도 평가
}
```

### `getSmartRoutingStats(cfg?)`

라우팅 통계 조회

**반환:**
```typescript
{
  total: number;              // 총 라우팅 횟수
  byTier: {
    cheap: number;
    mid: number;
    premium: number;
  };
  promotions: number;         // 총 승격 횟수
  avgScore: number;           // 평균 점수
}
```

### `SmartModelRouter` 클래스

```typescript
class SmartModelRouter {
  // 라우팅
  route(input: string, hasAttachments?: boolean, sessionId?: string): RoutingDecision;

  // 승격 체크
  checkAndPromote(
    decision: RoutingDecision,
    response: string,
    sessionId?: string
  ): { promoted: boolean; newDecision?: RoutingDecision; confidence: ConfidenceAssessment };

  // 모델 조회
  getModelsForTier(tier: ModelTier): string[];
  getTierAlias(tier: ModelTier): string;

  // 설정
  updateConfig(partial: Partial<SmartRoutingConfig>): void;
  getConfig(): Readonly<SmartRoutingConfig>;

  // 통계
  getStats(): RoutingStats;
  getEventLog(): readonly RoutingEvent[];
  clearEventLog(): void;
}
```

## 실제 사용 예시

### 예시 1: 간단한 요청

**입력:**
```
"안녕하세요"
```

**분석:**
- 토큰 수: 4
- 피처: 없음
- 점수: 5/100

**결과:**
- 모델: `anthropic/claude-haiku-4-5` (Cheap)
- 비용 효율적이고 빠른 응답

### 예시 2: 중간 복잡도

**입력:**
```
"JavaScript로 REST API를 만들어주세요.
사용자 인증, 데이터 검증, 에러 처리가 필요합니다."
```

**분석:**
- 토큰 수: 25
- 피처: 코드, 멀티스텝
- 점수: 50/100

**결과:**
- 모델: `anthropic/claude-sonnet-4-5` (Mid)
- 균형잡힌 성능과 비용

### 예시 3: 복잡한 요청

**입력:**
```
"AlexNet과 ResNet을 PyTorch로 구현하고 비교해주세요.
- 아키텍처 분석
- ImageNet 데이터셋으로 훈련 (epoch 100)
- 성능 지표: precision > 90%, recall > 88%
- 프로덕션 최적화"
```

**분석:**
- 토큰 수: 60
- 피처: 코드, 수학, 멀티스텝, 제약조건
- 점수: 85/100 (상호작용 보너스 +20)

**결과:**
- 모델: `anthropic/claude-opus-4-6` (Premium)
- 최고 성능과 신뢰성

## 테스트

```bash
# 통합 테스트 실행
npm test -- src/model-routing/integration.test.ts

# 특정 테스트 실행
npm test -- src/model-routing/integration.test.ts -t "should route simple input"

# 디버그 모드
npm test -- src/model-routing/integration.test.ts --reporter=verbose
```

## 성능 고려사항

- **라우팅 시간**: 입력 분석은 매우 빠름 (<1ms)
- **메모리**: 라우팅 로그는 1000개 이벤트로 자동 트림
- **토큰 비용**: 저가 모델 사용으로 전체 비용 감소

## 문제 해결

### Q: 스마트 라우팅이 작동하지 않음
**A:** `smartRouting.enabled: true` 확인 및 `debug: true`로 로그 확인

### Q: 항상 같은 모델이 선택됨
**A:** 입력 복잡도가 일관되기 때문. 복잡도 점수는 `decision.reason`에서 확인

### Q: 승격이 발생하지 않음
**A:** `promotion.enabled: true` 및 `confidenceThreshold` 값 확인

### Q: 성능이 저하됨
**A:** `debug: false`로 설정하여 로깅 비활성화

## 최적화 팁

1. **비용 절감**: 스마트 라우팅으로 불필요한 premium 모델 호출 감소
2. **응답 속도**: 저가 모델의 빠른 응답 활용
3. **품질 보증**: 자동 승격으로 신뢰도 보장
4. **모니터링**: `getStats()`로 정기적 성능 분석

## 라이센스

OpenClaw SmartModelRouter Integration는 OpenClaw와 동일한 라이센스를 따릅니다.
