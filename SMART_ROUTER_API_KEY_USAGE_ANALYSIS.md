# SmartModelRouter API 키 사용 분석

## 🔍 현재 상황 분석

### 문제점 발견

SmartModelRouter가 선택한 모델과 실제 사용되는 API 키가 **일치하지 않을 수 있습니다**.

## 📊 코드 흐름 분석

### 1. 모델 선택 단계 (`resolveDefaultModelForAgent`)

```typescript
// src/agents/model-selection.ts (line 226-265)
export function resolveDefaultModelForAgent(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  input?: string;
  hasAttachments?: boolean;
  sessionId?: string;
}): ModelRef {
  if (params.input?.trim()) {
    const smartDecision = resolveSmartModelRef({...});
    
    if (smartDecision) {
      const router = initSmartRouter(params.cfg);
      const tierModels = router.getModelsForTier(smartDecision.tier);
      
      for (const modelString of tierModels) {
        const [provider, model] = modelString.split("/");
        if (provider && model) {
          // ⚠️ API 키 확인만 함 (실제 가져오지 않음)
          const hasAuth = resolveEnvApiKey(provider) || getCustomProviderApiKey(params.cfg, provider);
          
          if (hasAuth) {
            return { provider, model };  // ✅ 모델 반환
          }
        }
      }
    }
  }
  
  // 기존 로직...
}
```

**역할:** 
- ✅ SmartModelRouter로 모델 선택
- ✅ API 키 **존재 여부만** 확인
- ❌ API 키를 **실제로 가져오지 않음**

---

### 2. API 키 사용 단계 (`runEmbeddedPiAgent`)

```typescript
// src/agents/pi-embedded-runner/run.ts (line 234-267)
const resolveApiKeyForCandidate = async (candidate?: string) => {
  return getApiKeyForModel({
    model,  // ⚠️ params.provider/params.model로 생성된 model 객체
    cfg: params.config,
    profileId: candidate,
    store: authStore,
    agentDir,
  });
};

const applyApiKeyInfo = async (candidate?: string): Promise<void> => {
  apiKeyInfo = await resolveApiKeyForCandidate(candidate);
  // ...
  authStorage.setRuntimeApiKey(model.provider, apiKeyInfo.apiKey);  // ✅ API 키 설정
};
```

**역할:**
- ✅ 실제 API 키를 **가져옴**
- ✅ `authStorage`에 API 키를 **설정**
- ⚠️ 하지만 `params.provider`/`params.model`을 사용 (SmartModelRouter 선택과 무관)

---

## ⚠️ 문제 시나리오

### 시나리오 1: SmartModelRouter가 다른 모델 선택

```typescript
// 1. resolveDefaultModelForAgent 호출
const defaultModelRef = resolveDefaultModelForAgent({
  cfg: config,
  agentId: "default",
  input: "복잡한 알고리즘 구현해줘",
  hasAttachments: false,
  sessionId: "session-123",
});

// SmartModelRouter 결과:
// - 복잡도: 75/100
// - 티어: premium
// - 선택 모델: "anthropic/claude-opus-4-6"
// defaultModelRef = { provider: "anthropic", model: "claude-opus-4-6" }

// 2. runEmbeddedPiAgent 호출
await runEmbeddedPiAgent({
  provider: "openai",  // ❌ 다른 provider!
  model: "gpt-4o",     // ❌ 다른 model!
  prompt: "복잡한 알고리즘 구현해줘",
  // ...
});

// 3. API 키 가져오기
// getApiKeyForModel은 params.provider="openai"를 사용
// ⚠️ SmartModelRouter가 선택한 "anthropic"이 아님!
```

**결과:**
- SmartModelRouter는 `anthropic/claude-opus-4-6` 선택
- 실제로는 `openai/gpt-4o`의 API 키 사용
- **선택한 모델과 사용한 API 키가 불일치!**

---

## ✅ 해결 방안

### 방안 1: `runEmbeddedPiAgent`에서 `defaultModelRef` 사용

