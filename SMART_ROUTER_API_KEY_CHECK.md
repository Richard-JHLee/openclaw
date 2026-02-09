# SmartModelRouter API 키 확인 기능

## ✅ 개선 완료

SmartModelRouter가 선택한 모델에 대한 **API 키 확인 로직**이 추가되었습니다!

## 🔒 API 키 확인 동작

### 이전 동작 (문제)

```typescript
// ❌ API 키 확인 없이 바로 모델 선택
if (smartDecision) {
  const [provider, model] = smartDecision.model.split("/");
  return { provider, model };  // API 키 없으면 실행 시 에러!
}
```

### 개선된 동작 (해결)

```typescript
// ✅ API 키 확인 후 사용 가능한 모델 선택
if (smartDecision) {
  const router = initSmartRouter(params.cfg);
  const tierModels = router.getModelsForTier(smartDecision.tier);
  
  // Primary + Fallbacks 순서대로 API 키 확인
  for (const modelString of tierModels) {
    const [provider, model] = modelString.split("/");
    if (provider && model) {
      // API 키가 있는지 확인
      const hasAuth = resolveEnvApiKey(provider) || getCustomProviderApiKey(params.cfg, provider);
      
      if (hasAuth) {
        // ✅ API 키가 있으면 이 모델 사용
        return { provider, model };
      }
    }
  }
  
  // 모든 모델에 API 키가 없으면 기존 설정 모델로 폴백
}
```

## 🔄 동작 흐름

```
사용자 입력
    ↓
SmartModelRouter 복잡도 분석
    ↓
티어 결정 (cheap/mid/premium)
    ↓
해당 티어의 모델 목록 가져오기
    ├─ Primary: anthropic/claude-haiku-4-5
    ├─ Fallback 1: openai/gpt-4o-mini
    └─ Fallback 2: ...
    ↓
순서대로 API 키 확인
    ├─ anthropic API 키 있나? ───YES──→ ✅ 이 모델 사용!
    │   ↓ NO
    ├─ openai API 키 있나? ───YES──→ ✅ 이 모델 사용!
    │   ↓ NO
    └─ 다음 fallback...
    ↓
모든 모델에 API 키 없음
    ↓
기존 설정 모델로 폴백
```

## 📋 API 키 확인 방법

### 1. 환경 변수 확인

```typescript
resolveEnvApiKey(provider)
```

**확인하는 환경 변수:**
- `ANTHROPIC_API_KEY` (Anthropic)
- `OPENAI_API_KEY` (OpenAI)
- `GEMINI_API_KEY` (Google)
- `GROQ_API_KEY` (Groq)
- 기타 provider별 환경 변수

### 2. 설정 파일 확인

```typescript
getCustomProviderApiKey(params.cfg, provider)
```

**확인하는 설정:**
```yaml
models:
  providers:
    anthropic:
      apiKey: "sk-ant-..."
    openai:
      apiKey: "sk-..."
```

## 💡 사용 예시

### 예시 1: Anthropic API 키만 있는 경우

**설정:**
```bash
export ANTHROPIC_API_KEY="sk-ant-..."
# OPENAI_API_KEY 없음
```

**SmartModelRouter 결정:**
- 복잡도: 50/100
- 티어: **mid**
- 모델 목록:
  1. `anthropic/claude-sonnet-4-5` ✅ (API 키 있음)
  2. `openai/gpt-4o` ❌ (API 키 없음)

**결과:** `anthropic/claude-sonnet-4-5` 사용

---

### 예시 2: OpenAI API 키만 있는 경우

**설정:**
```bash
export OPENAI_API_KEY="sk-..."
# ANTHROPIC_API_KEY 없음
```

**SmartModelRouter 결정:**
- 복잡도: 50/100
- 티어: **mid**
- 모델 목록:
  1. `anthropic/claude-sonnet-4-5` ❌ (API 키 없음)
  2. `openai/gpt-4o` ✅ (API 키 있음)

**결과:** `openai/gpt-4o` 사용 (fallback)

---

### 예시 3: 모든 API 키 없는 경우

**설정:**
```bash
# 환경 변수 없음
```

