/**
 * OpenClaw Smart Model Router - Confidence Checker
 *
 * 저가 모델의 응답 품질을 평가하여 상위 모델 승격 필요 여부를 판단한다.
 *
 * 평가 신호 6가지:
 *   1. 헤징 언어 (아마도, perhaps, maybe...)       최대 -0.30
 *   2. 짧은 응답 (입력 대비 너무 짧은 출력)          최대 -0.25
 *   3. 반복 (유사 문장 반복)                        최대 -0.20
 *   4. 거부/회피                                   최대 -0.35
 *   5. 불완전한 응답 (미닫힌 코드블록, 끊긴 목록)      최대 -0.20
 *   6. 자기 모순                                   최대 -0.25
 *
 * confidence = max(0, 1.0 - sum(penalties))
 * needsPromotion = confidence < threshold (기본 0.55)
 */

import type { ConfidenceAssessment, ConfidenceSignal, PromotionConfig } from "./types.js";
import { DEFAULT_PROMOTION } from "./defaults.js";

// ─── Signal Detection Patterns ───────────────────────────────

/** 헤징 표현 */
const HEDGING_PATTERNS: RegExp[] = [
  // 한국어
  /아마도/,
  /~?일\s*수\s*있습니다/,
  /확실하지\s*않/,
  /잘\s*모르겠/,
  /추측이지만/,
  /아마\s/,
  /~?일\s*것\s*같/,
  /정확하지\s*않을\s*수/,
  /확인이\s*필요/,
  // 영어
  /\bI'?m not sure\b/i,
  /\bperhaps\b/i,
  /\bmaybe\b/i,
  /\bmight be\b/i,
  /\bcould be\b/i,
  /\bI think\b/i,
  /\bpossibly\b/i,
  /\bI believe\b/i,
  /\bnot certain\b/i,
  /\bif I recall\b/i,
];

/** 거부/회피 표현 */
const REFUSAL_PATTERNS: RegExp[] = [
  // 한국어
  /할\s*수\s*없습니다/,
  /도움을\s*드리기\s*어렵/,
  /제\s*능력\s*밖/,
  /답변하기\s*어렵/,
  /정보가\s*부족/,
  /알\s*수\s*없/,
  // 영어
  /\bI cannot\b/i,
  /\bbeyond my (scope|capabilities)\b/i,
  /\bdon'?t have enough information\b/i,
  /\bunable to (help|assist|provide)\b/i,
  /\bI'?m not able to\b/i,
  /\boutside my (knowledge|expertise)\b/i,
];

/** 자기 모순 표현 */
const CONTRADICTION_PATTERNS: RegExp[] = [
  // 한국어
  /수정하자면/,
  /정정합니다/,
  /앞의\s*내용과\s*달리/,
  /다시\s*생각해\s*보면/,
  /아,?\s*(잠깐|사실)/,
  /틀렸습니다.*맞는/,
  // 영어
  /\bactually,?\s*let me correct\b/i,
  /\bI need to correct\b/i,
  /\bwait,?\s*(actually|no)\b/i,
  /\bon second thought\b/i,
  /\bthat'?s (wrong|incorrect),?\s*(actually|let me)\b/i,
];

// ─── Signal Detection Functions ──────────────────────────────

/**
 * 1. 헤징 언어 감지 → 인스턴스당 8% 감점, 최대 30%
 */
function detectHedging(response: string): ConfidenceSignal | null {
  let matchCount = 0;
  const matched: string[] = [];

  for (const pattern of HEDGING_PATTERNS) {
    const matches = response.match(new RegExp(pattern.source, pattern.flags + "g"));
    if (matches) {
      matchCount += matches.length;
      matched.push(pattern.source);
    }
  }

  if (matchCount === 0) return null;

  const weight = Math.min(0.3, matchCount * 0.08);
  return {
    type: "hedging",
    weight,
    detail: `헤징 표현 ${matchCount}회 감지 (${matched.slice(0, 3).join(", ")}...)`,
  };
}

/**
 * 2. 짧은 응답 감지 → 입력 토큰 대비 출력이 너무 짧으면 감점
 */
function detectShortResponse(response: string, inputTokens: number): ConfidenceSignal | null {
  const responseLen = response.trim().length;

  // 빈 응답 또는 사실상 빈 응답
  if (responseLen < 5) {
    return {
      type: "short_response",
      weight: 0.55,
      detail: `응답이 사실상 비어있음 (${responseLen}자)`,
    };
  }

  if (inputTokens >= 100 && responseLen < 100) {
    return {
      type: "short_response",
      weight: 0.35,
      detail: `입력 ${inputTokens}토큰 대비 응답이 ${responseLen}자로 과소`,
    };
  }

  if (inputTokens >= 50 && responseLen < 50) {
    return {
      type: "short_response",
      weight: 0.3,
      detail: `입력 ${inputTokens}토큰 대비 응답이 ${responseLen}자로 과소`,
    };
  }

  return null;
}

