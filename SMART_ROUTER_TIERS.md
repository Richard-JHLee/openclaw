# SmartModelRouter 기본 티어 설정

## 🎯 기본 모델 매핑

SmartModelRouter는 3개의 주요 AI provider를 지원합니다:
- **Anthropic** (Claude)
- **OpenAI** (GPT)
- **Google** (Gemini)

## 📊 티어별 모델 설정

### Cheap 티어 (0-34점)

**용도:** 간단한 질문, 인사, 짧은 응답

```typescript
{
  primary: "anthropic/claude-haiku-4-5",
  fallbacks: [
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-exp",
  ],
  alias: "Light"
}
```

**폴백 순서:**
1. ✨ **Claude Haiku 4.5** (Primary) - 빠르고 저렴
2. 🔄 **GPT-4o Mini** (Fallback 1) - OpenAI 대안
3. 🔄 **Gemini 2.0 Flash** (Fallback 2) - Google 대안

---

### Mid 티어 (35-64점)

**용도:** 일반적인 코딩, 중간 복잡도 작업

```typescript
{
  primary: "anthropic/claude-sonnet-4-5",
  fallbacks: [
    "openai/gpt-4o",
    "google/gemini-2.0-flash-thinking-exp",
  ],
  alias: "Standard"
}
```

**폴백 순서:**
1. ✨ **Claude Sonnet 4.5** (Primary) - 균형잡힌 성능
2. 🔄 **GPT-4o** (Fallback 1) - OpenAI 대안
3. 🔄 **Gemini 2.0 Flash Thinking** (Fallback 2) - Google 대안 (추론 능력)

---

### Premium 티어 (65-100점)

**용도:** 복잡한 알고리즘, 수학, 멀티스텝 작업

```typescript
{
  primary: "anthropic/claude-opus-4-6",
  fallbacks: [
    "openai/o3",
    "google/gemini-exp-1206",
    "anthropic/claude-sonnet-4-5",
  ],
  alias: "Premium"
}
```

**폴백 순서:**
1. ✨ **Claude Opus 4.6** (Primary) - 최고 성능
2. 🔄 **OpenAI o3** (Fallback 1) - OpenAI 최상위 모델
3. 🔄 **Gemini Exp 1206** (Fallback 2) - Google 실험 모델
4. 🔄 **Claude Sonnet 4.5** (Fallback 3) - 안정적인 대안

---

## 🔑 API 키 설정

### 모든 Provider 설정 (권장)

```bash
# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI
export OPENAI_API_KEY="sk-..."

# Google Gemini
export GEMINI_API_KEY="..."
```

**장점:**
- ✅ 최대 가용성 (3개 provider)
- ✅ 자동 폴백 (API 다운 시)
- ✅ 비용 최적화 (provider별 가격 차이)

---

### 단일 Provider 설정

#### Anthropic만 사용

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**동작:**
- Cheap: Claude Haiku 4.5 ✅
- Mid: Claude Sonnet 4.5 ✅
- Premium: Claude Opus 4.6 ✅ → Sonnet 4.5 (fallback)

#### OpenAI만 사용

```bash
export OPENAI_API_KEY="sk-..."
```

**동작:**
- Cheap: GPT-4o Mini ✅ (fallback 1)
- Mid: GPT-4o ✅ (fallback 1)
- Premium: o3 ✅ (fallback 1)

#### Google만 사용

```bash
export GEMINI_API_KEY="..."
```

**동작:**
- Cheap: Gemini 2.0 Flash ✅ (fallback 2)
- Mid: Gemini 2.0 Flash Thinking ✅ (fallback 2)
- Premium: Gemini Exp 1206 ✅ (fallback 2)

---

## 🔄 폴백 동작 예시

