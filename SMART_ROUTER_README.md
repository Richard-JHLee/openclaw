# SmartModelRouter OpenClaw 통합 - 빠른 시작 가이드

SmartModelRouter를 OpenClaw에 통합하여 사용자 입력 분석 기반 자동 모델 선택 기능을 활성화하세요.

## 설치 (완료됨)

SmartModelRouter 관련 파일들이 다음 위치에 생성되었습니다:

```
src/model-routing/
├── types.ts                    # 핵심 타입 정의
├── defaults.ts                 # 기본 설정 및 상수
├── input-scorer.ts             # 입력 복잡도 분석
├── confidence-checker.ts        # 응답 신뢰도 평가
├── model-router.ts             # 메인 라우터 클래스
├── index.ts                    # 공개 API
└── integration.test.ts         # 통합 테스트
```

## 기본 설정 (3단계)

### 1단계: 설정 파일에 smartRouting 추가

`openclaw.yaml`:
```yaml
agents:
  defaults:
    smartRouting:
      enabled: true
      debug: false
```

### 2단계: 코드에서 SmartModelRouter 사용

```typescript
import { resolveSmartModelRef, checkAndPromoteSmartModel } from "./src/agents/model-selection.js";

// 모델 선택
const decision = resolveSmartModelRef({
  input: userInput,
  cfg: openClawConfig
});

if (decision) {
  // decision.model로 호출
  const response = await callModel(decision.model, userInput);

  // 신뢰도 평가 (선택사항)
  const check = checkAndPromoteSmartModel(decision, response, openClawConfig);
  if (check.promoted && check.newDecision) {
    // 더 강한 모델로 재질의
    return await callModel(check.newDecision.model, userInput);
  }
  return response;
}
```

### 3단계: 테스트 실행

```bash
npm test -- src/model-routing/integration.test.ts
```

## 복잡도 자동 분석

입력을 자동으로 분석하여 최적 모델을 선택합니다:

| 입력 예시 | 분석 | 선택 모델 | 비용 |
|---------|------|----------|------|
| "안녕하세요" | 단순 (5점) | claude-haiku-4-5 | $ |
| "JavaScript API 만들어줘" | 중간 (35점) | claude-sonnet-4-5 | $$ |
| "복잡한 ML 모델 구현" | 복잡 (78점) | claude-opus-4-6 | $$$ |

## 자동 승격 기능

응답 신뢰도가 낮으면 자동으로 상위 모델로 재질의:

```
저가 모델(Haiku)의 응답 신뢰도 평가
  ↓
신뢰도 < 0.55?
  ├─ YES → 중간 모델(Sonnet)로 자동 재질의
  └─ NO  → 응답 반환
```

## 고급 사용법

### 커스텀 설정

```typescript
import { SmartModelRouter } from "./src/model-routing/index.js";

const router = new SmartModelRouter({
  enabled: true,
  weights: {
    lengthMax: 30,      // 길이 가중치 증가
    codeBonus: 30,      // 코드 감지 강화
  },
  thresholds: {
    cheapToMid: 40,     // 경계값 조정
    midToPremium: 70,
  }
});
```

### 통계 조회

```typescript
const stats = router.getStats();
console.log(`
  총 라우팅: ${stats.total}
  저가 모델: ${stats.byTier.cheap}건
  중간 모델: ${stats.byTier.mid}건
  고급 모델: ${stats.byTier.premium}건
  자동 승격: ${stats.promotions}건
  평균 점수: ${stats.avgScore}/100
`);
```

## 파일 매핑

### 생성된 파일

| 파일 | 용도 |
|------|------|
| `src/model-routing/types.ts` | 핵심 타입 (ModelTier, RoutingDecision 등) |
| `src/model-routing/defaults.ts` | 기본 설정 및 가중치 |
| `src/model-routing/input-scorer.ts` | 입력 분석 (토큰, 패턴) |
| `src/model-routing/confidence-checker.ts` | 응답 신뢰도 평가 |
| `src/model-routing/model-router.ts` | 메인 라우터 클래스 |
| `src/model-routing/index.ts` | 공개 API |
| `src/model-routing/integration.test.ts` | 통합 테스트 |

### 수정된 파일

