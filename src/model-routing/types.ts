/**
 * OpenClaw Smart Model Router - Type Definitions
 *
 * 입력 복잡도 기반 모델 자동 라우팅 시스템의 핵심 타입 정의
 */

// ─── Model Tier ──────────────────────────────────────────────

/** 모델 등급: 저가 / 중간 / 고성능 */
export type ModelTier = "cheap" | "mid" | "premium";

/** 각 티어에 할당된 모델 설정 */
export interface TierModelConfig {
  /** 기본 사용 모델 (provider/model 형식) */
  primary: string;
  /** 기본 모델 실패 시 대체 모델 목록 */
  fallbacks: string[];
  /** UI 표시용 별칭 */
  alias: string;
}

// ─── Feature Extraction ──────────────────────────────────────

/** 입력에서 추출하는 7가지 피처 */
export interface InputFeatures {
  /** 추정 토큰 수 */
  tokenCount: number;
  /** 코드/로그/스택트레이스 존재 여부 */
  hasCode: boolean;
  /** 수식/증명/최적화 키워드 존재 여부 */
  mathLike: boolean;
  /** 설계/구현/테스트 등 복합 작업 키워드 존재 여부 */
  multiStep: boolean;
  /** 반드시/금지/제한 등 제약 조건 키워드 존재 여부 */
  constraints: boolean;
  /** 지시대명사 + 맥락 부족 등 모호성 신호 */
  ambiguity: boolean;
  /** 첨부파일/이미지/URL 존재 여부 */
  attachments: boolean;
}

/** 각 피처별 개별 점수 */
export interface FeatureScores {
  length: number;
  code: number;
  math: number;
  multiStep: number;
  constraints: number;
  ambiguity: number;
  attachments: number;
}

// ─── Scoring ─────────────────────────────────────────────────

/** 최종 복잡도 점수 결과 */
export interface ComplexityScore {
  /** 원점수 합계 */
  rawScore: number;
  /** 정규화된 점수 (0-100) */
  normalizedScore: number;
  /** 피처별 개별 점수 */
  featureScores: FeatureScores;
  /** 추출된 피처 원본 */
  features: InputFeatures;
  /** 결정된 티어 */
  tier: ModelTier;
}

// ─── Routing Decision ────────────────────────────────────────

/** 라우팅 결정 결과 */
export interface RoutingDecision {
  /** 선택된 모델 (provider/model 형식) */
  model: string;
  /** 결정된 모델 티어 */
  tier: ModelTier;
  /** 복잡도 점수 상세 */
  score: ComplexityScore;
  /** 사람이 읽을 수 있는 라우팅 사유 */
  reason: string;
  /** 2단계 승격 여부 */
  promoted: boolean;
  /** 승격 전 원래 티어 (승격된 경우만) */
  originalTier?: ModelTier;
}

// ─── Confidence Assessment ───────────────────────────────────

/** 응답 신뢰도 평가에서 감지된 개별 신호 */
export interface ConfidenceSignal {
  /** 신호 유형 */
  type:
    | "hedging"
    | "short_response"
    | "repetition"
    | "refusal"
    | "incomplete"
    | "self_contradiction";
  /** 감점 가중치 (0.0 ~ 1.0) */
  weight: number;
  /** 설명 */
  detail: string;
}

/** 응답 신뢰도 평가 결과 */
export interface ConfidenceAssessment {
  /** 종합 신뢰도 점수 (0.0 ~ 1.0, 높을수록 신뢰) */
  score: number;
  /** 감지된 신호 목록 */
  signals: ConfidenceSignal[];
  /** 승격 필요 여부 */
  needsPromotion: boolean;
}

// ─── Configuration ───────────────────────────────────────────

/** 스코어링 가중치 설정 */
export interface ScoringWeights {
  /** 토큰 길이 최대 점수 (기본 25) */
  lengthMax: number;
  /** 코드/로그 감지 보너스 (기본 25) */
  codeBonus: number;
  /** 수학/증명 보너스 (기본 20) */
  mathBonus: number;
  /** 멀티스텝 보너스 (기본 15) */
  multiStepBonus: number;
  /** 제약조건 보너스 (기본 10) */
  constraintBonus: number;
  /** 모호성 보너스 (기본 10) */
  ambiguityBonus: number;
  /** 첨부파일 보너스 (기본 5) */
  attachmentBonus: number;
}

/** 라우팅 임계값 */
export interface RoutingThresholds {
  /** cheap → mid 경계 (기본 35) */
  cheapToMid: number;
  /** mid → premium 경계 (기본 65) */
  midToPremium: number;
}

/** 2단계 승격 설정 */
export interface PromotionConfig {
  /** 승격 기능 활성화 여부 */
  enabled: boolean;
  /** 이 신뢰도 미만이면 승격 (기본 0.55) */
  confidenceThreshold: number;
  /** 요청당 최대 승격 횟수 (기본 1) */
  maxPromotions: number;
  /** 한 번에 점프 가능한 최대 티어 수 (기본 1) */
  maxTierJump: number;
}

/** 스마트 라우팅 전체 설정 */
export interface SmartRoutingConfig {
  /** 기능 활성화 여부 */
  enabled: boolean;
  /** 티어별 모델 매핑 */
  tiers: Record<ModelTier, TierModelConfig>;
  /** 스코어링 가중치 */
  weights: ScoringWeights;
  /** 라우팅 임계값 */
  thresholds: RoutingThresholds;
  /** 2단계 승격 설정 */
  promotion: PromotionConfig;
  /** 디버그 로그 활성화 */
  debug: boolean;
}

// ─── Event Logging ───────────────────────────────────────────

/** 라우팅 이벤트 기록 */
export interface RoutingEvent {
  /** 발생 시각 (Unix ms) */
  timestamp: number;
  /** 세션 ID */
  sessionId?: string;
  /** 입력 미리보기 (첫 200자) */
  inputPreview: string;
  /** 라우팅 결정 */
  decision: RoutingDecision;
  /** 신뢰도 평가 (승격 시도 시) */
  confidence?: ConfidenceAssessment;
  /** 승격된 새 결정 (승격 발생 시) */
  promotedDecision?: RoutingDecision;
}

/** 통계 요약 */
export interface RoutingStats {
  /** 총 라우팅 횟수 */
  total: number;
  /** 티어별 횟수 */
  byTier: Record<ModelTier, number>;
  /** 총 승격 횟수 */
  promotions: number;
  /** 평균 정규화 점수 */
  avgScore: number;
}