### 예시 1: Anthropic + Google (OpenAI 없음)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="..."
# OPENAI_API_KEY 없음
```

**Mid 티어 선택 시:**
1. `anthropic/claude-sonnet-4-5` ✅ 사용
2. `openai/gpt-4o` ❌ 건너뜀 (API 키 없음)
3. `google/gemini-2.0-flash-thinking-exp` ⏭️ 사용 안 함 (이미 선택됨)

---

### 예시 2: OpenAI + Google (Anthropic 없음)

```bash
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
# ANTHROPIC_API_KEY 없음
```

**Mid 티어 선택 시:**
1. `anthropic/claude-sonnet-4-5` ❌ 건너뜀 (API 키 없음)
2. `openai/gpt-4o` ✅ 사용 (fallback 1)
3. `google/gemini-2.0-flash-thinking-exp` ⏭️ 사용 안 함 (이미 선택됨)

---

### 예시 3: Google만 (Anthropic, OpenAI 없음)

```bash
export GEMINI_API_KEY="..."
# ANTHROPIC_API_KEY 없음
# OPENAI_API_KEY 없음
```

**Mid 티어 선택 시:**
1. `anthropic/claude-sonnet-4-5` ❌ 건너뜀 (API 키 없음)
2. `openai/gpt-4o` ❌ 건너뜀 (API 키 없음)
3. `google/gemini-2.0-flash-thinking-exp` ✅ 사용 (fallback 2)

---

## 🎨 커스터마이징

### YAML 설정으로 티어 변경

```yaml
agents:
  defaults:
    smartRouting:
      enabled: true
      tiers:
        cheap:
          primary: "google/gemini-2.0-flash-exp"  # Google 우선
          fallbacks: ["anthropic/claude-haiku-4-5", "openai/gpt-4o-mini"]
        mid:
          primary: "openai/gpt-4o"  # OpenAI 우선
          fallbacks: ["anthropic/claude-sonnet-4-5", "google/gemini-2.0-flash-thinking-exp"]
        premium:
          primary: "google/gemini-exp-1206"  # Google 우선
          fallbacks: ["anthropic/claude-opus-4-6", "openai/o3"]
```

---

## 📊 Provider 비교

| Provider | Cheap | Mid | Premium |
|----------|-------|-----|---------|
| **Anthropic** | Haiku 4.5 | Sonnet 4.5 | Opus 4.6 |
| **OpenAI** | GPT-4o Mini | GPT-4o | o3 |
| **Google** | Gemini 2.0 Flash | Gemini 2.0 Flash Thinking | Gemini Exp 1206 |

### 특징

**Anthropic Claude:**
- ✅ 긴 컨텍스트 (200K 토큰)
- ✅ 안정적인 성능
- ✅ 코딩 작업에 강함

**OpenAI GPT:**
- ✅ 빠른 응답 속도
- ✅ 광범위한 지식
- ✅ o3는 추론 능력 우수

**Google Gemini:**
- ✅ 무료 티어 제공
- ✅ 멀티모달 지원
- ✅ Flash Thinking은 추론 최적화

---

## 🎯 권장 설정

### 1. 최대 가용성 (모든 Provider)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GEMINI_API_KEY="..."
```

**장점:**
- 어떤 provider가 다운되어도 자동 폴백
- 최적의 비용/성능 조합
- 3중 백업 시스템

---

### 2. 비용 최적화 (Anthropic + Google)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="..."
```

**장점:**
- Anthropic의 안정성
- Google의 무료 티어 활용
- OpenAI 비용 절감

---

### 3. 단순 설정 (Anthropic만)

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

**장점:**
- 설정 간단
- 일관된 품질
- Claude 생태계 활용

---

## ✅ 결론

**모든 Provider의 API 키가 필요한가요?**

**아니요!** 하지만 **3개 모두 설정하는 것을 권장**합니다:

- ✅ **1개만 설정**: 작동함 (해당 provider만 사용)
- ✅ **2개 설정**: 더 좋음 (자동 폴백)
- ✨ **3개 설정**: 최고! (최대 가용성 + 비용 최적화)

**기본 설정에 Gemini가 포함되어 있으므로**, Google API 키를 추가하면 더 많은 폴백 옵션을 활용할 수 있습니다!

**버전:** 1.3  
**마지막 업데이트:** 2026-02-09  
**상태:** Gemini 지원 추가 완료 ✅
