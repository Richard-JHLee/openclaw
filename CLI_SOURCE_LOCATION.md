# 🔍 OpenClaw CLI 소스 위치 확인

## 📍 현재 상황

### CLI 실행 경로

```bash
$ which openclaw
openclaw: aliased to ~/.nvm/versions/node/v22.22.0/bin/openclaw
```

### 실제 파일 위치

```bash
~/.nvm/versions/node/v22.22.0/bin/openclaw
  ↓ (심볼릭 링크)
~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/openclaw.mjs
  ↓ (실제 소스)
~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/dist/
```

---

## ⚠️ 중요 발견!

### 현재 사용 중인 소스

**CLI에서 `openclaw` 실행 시:**
```
~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/
```

**이것은 npm으로 설치된 글로벌 패키지입니다!**

### 수정한 소스

**우리가 수정한 소스:**
```
/Users/richard/source/openclaw/
```

**이것은 로컬 개발 디렉토리입니다!**

---

## 🚨 문제: 수정 사항이 반영 안 됨!

### 현재 상황

1. ✅ **로컬 소스 수정 완료**
   - `/Users/richard/source/openclaw/src/agents/model-selection.ts`
   - SmartModelRouter 완전 통합 ✅

2. ✅ **로컬 빌드 완료**
   - `/Users/richard/source/openclaw/dist/`
   - 빌드된 파일 생성 ✅

3. ❌ **CLI는 다른 소스 사용**
   - `~/.nvm/.../node_modules/openclaw/`
   - **2월 8일 버전** (수정 전!)

---

## 🔧 해결 방법

### 옵션 1: 로컬 소스 링크 (권장!)

로컬 개발 디렉토리를 글로벌로 링크:

```bash
# 현재 글로벌 패키지 제거
npm uninstall -g openclaw

# 로컬 소스를 글로벌로 링크
cd /Users/richard/source/openclaw
npm link

# 확인
which openclaw
# → /Users/richard/source/openclaw/openclaw.mjs 를 가리켜야 함
```

**장점:**
- ✅ 로컬 수정 사항이 즉시 반영
- ✅ 개발 중인 코드 테스트 가능
- ✅ 빌드 후 바로 사용 가능

---

### 옵션 2: 로컬에서 직접 실행

글로벌 설치 대신 로컬에서 직접 실행:

```bash
# 로컬 소스에서 직접 실행
cd /Users/richard/source/openclaw
node openclaw.mjs agent --local --session-id test --message "안녕하세요"
```

**장점:**
- ✅ 글로벌 설치 불필요
- ✅ 로컬 수정 사항 즉시 반영

**단점:**
- ❌ 매번 경로 지정 필요

---

### 옵션 3: 글로벌 재설치

로컬 빌드 후 글로벌 재설치:

```bash
# 로컬 빌드
cd /Users/richard/source/openclaw
pnpm build

# 글로벌 재설치
npm uninstall -g openclaw
npm install -g .

# 확인
openclaw --version
```

**장점:**
- ✅ 글로벌 명령어 사용 가능

**단점:**
- ❌ 수정할 때마다 재설치 필요

---

## 📊 현재 버전 확인

### 글로벌 설치 버전

```bash
$ ls -la ~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/
drwxr-xr-x@  14 richard  staff      448 Feb  8 11:16 .
```

**설치 날짜:** 2월 8일 11:16
**상태:** SmartModelRouter 수정 전 버전 ❌

### 로컬 개발 버전

```bash
$ ls -la /Users/richard/source/openclaw/dist/
```

**마지막 빌드:** 2월 9일 (오늘)
**상태:** SmartModelRouter 수정 완료 ✅

---

## ✅ 권장 조치

### 1단계: npm link 실행

```bash
# 글로벌 패키지 제거
npm uninstall -g openclaw

# 로컬 소스 링크
cd /Users/richard/source/openclaw
npm link
```

### 2단계: 확인

```bash
# 링크 확인
which openclaw

# 버전 확인
openclaw --version

# 테스트
openclaw agent --local --session-id test --message "안녕하세요"
```

### 3단계: SmartModelRouter 작동 확인

```bash
# 복잡도 점수 확인
node --import tsx check-scores.ts

# 실제 사용
openclaw agent --local --session-id test --message "JavaScript로 API 구현해주세요"
```

---

## 🎯 최종 요약

### 질문: "cli에서 openclaw 실행하면 어디 소스를 사용하는것인가?"

### 답변:

**현재 사용 중:**
```
~/.nvm/versions/node/v22.22.0/lib/node_modules/openclaw/
(2월 8일 버전 - 수정 전!)
```

**수정한 소스:**
```
/Users/richard/source/openclaw/
(2월 9일 버전 - 수정 완료!)
```

**해결책:**
```bash
npm uninstall -g openclaw
cd /Users/richard/source/openclaw
npm link
```

**이렇게 하면 로컬 수정 사항이 CLI에 반영됩니다!** ✅

---

**버전:** 10.0  
**마지막 업데이트:** 2026-02-09  
**상태:** 소스 위치 확인 완료 ✅
