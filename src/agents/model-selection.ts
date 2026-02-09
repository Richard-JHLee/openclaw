import type { OpenClawConfig } from "../config/config.js";
import type { ModelCatalogEntry } from "./model-catalog.js";
import { resolveAgentModelPrimary } from "./agent-scope.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "./defaults.js";
import { normalizeGoogleModelId } from "./models-config.providers.js";
import { SmartModelRouter, type SmartRoutingConfig, type RoutingDecision } from "../model-routing/index.js";
import { resolveEnvApiKey, getCustomProviderApiKey } from "./model-auth.js";

export type ModelRef = {
  provider: string;
  model: string;
};

export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type ModelAliasIndex = {
  byAlias: Map<string, { alias: string; ref: ModelRef }>;
  byKey: Map<string, string[]>;
};

const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  "opus-4.6": "claude-opus-4-6",
  "opus-4.5": "claude-opus-4-5",
  "sonnet-4.5": "claude-sonnet-4-5",
};

function normalizeAliasKey(value: string): string {
  return value.trim().toLowerCase();
}

export function modelKey(provider: string, model: string) {
  return `${provider}/${model}`;
}

export function normalizeProviderId(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") {
    return "zai";
  }
  if (normalized === "opencode-zen") {
    return "opencode";
  }
  if (normalized === "qwen") {
    return "qwen-portal";
  }
  if (normalized === "kimi-code") {
    return "kimi-coding";
  }
  return normalized;
}

export function isCliProvider(provider: string, cfg?: OpenClawConfig): boolean {
  const normalized = normalizeProviderId(provider);
  if (normalized === "claude-cli") {
    return true;
  }
  if (normalized === "codex-cli") {
    return true;
  }
  const backends = cfg?.agents?.defaults?.cliBackends ?? {};
  return Object.keys(backends).some((key) => normalizeProviderId(key) === normalized);
}

function normalizeAnthropicModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  return ANTHROPIC_MODEL_ALIASES[lower] ?? trimmed;
}

function normalizeProviderModelId(provider: string, model: string): string {
  if (provider === "anthropic") {
    return normalizeAnthropicModelId(model);
  }
  if (provider === "google") {
    return normalizeGoogleModelId(model);
  }
  return model;
}

export function parseModelRef(raw: string, defaultProvider: string): ModelRef | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    const provider = normalizeProviderId(defaultProvider);
    const model = normalizeProviderModelId(provider, trimmed);
    return { provider, model };
  }
  const providerRaw = trimmed.slice(0, slash).trim();
  const provider = normalizeProviderId(providerRaw);
  const model = trimmed.slice(slash + 1).trim();
  if (!provider || !model) {
    return null;
  }
  const normalizedModel = normalizeProviderModelId(provider, model);
  return { provider, model: normalizedModel };
}

export function resolveAllowlistModelKey(raw: string, defaultProvider: string): string | null {
  const parsed = parseModelRef(raw, defaultProvider);
  if (!parsed) {
    return null;
  }
  return modelKey(parsed.provider, parsed.model);
}

export function buildConfiguredAllowlistKeys(params: {
  cfg: OpenClawConfig | undefined;
  defaultProvider: string;
}): Set<string> | null {
  const rawAllowlist = Object.keys(params.cfg?.agents?.defaults?.models ?? {});
  if (rawAllowlist.length === 0) {
    return null;
  }

  const keys = new Set<string>();
  for (const raw of rawAllowlist) {
    const key = resolveAllowlistModelKey(String(raw ?? ""), params.defaultProvider);
    if (key) {
      keys.add(key);
    }
  }
  return keys.size > 0 ? keys : null;
}

export function buildModelAliasIndex(params: {
  cfg: OpenClawConfig;
  defaultProvider: string;
}): ModelAliasIndex {
  const byAlias = new Map<string, { alias: string; ref: ModelRef }>();
  const byKey = new Map<string, string[]>();

  const rawModels = params.cfg.agents?.defaults?.models ?? {};
  for (const [keyRaw, entryRaw] of Object.entries(rawModels)) {
    const parsed = parseModelRef(String(keyRaw ?? ""), params.defaultProvider);
    if (!parsed) {
      continue;
    }
    const alias = String((entryRaw as { alias?: string } | undefined)?.alias ?? "").trim();
    if (!alias) {
      continue;
    }
    const aliasKey = normalizeAliasKey(alias);
    byAlias.set(aliasKey, { alias, ref: parsed });
    const key = modelKey(parsed.provider, parsed.model);
    const existing = byKey.get(key) ?? [];
    existing.push(alias);
    byKey.set(key, existing);
  }

  return { byAlias, byKey };
}