/**
 * 3. 반복 감지 → 트라이그램 유사도 기반
 */
function detectRepetition(response: string): ConfidenceSignal | null {
  const sentences = response
    .split(/[.!?。！？\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  if (sentences.length < 3) return null;

  // 트라이그램 유사도 계산
  function trigrams(text: string): Set<string> {
    const set = new Set<string>();
    const clean = text.toLowerCase().replace(/\s+/g, " ");
    for (let i = 0; i <= clean.length - 3; i++) {
      set.add(clean.substring(i, i + 3));
    }
    return set;
  }

  function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    let intersection = 0;
    for (const item of a) {
      if (b.has(item)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  let duplicateCount = 0;
  const trigramSets = sentences.map(trigrams);

  for (let i = 0; i < trigramSets.length; i++) {
    for (let j = i + 1; j < trigramSets.length; j++) {
      if (jaccardSimilarity(trigramSets[i], trigramSets[j]) > 0.8) {
        duplicateCount++;
      }
    }
  }

  if (duplicateCount === 0) return null;

  const ratio = duplicateCount / sentences.length;
  const weight = Math.min(0.2, ratio * 0.3);

  return {
    type: "repetition",
    weight,
    detail: `${sentences.length}문장 중 ${duplicateCount}쌍 반복 감지 (유사도>0.8)`,
  };
}

/**
 * 4. 거부/회피 감지
 */
function detectRefusal(response: string): ConfidenceSignal | null {
  for (const pattern of REFUSAL_PATTERNS) {
    if (pattern.test(response)) {
      return {
        type: "refusal",
        weight: 0.35,
        detail: `거부/회피 표현 감지: ${pattern.source}`,
      };
    }
  }
  return null;
}

/**
 * 5. 불완전 응답 감지 → 미닫힌 코드블록, 끊긴 목록 등
 */
function detectIncomplete(response: string): ConfidenceSignal | null {
  const reasons: string[] = [];

  // 미닫힌 코드 블록
  const codeBlockCount = (response.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    reasons.push("미닫힌 코드 블록");
  }

  // 긴 텍스트가 문장부호 없이 끝남
  if (response.length > 200 && !/[.!?。！？)\]}>]$/.test(response.trim())) {
    reasons.push("응답이 중간에 끊긴 것으로 보임");
  }

  // 번호 목록 끊김 (e.g., "3가지:" 했지만 2개만)
  const listCountMatch = response.match(/(\d+)\s*(?:가지|개|항목|things?|items?|points?)\s*[:：]/i);
  if (listCountMatch) {
    const expected = parseInt(listCountMatch[1], 10);
    const numberedItems = (response.match(/^\s*\d+[.)]\s/gm) || []).length;
    if (numberedItems > 0 && numberedItems < expected) {
      reasons.push(`${expected}개 예고했으나 ${numberedItems}개만 나열`);
    }
  }

  if (reasons.length === 0) return null;

  return {
    type: "incomplete",
    weight: 0.2,
    detail: `불완전: ${reasons.join(", ")}`,
  };
}

/**
 * 6. 자기 모순 감지
 */
function detectContradiction(response: string): ConfidenceSignal | null {
  for (const pattern of CONTRADICTION_PATTERNS) {
    if (pattern.test(response)) {
      return {
        type: "self_contradiction",
        weight: 0.25,
        detail: `자기 모순 표현 감지: ${pattern.source}`,
      };
    }
  }
  return null;
}

// ─── Main Assessment Function ────────────────────────────────

/**
 * 모델 응답의 신뢰도를 평가한다.
 *
 * @param response 모델이 생성한 응답 텍스트
 * @param inputTokens 원래 입력의 추정 토큰 수
 * @param config 승격 설정
 * @returns ConfidenceAssessment
 */
export function assessConfidence(
  response: string,
  inputTokens: number,
  config: PromotionConfig = DEFAULT_PROMOTION
): ConfidenceAssessment {
  const signals: ConfidenceSignal[] = [];

  // 6가지 신호 검사
  const hedging = detectHedging(response);
  if (hedging) signals.push(hedging);

  const shortResp = detectShortResponse(response, inputTokens);
  if (shortResp) signals.push(shortResp);

  const repetition = detectRepetition(response);
  if (repetition) signals.push(repetition);

  const refusal = detectRefusal(response);
  if (refusal) signals.push(refusal);

  const incomplete = detectIncomplete(response);
  if (incomplete) signals.push(incomplete);

  const contradiction = detectContradiction(response);
  if (contradiction) signals.push(contradiction);

  // 종합 신뢰도 = 1.0 - sum(penalties)
  const totalPenalty = signals.reduce((sum, s) => sum + s.weight, 0);
  const score = Math.max(0, Math.min(1, 1.0 - totalPenalty));

  return {
    score,
    signals,
    needsPromotion: config.enabled && score < config.confidenceThreshold,
  };
}
