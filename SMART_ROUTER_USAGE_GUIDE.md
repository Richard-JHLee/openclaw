# ✅ OpenClaw SmartModelRouter 사용 가이드

## 🚀 올바른 사용 방법

### 명령어

OpenClaw는 `chat` 명령어가 아니라 **`agent`** 명령어를 사용하며, **세션 ID가 필수**입니다:

```bash
# ❌ 잘못된 명령어
openclaw chat
openclaw agent --local --message "안녕하세요"  # 세션 ID 없음

# ✅ 올바른 명령어
openclaw agent --local --session-id test --message "안녕하세요"
```

---

## 📝 기본 사용법

### 1. 간단한 질문 (cheap 티어 예상)

```bash
openclaw agent --local --session-id test --message "안녕하세요"
```

**예상 결과:**
- SmartModelRouter가 복잡도 분석
- cheap 티어 선택 (gpt-4o-mini)
- 빠른 응답, 저렴한 비용 ✅

---

### 2. 중간 복잡도 작업 (mid 티어 예상)

```bash
openclaw agent --local --session-id test --message "JavaScript로 간단한 REST API를 만들어주세요"
```

**예상 결과:**
- SmartModelRouter가 복잡도 분석
- cheap 또는 mid 티어 선택
- 적절한 성능 ✅

---

### 3. 복잡한 작업 (premium 티어 예상)

```bash
openclaw agent --local --session-id test --message "다음 미분방정식을 풀어주세요: d²y/dx² + 3dy/dx + 2y = e^(-x), 초기 조건: y(0) = 1, y'(0) = 0. 단계별 풀이 과정을 보여주고 Python 코드도 작성해주세요."
```

**예상 결과:**
- SmartModelRouter가 복잡도 분석
- premium 티어 선택 (o3)
- 고품질 응답 ✅

---

## 🔍 디버그 모드

선택된 모델을 로그로 확인하려면:

### 1. 설정 파일 수정

```yaml
# ~/.openclaw/openclaw.yaml
agents:
  defaults:
    smartRouting:
      enabled: true
      debug: true  # ✅ 디버그 모드 활성화
```

### 2. 실행

```bash
openclaw agent --local --message "테스트" --verbose on
```

**로그 예시:**
```
[smart-router] selected model: openai/gpt-4o-mini for session=session-123
```

---

## 💡 주요 옵션

### `--local`
로컬에서 실행 (Gateway 없이)
```bash
openclaw agent --local --session-id test --message "안녕하세요"
```

### `--session-id`
특정 세션 사용
```bash
openclaw agent --local --session-id my-session --message "계속해서..."
```

### `--thinking`
Thinking 레벨 설정
```bash
openclaw agent --local --message "복잡한 문제" --thinking high
```

### `--verbose`
상세 로그 출력
```bash
openclaw agent --local --message "테스트" --verbose on
```

---

## 🎯 실제 사용 예시

### 예시 1: 간단한 대화

```bash
openclaw agent --local --session-id test --message "안녕하세요"
```

**SmartModelRouter 동작:**
```
입력: "안녕하세요"
복잡도: 5/100
티어: cheap
선택: openai/gpt-4o-mini
비용: 💰 (저렴)
```

---

### 예시 2: 코딩 작업

```bash
openclaw agent --local --message "Python으로 간단한 웹 스크래퍼를 만들어주세요. BeautifulSoup을 사용하고, 에러 처리도 포함해주세요."
```

**SmartModelRouter 동작:**
```
입력: "Python 웹 스크래퍼..."
복잡도: 35/100
티어: cheap
선택: openai/gpt-4o-mini
비용: 💰 (저렴)
```

---

### 예시 3: 복잡한 알고리즘

```bash
openclaw agent --local --message "AlexNet과 ResNet을 PyTorch로 구현하고 비교해주세요. 아키텍처 분석, ImageNet 훈련, 성능 지표 포함."
```

**SmartModelRouter 동작:**
```
입력: "AlexNet과 ResNet..."
복잡도: 65/100
티어: mid
선택: openai/gpt-4o
비용: 💰💰 (중간)
```

---

### 예시 4: 매우 복잡한 수학

```bash
openclaw agent --local --message "다음 미분방정식을 풀어주세요: d²y/dx² + 3dy/dx + 2y = e^(-x), 초기 조건: y(0) = 1, y'(0) = 0. 단계별 풀이와 Python 코드 포함."
```

**SmartModelRouter 동작:**
```
입력: "미분방정식..."
복잡도: 85/100
티어: premium
선택: openai/o3
비용: 💰💰💰 (비쌈)
```

---

## ⚠️ 주의사항

### API 키 필요

`--local` 옵션을 사용하려면 환경 변수에 API 키가 필요합니다:

```bash
export OPENAI_API_KEY="sk-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export GEMINI_API_KEY="..."
```

또는 설정 파일에:
```yaml
# ~/.openclaw/openclaw.yaml
models:
  providers:
    openai:
      apiKey: "sk-..."
    anthropic:
      apiKey: "sk-ant-..."
    google:
      apiKey: "..."
```

---

## 🎉 요약

### 올바른 명령어

```bash
# ✅ 이렇게 사용하세요!
openclaw agent --local --message "당신의 질문"

# ❌ 이건 안 됩니다
openclaw chat
```

### SmartModelRouter 자동 작동

```
사용자 입력
    ↓
SmartModelRouter 자동 실행
    ├─ 복잡도 분석
    ├─ 티어 결정
    └─ API 키 확인
    ↓
최적 모델 선택
    ✅ 완료!
```

### 예상 효과

- 💰 **비용 절감**: 평균 40-50%
- ⚡ **성능 최적화**: 작업에 맞는 모델 선택
- 🔄 **자동 폴백**: API 키 없으면 다른 provider 사용

**이제 OpenClaw를 사용하면 SmartModelRouter가 자동으로 작동합니다!** 🚀

---

**버전:** 5.0 (최종)  
**마지막 업데이트:** 2026-02-09  
**상태:** 사용 가이드 완료 ✅