export function resolveModelRefFromString(params: {
  raw: string;
  defaultProvider: string;
  aliasIndex?: ModelAliasIndex;
}): { ref: ModelRef; alias?: string } | null {
  const trimmed = params.raw.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.includes("/")) {
    const aliasKey = normalizeAliasKey(trimmed);
    const aliasMatch = params.aliasIndex?.byAlias.get(aliasKey);
    if (aliasMatch) {
      return { ref: aliasMatch.ref, alias: aliasMatch.alias };
    }
  }
  const parsed = parseModelRef(trimmed, params.defaultProvider);
  if (!parsed) {
    return null;
  }
  return { ref: parsed };
}

export function resolveConfiguredModelRef(params: {
  cfg: OpenClawConfig;
  defaultProvider: string;
  defaultModel: string;
}): ModelRef {
  const rawModel = (() => {
    const raw = params.cfg.agents?.defaults?.model as { primary?: string } | string | undefined;
    if (typeof raw === "string") {
      return raw.trim();
    }
    return raw?.primary?.trim() ?? "";
  })();
  if (rawModel) {
    const trimmed = rawModel.trim();
    const aliasIndex = buildModelAliasIndex({
      cfg: params.cfg,
      defaultProvider: params.defaultProvider,
    });
    if (!trimmed.includes("/")) {
      const aliasKey = normalizeAliasKey(trimmed);
      const aliasMatch = aliasIndex.byAlias.get(aliasKey);
      if (aliasMatch) {
        return aliasMatch.ref;
      }

      // Default to anthropic if no provider is specified, but warn as this is deprecated.
      console.warn(
        `[openclaw] Model "${trimmed}" specified without provider. Falling back to "anthropic/${trimmed}". Please use "anthropic/${trimmed}" in your config.`,
      );
      return { provider: "anthropic", model: trimmed };
    }

    const resolved = resolveModelRefFromString({
      raw: trimmed,
      defaultProvider: params.defaultProvider,
      aliasIndex,
    });
    if (resolved) {
      return resolved.ref;
    }
  }
  return { provider: params.defaultProvider, model: params.defaultModel };
}