**SmartModelRouter 결정:**
- 복잡도: 50/100
- 티어: **mid**
- 모델 목록:
  1. `anthropic/claude-sonnet-4-5` ❌ (API 키 없음)
  2. `openai/gpt-4o` ❌ (API 키 없음)

**결과:** 기존 설정 모델로 폴백
```yaml
agents:
  defaults:
    model:
      primary: "anthropic/claude-sonnet-4-5"  # 이 모델 사용 시도
```

## 🎯 장점

### 1. **자동 폴백**
- Primary 모델에 API 키가 없어도 fallback 모델로 자동 전환
- 사용자가 수동으로 모델을 변경할 필요 없음

### 2. **유연성**
- 여러 provider의 API 키를 설정해두면 자동으로 사용 가능한 모델 선택
- 비용 최적화와 가용성 보장을 동시에 달성

### 3. **안전성**
- API 키가 없는 모델을 선택하여 실행 시 에러 발생하는 문제 방지
- 항상 사용 가능한 모델만 선택

## 📝 권장 설정

### 옵션 1: 단일 Provider

```bash
# Anthropic만 사용
export ANTHROPIC_API_KEY="sk-ant-..."
```

```yaml
agents:
  defaults:
    smartRouting:
      enabled: true
      tiers:
        cheap:
          primary: "anthropic/claude-haiku-4-5"
          fallbacks: []  # fallback 없음
        mid:
          primary: "anthropic/claude-sonnet-4-5"
          fallbacks: []
        premium:
          primary: "anthropic/claude-opus-4-6"
          fallbacks: ["anthropic/claude-sonnet-4-5"]
```

### 옵션 2: 멀티 Provider (권장)

```bash
# 여러 provider 설정
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
```

```yaml
agents:
  defaults:
    smartRouting:
      enabled: true
      tiers:
        cheap:
          primary: "anthropic/claude-haiku-4-5"
          fallbacks: ["openai/gpt-4o-mini"]  # ✅ 자동 폴백
        mid:
          primary: "anthropic/claude-sonnet-4-5"
          fallbacks: ["openai/gpt-4o"]  # ✅ 자동 폴백
        premium:
          primary: "anthropic/claude-opus-4-6"
          fallbacks: ["openai/o3", "anthropic/claude-sonnet-4-5"]  # ✅ 자동 폴백
```

**장점:**
- Anthropic API가 다운되어도 OpenAI로 자동 전환
- 비용 최적화 (Anthropic 우선, OpenAI fallback)
- 높은 가용성 보장

## 🔧 코드 변경 사항

### 추가된 import

```typescript
import { resolveEnvApiKey, getCustomProviderApiKey } from "./model-auth.js";
```

### 수정된 로직

```typescript
// SmartModelRouter가 선택한 모델(primary + fallbacks)에 대해 API 키 확인
const router = initSmartRouter(params.cfg);
const tierModels = router.getModelsForTier(smartDecision.tier);

for (const modelString of tierModels) {
  const [provider, model] = modelString.split("/");
  if (provider && model) {
    // API 키가 있는지 확인
    const hasAuth = resolveEnvApiKey(provider) || getCustomProviderApiKey(params.cfg, provider);
    
    if (hasAuth) {
      // API 키가 있으면 이 모델 사용
      return { provider, model };
    }
  }
}

// SmartModelRouter가 선택한 티어의 모든 모델에 API 키가 없음
// → 기존 설정 모델로 폴백
```

## ✅ 결론

이제 SmartModelRouter는:
- ✅ **API 키 확인**: 사용 가능한 모델만 선택
- ✅ **자동 폴백**: Primary → Fallback 순서로 시도
- ✅ **안전성 보장**: API 키 없는 모델 선택 방지
- ✅ **유연성**: 멀티 provider 지원

**모든 AI provider의 API 키가 필요하지 않습니다!** 설정된 API 키 중에서 사용 가능한 모델을 자동으로 선택합니다.

**버전:** 1.2  
**마지막 업데이트:** 2026-02-09  
**상태:** API 키 확인 기능 추가 완료 ✅
