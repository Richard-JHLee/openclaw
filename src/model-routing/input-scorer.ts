/**
 * OpenClaw Smart Model Router - Input Scorer
 *
 * 입력 텍스트에서 7가지 피처를 추출하고 복잡도 점수(0~100)를 산출한다.
 *
 * 피처별 점수:
 *   길이(토큰)        0 ~ 25점
 *   코드/로그          +25점
 *   수학/증명/최적화    +20점
 *   멀티스텝           +15점
 *   제약조건           +10점
 *   모호함             +10점
 *   첨부/URL           +5점
 */

import type {
  InputFeatures,
  FeatureScores,
  ComplexityScore,
  ScoringWeights,
  RoutingThresholds,
} from "./types.js";
import { DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, scoreToTier } from "./defaults.js";

// ─── Pattern Definitions ─────────────────────────────────────

/** 코드/로그 패턴 */
const CODE_PATTERNS: RegExp[] = [
  // 프로그래밍 키워드
  /\b(function|const|let|var|class|interface|import|export|return|if|else|for|while|switch|try|catch|async|await|def|public|private|static)\b/,
  // 코드 기호
  /[{}()\[\]];?\s*[=!<>]+/,
  /=>/,
  // 마크다운 코드 블록
  /```[\s\S]*?```/,
  /`[^`]+`/,
  // 스택트레이스 / 로그
  /\b(ERROR|WARN|INFO|DEBUG|TRACE|Exception|Traceback|at\s+\w+\.\w+)\b/,
  /\b(TypeError|SyntaxError|ReferenceError|RuntimeError|NullPointerException)\b/,
  // 파일 경로
  /[\/\\]\w+\.\w{1,5}\b/,
  // 한국어 코드 관련
  /코드|소스|스크립트|함수|클래스|모듈|라이브러리|디버그|에러|버그|리팩터/,
  // 프로그래밍 언어명
  /\b(Python|JavaScript|TypeScript|Java|C\+\+|Rust|Go|Ruby|PHP|Swift|Kotlin|SQL|HTML|CSS|React|Vue|Angular|Node\.?js|Django|Flask|Spring)\b/i,
];

/** 수학/증명/최적화 패턴 */
const MATH_PATTERNS: RegExp[] = [
  // 수학 기호
  /[∑∏∫∂∇√∞≤≥≠±×÷∈∉⊂⊃∪∩]/,
  // 수학 함수
  /\b(sin|cos|tan|log|ln|exp|lim|max|min|argmax|argmin|det|trace)\b/i,
  // 수학 키워드
  /\b(theorem|proof|lemma|corollary|derivative|integral|matrix|vector|eigenvalue|polynomial|equation|formula)\b/i,
  // LaTeX
  /\$\$[\s\S]+?\$\$/,
  /\\(frac|sqrt|sum|prod|int|partial|nabla|begin|end)\b/,
  // 한국어 수학 관련
  /수식|증명|정리|미분|적분|행렬|벡터|방정식|최적화|알고리즘|복잡도|확률|통계/,
];

/** 멀티스텝 패턴 */
const MULTI_STEP_PATTERNS: RegExp[] = [
  // 영어 키워드
  /\b(design|implement|build|deploy|compare|analyze|test|refactor|migrate|plan|create|develop|integrate|evaluate)\b/i,
  // 한국어 키워드
  /설계|구현|개발|테스트|배포|비교|정리|분석|리팩터링|마이그레이션|통합/,
  // 순서 표현
  /먼저[\s,].*그\s*다음|첫째[\s,].*둘째|1\)[\s\S]*?2\)[\s\S]*?3\)/,
  /\bstep\s*\d/i,
  /\b(first|then|next|finally|after that)\b/i,
  // 복합 요청 (여러 동사)
  /그리고[\s,].*(해줘|해주세요|부탁)/,
];

/** 제약조건 패턴 */
const CONSTRAINT_PATTERNS: RegExp[] = [
  // 영어 키워드
  /\b(must|require|constraint|restriction|mandatory|forbidden|strictly|compliance|ensure|guarantee)\b/i,
  // 구체적 제약
  /\b(deadline|latency|throughput|SLA|uptime|availability|budget|limit)\b/i,
  /\b(performance|security|accuracy|precision|recall|f1|benchmark)\b/i,
  // 한국어 키워드
  /반드시|금지|조건|제한|성능|보안|정확도|필수|보장|제약|준수|규정/,
  // 수치 제약
  /\d+\s*(ms|초|분|시간|MB|GB|%|이하|이상|미만|이내)/,
];

/** 모호성 패턴 */
const AMBIGUITY_PATTERNS: RegExp[] = [
  // 한국어 모호 표현
  /이거|저거|그거|이것|저것|그것|이건|저건|그건/,
  /(해줘|해주세요|부탁|좀)\s*$/,
  // 영어 모호 표현
  /\b(this thing|that thing|do it|fix it|make it work|help me|figure out)\b/i,
  // 매우 짧은 질문 (한/영 15자 이하 + 물음표)
  /^.{1,15}[?？]$/,
];

/** 첨부/URL 패턴 */
const ATTACHMENT_PATTERNS: RegExp[] = [
  // URL
  /https?:\/\/\S+/,
  // 파일 확장자
  /\.(png|jpg|jpeg|gif|webp|svg|pdf|docx?|xlsx?|csv|json|xml|yaml|yml|zip|tar|gz|mp[34]|wav)\b/i,
  // 한국어 첨부 키워드
  /첨부|이미지|파일|사진|스크린샷|캡처|업로드/,
  // 영어 첨부 키워드
  /\b(attachment|image|file|screenshot|upload|photo|diagram)\b/i,
];

// ─── Token Estimation ────────────────────────────────────────

/**
 * 토큰 수 추정 (한국어 + 영어 + 코드 혼합 대응)
 *
 * - 한글 1자 ≈ 0.67 토큰
 * - 영어 1단어 ≈ 1.3 토큰
 * - 코드 블록은 3문자당 1토큰으로 계산
 */
export function estimateTokenCount(input: string): number {
  // 코드 블록 별도 처리
  let codeTokens = 0;
  const withoutCodeBlocks = input.replace(/```[\s\S]*?```/g, (block) => {
    codeTokens += Math.ceil(block.length / 3);
    return "";
  });

  // 한글 문자 수
  const koreanChars = (withoutCodeBlocks.match(/[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/g) || []).length;
  const koreanTokens = Math.ceil(koreanChars / 1.5);

  // 한글 제거 후 영어 단어 수
  const nonKorean = withoutCodeBlocks.replace(/[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/g, "");
  const englishWords = nonKorean.split(/\s+/).filter((w) => w.length > 0).length;
  const englishTokens = Math.ceil(englishWords * 1.3);

  return koreanTokens + englishTokens + codeTokens;
}

// ─── Feature Extraction ──────────────────────────────────────

/** 패턴 배열 중 하나라도 매치하면 true */
function matchesAny(input: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(input));
}

/**
 * 입력에서 7가지 피처 추출
 */
export function extractFeatures(input: string, hasAttachments: boolean = false): InputFeatures {
  return {
    tokenCount: estimateTokenCount(input),
    hasCode: matchesAny(input, CODE_PATTERNS),
    mathLike: matchesAny(input, MATH_PATTERNS),
    multiStep: matchesAny(input, MULTI_STEP_PATTERNS),
    constraints: matchesAny(input, CONSTRAINT_PATTERNS),
    ambiguity: matchesAny(input, AMBIGUITY_PATTERNS),
    attachments: hasAttachments || matchesAny(input, ATTACHMENT_PATTERNS),
  };
}

// ─── Score Calculation ───────────────────────────────────────

/**
 * 토큰 수 → 길이 점수 (0 ~ maxScore)
 *
 * 구간별 보간:
 *   0~50 토큰   → 0~5점
 *   50~200 토큰  → 5~15점
 *   200~500 토큰 → 15~20점
 *   500+ 토큰   → 20~25점 (max)
 */
function scoreLengthFromTokens(tokens: number, maxScore: number): number {
  const breakpoints = [
    { threshold: 0, score: 0 },
    { threshold: 30, score: maxScore * 0.15 },
    { threshold: 80, score: maxScore * 0.35 },
    { threshold: 200, score: maxScore * 0.6 },
    { threshold: 500, score: maxScore * 0.85 },
    { threshold: 1000, score: maxScore },
  ];

  // 최대값 초과
  if (tokens >= breakpoints[breakpoints.length - 1].threshold) {
    return maxScore;
  }

  // 구간 보간
  for (let i = 1; i < breakpoints.length; i++) {
    if (tokens <= breakpoints[i].threshold) {
      const prev = breakpoints[i - 1];
      const curr = breakpoints[i];
      const ratio = (tokens - prev.threshold) / (curr.threshold - prev.threshold);
      return prev.score + ratio * (curr.score - prev.score);
    }
  }

  return maxScore;
}

/**
 * 피처 → 개별 점수 계산
 */
export function calculateFeatureScores(
  features: InputFeatures,
  weights: ScoringWeights = DEFAULT_WEIGHTS
): FeatureScores {
  return {
    length: scoreLengthFromTokens(features.tokenCount, weights.lengthMax),
    code: features.hasCode ? weights.codeBonus : 0,
    math: features.mathLike ? weights.mathBonus : 0,
    multiStep: features.multiStep ? weights.multiStepBonus : 0,
    constraints: features.constraints ? weights.constraintBonus : 0,
    ambiguity: features.ambiguity ? weights.ambiguityBonus : 0,
    attachments: features.attachments ? weights.attachmentBonus : 0,
  };
}

/**
 * 입력 텍스트의 복잡도 점수 산출 (메인 함수)
 *
 * @param input 사용자 입력 텍스트
 * @param hasAttachments 외부 첨부파일 존재 여부
 * @param weights 스코어링 가중치
 * @param thresholds 라우팅 임계값
 * @returns ComplexityScore
 */
export function scoreInput(
  input: string,
  hasAttachments: boolean = false,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
  thresholds: RoutingThresholds = DEFAULT_THRESHOLDS
): ComplexityScore {
  const features = extractFeatures(input, hasAttachments);
  const featureScores = calculateFeatureScores(features, weights);

  // 원점수 합산
  const baseScore =
    featureScores.length +
    featureScores.code +
    featureScores.math +
    featureScores.multiStep +
    featureScores.constraints +
    featureScores.ambiguity +
    featureScores.attachments;

  // 복합 피처 상호작용 보너스
  // 여러 피처가 동시에 활성화되면 복잡도가 비선형으로 증가
  const activeFeatureCount = [
    features.hasCode,
    features.mathLike,
    features.multiStep,
    features.constraints,
    features.ambiguity,
    features.attachments,
  ].filter(Boolean).length;

  let interactionBonus = 0;
  if (activeFeatureCount >= 4) interactionBonus = 20;
  else if (activeFeatureCount >= 3) interactionBonus = 12;
  else if (activeFeatureCount >= 2) interactionBonus = 5;

  const rawScore = baseScore + interactionBonus;

  // 원점수를 직접 사용 (임계값 35/65와 맞춤), 100 초과 시 cap
  const normalizedScore = Math.min(100, Math.round(rawScore));

  // 티어 결정
  const tier = scoreToTier(normalizedScore, thresholds);

  return {
    rawScore: Math.round(rawScore * 100) / 100,
    normalizedScore,
    featureScores,
    features,
    tier,
  };
}
