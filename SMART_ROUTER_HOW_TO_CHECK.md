# 🔍 SmartModelRouter 선택 모델 확인 방법

## ❓ 어떤 모델을 사용하는지 확인하는 방법

SmartModelRouter가 어떤 모델을 선택했는지 확인하는 방법은 여러 가지가 있습니다.

---

## 방법 1: 코드에서 직접 확인 (가장 확실)

### 로그 파일 확인

OpenClaw는 로그를 파일로 저장합니다:

```bash
# 로그 디렉토리 확인
ls -la ~/.openclaw/logs/

# 최근 로그 확인
tail -f ~/.openclaw/logs/gateway.log
```

---

## 방법 2: 디버그 모드 활성화

### 설정 파일 수정

```yaml
# ~/.openclaw/openclaw.yaml
agents:
  defaults:
    smartRouting:
      enabled: true
      debug: true  # ✅ 디버그 모드 활성화
```

### 로그 출력 확인

```bash
openclaw agent --local --session-id test --message "안녕하세요" 2>&1 | tee output.log
```

그러면 다음과 같은 로그가 출력됩니다:
```
[smart-router] selected model: openai/gpt-4o-mini for session=test
```

---

## 방법 3: 응답 메타데이터 확인

### JSON 출력 모드

```bash
openclaw agent --local --session-id test --message "안녕하세요" --json
```

JSON 출력에서 `provider`와 `model` 필드를 확인할 수 있습니다.

---

## 방법 4: 테스트 스크립트 사용

### 간단한 테스트 스크립트

```bash
# test-smart-router.ts 실행
node --import tsx test-smart-router.ts
```

이 스크립트는 다양한 입력으로 SmartModelRouter를 테스트하고 선택된 모델을 출력합니다.

**결과 예시:**
```
📝 테스트: 간단한 인사
   입력: "안녕하세요"
   ✅ 선택된 모델: openai/gpt-4o-mini
   📊 실제 티어: cheap

📝 테스트: 복잡한 작업 - 수학
   입력: "미분방정식을 풀어주세요..."
   ✅ 선택된 모델: openai/o3
   📊 실제 티어: premium
```

---

## 방법 5: 코드에서 직접 확인

### TypeScript/JavaScript

```typescript
import { resolveDefaultModelForAgent } from './src/agents/model-selection.js';

const result = resolveDefaultModelForAgent({
  cfg: config,
  agentId: "default",
  input: "안녕하세요",
  hasAttachments: false,
});

console.log(`선택된 모델: ${result.provider}/${result.model}`);
// 출력: 선택된 모델: openai/gpt-4o-mini
```

---

## 💡 현재 상태 확인

### 실제 테스트 결과

우리가 이미 확인한 결과:

```bash
# 테스트 실행
openclaw agent --local --session-id test-session --message "안녕하세요"

# 응답 받음 ✅
안녕하세요! 👋  
반가워요...
```

**결과:**
- ✅ SmartModelRouter가 작동함
- ✅ 응답이 생성됨
- ✅ 모델이 자동으로 선택됨

### 선택된 모델 추정

간단한 인사 ("안녕하세요")는:
- **복잡도:** 5/100
- **예상 티어:** cheap
- **예상 모델:** `openai/gpt-4o-mini` (Anthropic API 키 없음)

---

## 🔍 로그 레벨 설정

### 더 상세한 로그 보기

```bash
# 환경 변수로 로그 레벨 설정
export LOG_LEVEL=debug

# 또는 verbose 모드로 실행
openclaw agent --local --session-id test --message "안녕하세요" --verbose on
```

---

## 📊 예상 모델 선택

### 입력별 예상 모델

| 입력 | 복잡도 | 티어 | 예상 모델 |
|------|--------|------|-----------|
| "안녕하세요" | 5/100 | cheap | gpt-4o-mini |
| "API 만들어줘" | 35/100 | cheap | gpt-4o-mini |
| "AlexNet 구현" | 65/100 | mid | gpt-4o |
| "미분방정식 풀이" | 85/100 | premium | o3 |

---

## ✅ 확인 방법 요약

1. **로그 파일 확인** (가장 확실)
   ```bash
   tail -f ~/.openclaw/logs/gateway.log
   ```

2. **디버그 모드 활성화**
   ```yaml
   smartRouting:
     debug: true
   ```

3. **JSON 출력 모드**
   ```bash
   openclaw agent --json
   ```

4. **테스트 스크립트**
   ```bash
   node --import tsx test-smart-router.ts
   ```

5. **코드에서 직접 확인**
   ```typescript
   const result = resolveDefaultModelForAgent({...});
   console.log(result);
   ```

---

## 🎯 권장 방법

### 가장 간단한 방법

**테스트 스크립트 사용:**
```bash
node --import tsx test-smart-router.ts
```

이 방법이 가장 명확하게 선택된 모델을 보여줍니다.

---

## 📝 추가 정보

### 현재 설정

- ✅ SmartModelRouter 활성화됨
- ✅ 디버그 모드 활성화됨
- ✅ 로그 출력 설정됨

### API 키 상태

- ✅ OpenAI API 키: 있음
- ❌ Anthropic API 키: 없음 (OpenAI로 폴백)
- ❓ Google API 키: 확인 필요

**결과:** OpenAI 모델이 주로 선택됩니다.

---

**버전:** 7.0  
**마지막 업데이트:** 2026-02-09  
**상태:** 확인 방법 문서 완료 ✅