export function resolveDefaultModelForAgent(params: {
  cfg: OpenClawConfig;
  agentId?: string;
  input?: string;
  hasAttachments?: boolean;
  sessionId?: string;
}): ModelRef {
  // SmartModelRouter 자동 적용: input이 제공되고 활성화되어 있으면 사용
  if (params.input?.trim()) {
    const smartDecision = resolveSmartModelRef({
      input: params.input,
      cfg: params.cfg,
      hasAttachments: params.hasAttachments,
      sessionId: params.sessionId,
    });

    if (smartDecision) {
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
      // → 기존 설정 모델로 폴백 (아래 로직 실행)
    }
  }

  // SmartModelRouter 비활성화 또는 input 없음 또는 API 키 없음 → 기존 로직 사용
  const agentModelOverride = params.agentId
    ? resolveAgentModelPrimary(params.cfg, params.agentId)
    : undefined;
  const cfg =
    agentModelOverride && agentModelOverride.length > 0
      ? {
        ...params.cfg,
        agents: {
          ...params.cfg.agents,
          defaults: {
            ...params.cfg.agents?.defaults,
            model: {
              ...(typeof params.cfg.agents?.defaults?.model === "object"
                ? params.cfg.agents.defaults.model
                : undefined),
              primary: agentModelOverride,
            },
          },
        },
      }
      : params.cfg;
  return resolveConfiguredModelRef({
    cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
}

export function buildAllowedModelSet(params: {
  cfg: OpenClawConfig;
  catalog: ModelCatalogEntry[];
  defaultProvider: string;
  defaultModel?: string;
}): {
  allowAny: boolean;
  allowedCatalog: ModelCatalogEntry[];
  allowedKeys: Set<string>;
} {
  const rawAllowlist = (() => {
    const modelMap = params.cfg.agents?.defaults?.models ?? {};
    return Object.keys(modelMap);
  })();
  const allowAny = rawAllowlist.length === 0;
  const defaultModel = params.defaultModel?.trim();
  const defaultKey =
    defaultModel && params.defaultProvider
      ? modelKey(params.defaultProvider, defaultModel)
      : undefined;
  const catalogKeys = new Set(params.catalog.map((entry) => modelKey(entry.provider, entry.id)));

  if (allowAny) {
    if (defaultKey) {
      catalogKeys.add(defaultKey);
    }
    return {
      allowAny: true,
      allowedCatalog: params.catalog,
      allowedKeys: catalogKeys,
    };
  }

  const allowedKeys = new Set<string>();
  const configuredProviders = (params.cfg.models?.providers ?? {}) as Record<string, unknown>;
  for (const raw of rawAllowlist) {
    const parsed = parseModelRef(String(raw), params.defaultProvider);
    if (!parsed) {
      continue;
    }
    const key = modelKey(parsed.provider, parsed.model);
    const providerKey = normalizeProviderId(parsed.provider);
    if (isCliProvider(parsed.provider, params.cfg)) {
      allowedKeys.add(key);
    } else if (catalogKeys.has(key)) {
      allowedKeys.add(key);
    } else if (configuredProviders[providerKey] != null) {
      // Explicitly configured providers should be allowlist-able even when
      // they don't exist in the curated model catalog.
      allowedKeys.add(key);
    }
  }

  if (defaultKey) {
    allowedKeys.add(defaultKey);
  }

  const allowedCatalog = params.catalog.filter((entry) =>
    allowedKeys.has(modelKey(entry.provider, entry.id)),
  );

  if (allowedCatalog.length === 0 && allowedKeys.size === 0) {
    if (defaultKey) {
      catalogKeys.add(defaultKey);
    }
    return {
      allowAny: true,
      allowedCatalog: params.catalog,
      allowedKeys: catalogKeys,
    };
  }

  return { allowAny: false, allowedCatalog, allowedKeys };
}

export type ModelRefStatus = {
  key: string;
  inCatalog: boolean;
  allowAny: boolean;
  allowed: boolean;
};

export function getModelRefStatus(params: {
  cfg: OpenClawConfig;
  catalog: ModelCatalogEntry[];
  ref: ModelRef;
  defaultProvider: string;
  defaultModel?: string;
}): ModelRefStatus {
  const allowed = buildAllowedModelSet({
    cfg: params.cfg,
    catalog: params.catalog,
    defaultProvider: params.defaultProvider,
    defaultModel: params.defaultModel,
  });
  const key = modelKey(params.ref.provider, params.ref.model);
  return {
    key,
    inCatalog: params.catalog.some((entry) => modelKey(entry.provider, entry.id) === key),
    allowAny: allowed.allowAny,
    allowed: allowed.allowAny || allowed.allowedKeys.has(key),
  };
}

export function resolveAllowedModelRef(params: {
  cfg: OpenClawConfig;
  catalog: ModelCatalogEntry[];
  raw: string;
  defaultProvider: string;
  defaultModel?: string;
}):
  | { ref: ModelRef; key: string }
  | {
    error: string;
  } {
  const trimmed = params.raw.trim();
  if (!trimmed) {
    return { error: "invalid model: empty" };
  }

  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: params.defaultProvider,
  });
  const resolved = resolveModelRefFromString({
    raw: trimmed,
    defaultProvider: params.defaultProvider,
    aliasIndex,
  });
  if (!resolved) {
    return { error: `invalid model: ${trimmed}` };
  }

  const status = getModelRefStatus({
    cfg: params.cfg,
    catalog: params.catalog,
    ref: resolved.ref,
    defaultProvider: params.defaultProvider,
    defaultModel: params.defaultModel,
  });
  if (!status.allowed) {
    return { error: `model not allowed: ${status.key}` };
  }

  return { ref: resolved.ref, key: status.key };
}

export function resolveThinkingDefault(params: {
  cfg: OpenClawConfig;
  provider: string;
  model: string;
  catalog?: ModelCatalogEntry[];
}): ThinkLevel {
  const configured = params.cfg.agents?.defaults?.thinkingDefault;
  if (configured) {
    return configured;
  }
  const candidate = params.catalog?.find(
    (entry) => entry.provider === params.provider && entry.id === params.model,
  );
  if (candidate?.reasoning) {
    return "low";
  }
  return "off";
}

/**
 * Resolve the model configured for Gmail hook processing.
 * Returns null if hooks.gmail.model is not set.
 */
export function resolveHooksGmailModel(params: {
  cfg: OpenClawConfig;
  defaultProvider: string;
}): ModelRef | null {
  const hooksModel = params.cfg.hooks?.gmail?.model;
  if (!hooksModel?.trim()) {
    return null;
  }

  const aliasIndex = buildModelAliasIndex({
    cfg: params.cfg,
    defaultProvider: params.defaultProvider,
  });

  const resolved = resolveModelRefFromString({
    raw: hooksModel,
    defaultProvider: params.defaultProvider,
    aliasIndex,
  });

  return resolved?.ref ?? null;
}