| 파일 | 변경사항 |
|------|----------|
| `src/agents/model-selection.ts` | SmartModelRouter 통합 함수 추가 |
| `src/config/types.agent-defaults.ts` | `smartRouting` 설정 타입 추가 |

## 문서

| 문서 | 내용 |
|------|------|
| `SMART_MODEL_ROUTER_INTEGRATION.md` | 상세 통합 가이드 |
| `INTEGRATION_PLAN.md` | 구현 계획 및 체크리스트 |
| `src/agents/smart-model-example.ts` | 사용 코드 예제 |

## 주요 함수

### `resolveSmartModelRef(params)`
입력을 분석하여 최적 모델을 선택합니다.

```typescript
const decision = resolveSmartModelRef({
  input: "복잡한 알고리즘 분석",
  cfg: openClawConfig
});
// → { model: "anthropic/claude-opus-4-6", tier: "premium", ... }
```

### `checkAndPromoteSmartModel(decision, response, cfg)`
응답을 분석하여 필요시 상위 모델로 승격합니다.

```typescript
const check = checkAndPromoteSmartModel(decision, response, cfg);
if (check.promoted) {
  // 더 강한 모델로 재질의
}
```

### `getSmartRoutingStats(cfg)`
라우팅 통계를 조회합니다.

```typescript
const stats = getSmartRoutingStats(cfg);
```

## 예상 효과

- **비용 절감**: 20-30% 토큰 비용 감소
- **성능 개선**: 저가 모델로 시작하여 필요시 승격
- **품질 보증**: 자동 신뢰도 평가 및 승격

## 핵심 개념

### 7가지 피처
1. **길이**: 토큰 수 (0-25점)
2. **코드**: 프로그래밍 코드 감지 (+25점)
3. **수학**: 수학/증명 패턴 (+20점)
4. **멀티스텝**: 복합 작업 (+15점)
5. **제약조건**: 성능/보안 요구사항 (+10점)
6. **모호성**: 불명확한 표현 (+10점)
7. **첨부파일**: URL/이미지 (+5점)

### 3가지 모델 티어
1. **cheap** (0-34점): `claude-haiku-4-5`
2. **mid** (35-64점): `claude-sonnet-4-5`
3. **premium** (65-100점): `claude-opus-4-6`

### 6가지 신뢰도 신호
1. 헤징 언어 (아마도, perhaps)
2. 짧은 응답
3. 반복
4. 거부/회피
5. 불완전한 응답
6. 자기 모순

## 빠른 참조

```typescript
// 1. 모델 선택
const decision = resolveSmartModelRef({ input, cfg });

// 2. 모델 호출
if (decision) {
  const response = await callModel(decision.model, input);

  // 3. 신뢰도 평가 (선택사항)
  const check = checkAndPromoteSmartModel(decision, response, cfg);
  if (check.promoted) {
    return await callModel(check.newDecision.model, input);
  }
  return response;
}
```

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 항상 null 반환 | `enabled: false` | 설정에서 활성화 |
| 항상 같은 모델 | 입력 복잡도 일관 | `debug: true`로 로그 확인 |
| 승격 안 됨 | 신뢰도 > 0.55 | 응답 품질 확인 |

## 다음 단계

1. **기본 설정**: `smartRouting.enabled: true` 추가
2. **코드 통합**: `resolveSmartModelRef()` 도입
3. **테스트 실행**: `npm test -- src/model-routing/integration.test.ts`
4. **모니터링**: `getSmartRoutingStats()`로 성과 분석
5. **최적화**: 프로젝트별 가중치 조정

## 참고 자료

- **전체 가이드**: [SMART_MODEL_ROUTER_INTEGRATION.md](./SMART_MODEL_ROUTER_INTEGRATION.md)
- **구현 계획**: [INTEGRATION_PLAN.md](./INTEGRATION_PLAN.md)
- **코드 예제**: [src/agents/smart-model-example.ts](./src/agents/smart-model-example.ts)
- **테스트**: [src/model-routing/integration.test.ts](./src/model-routing/integration.test.ts)

---

**버전**: 1.0
**상태**: 완성 및 테스트 준비 완료
**마지막 업데이트**: 2025-02-09