**현재 호출 방식:**
```typescript
// src/agents/pi-embedded-runner/run/attempt.ts
const defaultModelRef = resolveDefaultModelForAgent({
  cfg: params.config ?? {},
  agentId: sessionAgentId,
  input: params.prompt,
  hasAttachments: (params.images?.length ?? 0) > 0,
  sessionId: params.sessionId,
});

// ❌ defaultModelRef를 사용하지 않음!
// params.provider와 params.model을 그대로 사용
```

**개선된 방식:**
```typescript
const defaultModelRef = resolveDefaultModelForAgent({
  cfg: params.config ?? {},
  agentId: sessionAgentId,
  input: params.prompt,
  hasAttachments: (params.images?.length ?? 0) > 0,
  sessionId: params.sessionId,
});

// ✅ defaultModelRef를 실제로 사용!
const effectiveProvider = defaultModelRef.provider;
const effectiveModel = defaultModelRef.model;

// runEmbeddedPiAgent 호출 시 사용
await runEmbeddedPiAgent({
  provider: effectiveProvider,  // ✅ SmartModelRouter 선택 모델
  model: effectiveModel,        // ✅ SmartModelRouter 선택 모델
  // ...
});
```

---

### 방안 2: API 키 확인 로직 개선

**현재 문제:**
```typescript
// ❌ 단순히 존재 여부만 확인
const hasAuth = resolveEnvApiKey(provider) || getCustomProviderApiKey(params.cfg, provider);
```

**개선 방안:**
```typescript
// ✅ 실제로 사용 가능한지 확인 (profile, cooldown 등)
const hasAuth = await canUseProvider({
  provider,
  cfg: params.cfg,
  agentDir: params.agentDir,
});
```

---

## 🎯 권장 사항

### 즉시 수정 필요

**파일:** `src/agents/pi-embedded-runner/run/attempt.ts`

**수정 전:**
```typescript
const defaultModelRef = resolveDefaultModelForAgent({...});
const defaultModelLabel = `${defaultModelRef.provider}/${defaultModelRef.model}`;
// ❌ defaultModelRef를 사용하지 않음
```

**수정 후:**
```typescript
const defaultModelRef = resolveDefaultModelForAgent({...});

// ✅ SmartModelRouter가 선택한 모델 사용
const effectiveProvider = defaultModelRef.provider;
const effectiveModel = defaultModelRef.model;

// runEmbeddedAttempt에 전달
await runEmbeddedAttempt({
  provider: effectiveProvider,
  modelId: effectiveModel,
  // ...
});
```

---

## 📋 체크리스트

- [ ] `runEmbeddedAttempt`에서 `defaultModelRef` 사용
- [ ] API 키 확인 로직을 실제 사용 가능 여부 확인으로 개선
- [ ] Profile cooldown 상태 확인 추가
- [ ] 통합 테스트 작성

---

## 🔍 추가 조사 필요

1. **`runEmbeddedAttempt` 호출 지점 확인**
   - `defaultModelRef`가 어떻게 사용되는지 확인
   - `params.provider`/`params.model`이 어디서 오는지 확인

2. **다른 호출 경로 확인**
   - CLI runner
   - Gateway
   - 기타 진입점

---

## ✅ 결론

**질문: "openclaw 사용시 입력된 key로 적용되는데 이 입력된 key를 사용하는가?"**

**답변:**

현재 구현에는 **문제가 있습니다**:

1. ❌ **모델 선택 단계**: SmartModelRouter가 모델을 선택하고 API 키 **존재 여부만** 확인
2. ❌ **API 키 사용 단계**: `params.provider`/`params.model`로 API 키를 가져옴
3. ⚠️ **불일치 가능성**: 선택한 모델과 사용한 API 키가 다를 수 있음

**해결 필요:**
- `runEmbeddedAttempt`에서 `defaultModelRef`를 실제로 사용하도록 수정
- API 키 확인 로직을 실제 사용 가능 여부 확인으로 개선

**버전:** 1.4  
**마지막 업데이트:** 2026-02-09  
**상태:** 문제 발견, 수정 필요 ⚠️