// ─── SmartModelRouter Integration ────────────────────────────

/**
 * 싱글톤 SmartModelRouter 인스턴스
 */
let _smartRouter: SmartModelRouter | null = null;

/**
 * OpenClaw 설정에서 SmartModelRouter 설정 구성
 */
function buildSmartRoutingConfig(cfg: OpenClawConfig | undefined): Partial<SmartRoutingConfig> | undefined {
  const routingConfig = (cfg?.agents?.defaults as any)?.smartRouting;
  if (!routingConfig) {
    return undefined;
  }
  return routingConfig;
}

/**
 * SmartModelRouter 싱글톤 인스턴스 초기화 또는 반환
 *
 * @param cfg OpenClaw 설정 객체
 * @returns SmartModelRouter 인스턴스
 */
export function initSmartRouter(cfg?: OpenClawConfig): SmartModelRouter {
  if (!_smartRouter) {
    const routingConfig = buildSmartRoutingConfig(cfg);
    _smartRouter = new SmartModelRouter(routingConfig);
  }
  return _smartRouter;
}

/**
 * SmartModelRouter 인스턴스 리셋 (테스트용)
 */
export function resetSmartModelRouter(): void {
  _smartRouter = null;
}

/**
 * 입력 텍스트 복잡도 분석 후 최적 모델 선택
 *
 * @param input 사용자 입력 텍스트
 * @param params 옵션 - cfg (OpenClaw 설정), hasAttachments (첨부파일 유무), sessionId (세션 ID)
 * @returns RoutingDecision 또는 null (스마트 라우팅 비활성화 시)
 *
 * @example
 * ```ts
 * const decision = resolveSmartModelRef({
 *   input: "복잡한 알고리즘 분석해줘",
 *   cfg: openClawConfig,
 *   hasAttachments: false
 * });
 * if (decision) {
 *   console.log(decision.model);    // "anthropic/claude-opus-4-6"
 *   console.log(decision.tier);     // "premium"
 *   console.log(decision.reason);   // "점수 78/100 | 코드 +25pt | ..."
 * }
 * ```
 */
export function resolveSmartModelRef(params: {
  input: string;
  cfg?: OpenClawConfig;
  hasAttachments?: boolean;
  sessionId?: string;
}): RoutingDecision | null {
  const router = initSmartRouter(params.cfg);

  // 스마트 라우팅 비활성화 시 null 반환
  if (!router.enabled) {
    return null;
  }

  return router.route(params.input, params.hasAttachments ?? false, params.sessionId);
}

/**
 * 모델 응답 신뢰도 평가 및 자동 승격 처리
 *
 * @param decision 원래 라우팅 결정 (route()의 반환값)
 * @param response 모델 응답 텍스트
 * @param cfg OpenClaw 설정
 * @param sessionId 세션 ID
 * @returns { promoted: boolean, newDecision?: RoutingDecision, confidence: ConfidenceAssessment }
 *
 * @example
 * ```ts
 * const decision = resolveSmartModelRef({ input: "...", cfg });
 * const response = await callModel(decision.model, "...");
 *
 * const check = checkAndPromoteSmartModel(decision, response, cfg);
 * if (check.promoted) {
 *   console.log(`승격: ${decision.tier} → ${check.newDecision.tier}`);
 *   const betterResponse = await callModel(check.newDecision.model, "...");
 * }
 * ```
 */
export function checkAndPromoteSmartModel(
  decision: RoutingDecision,
  response: string,
  cfg?: OpenClawConfig,
  sessionId?: string
): {
  promoted: boolean;
  newDecision?: RoutingDecision;
  confidence: any;
} {
  const router = initSmartRouter(cfg);
  return router.checkAndPromote(decision, response, sessionId);
}

/**
 * 스마트 라우팅 통계 조회
 *
 * @param cfg OpenClaw 설정
 * @returns 라우팅 통계 { total, byTier, promotions, avgScore }
 *
 * @example
 * ```ts
 * const stats = getSmartRoutingStats(cfg);
 * console.log(`총 라우팅: ${stats.total}, 승격: ${stats.promotions}`);
 * console.log(`Cheap: ${stats.byTier.cheap}, Mid: ${stats.byTier.mid}, Premium: ${stats.byTier.premium}`);
 * ```
 */
export function getSmartRoutingStats(cfg?: OpenClawConfig): any {
  const router = initSmartRouter(cfg);
  return router.getStats();
}
