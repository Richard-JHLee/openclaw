import type { OpenClawConfig } from "../../config/config.js";
import type { AgentBinding, AgentConfig } from "../../config/types.agents.js";
import type { ToolsConfig } from "../../config/types.tools.js";
import path from "node:path";
import type { OrgDomainTemplateRoleSpec } from "./types.js";
import { getOrgDomainTemplate, getOrgRoleTemplate, type OrgDomainTemplateId } from "./registry.js";

export type OrgTemplateConfigMergePolicy = "keep" | "modify";

export type OrgTemplateConfigSpec = {
  agents: AgentConfig[];
  bindings: AgentBinding[];
  tools: Pick<ToolsConfig, "agentToAgent">;
  agentIds: string[];
};

export type OrgTemplateTelegramPeerRoute = {
  agentId: string;
  peer: {
    kind: "dm" | "group";
    id: string;
  };
  accountId?: string;
};

function uniqueStable(values: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function toAgentId(domainTemplateId: OrgDomainTemplateId, roleId: string): string {
  return `${domainTemplateId}-${roleId}`;
}

function buildRoleLabel(spec: OrgDomainTemplateRoleSpec): string {
  return spec.labelOverride?.trim() || getOrgRoleTemplate(spec.roleId).label;
}

function buildTemplateAgents(params: {
  domainTemplateId: OrgDomainTemplateId;
  orgRootDir: string;
}): AgentConfig[] {
  const domain = getOrgDomainTemplate(params.domainTemplateId);
  return domain.roles.map((roleSpec, idx) => {
    const roleTemplate = getOrgRoleTemplate(roleSpec.roleId);
    const agentId = toAgentId(params.domainTemplateId, roleTemplate.id);
    return {
      id: agentId,
      default: idx === 0,
      name: buildRoleLabel(roleSpec),
      workspace: path.join(params.orgRootDir, agentId, "workspace"),
      agentDir: path.join(params.orgRootDir, agentId, ".openclaw", "agent"),
    };
  });
}

function buildTemplateBindings(defaultAgentId: string): AgentBinding[] {
  return [
    { agentId: defaultAgentId, match: { channel: "cli", accountId: "*" } },
    { agentId: defaultAgentId, match: { channel: "webchat", accountId: "*" } },
  ];
}

function mergeAgents(existing: AgentConfig[] | undefined, generated: AgentConfig[]): AgentConfig[] {
  const existingList = Array.isArray(existing) ? existing : [];
  const existingById = new Map(
    existingList
      .filter((entry): entry is AgentConfig => Boolean(entry?.id?.trim()))
      .map((entry) => [entry.id, entry] as const),
  );
  const generatedIds = new Set(generated.map((entry) => entry.id));

  const mergedGenerated = generated.map((generatedEntry) => {
    const existingEntry = existingById.get(generatedEntry.id);
    return existingEntry ? { ...existingEntry, ...generatedEntry } : generatedEntry;
  });

  const existingUnmanaged = existingList.filter((entry) => !generatedIds.has(entry.id));
  return [...mergedGenerated, ...existingUnmanaged];
}

function mergeBindings(
  existing: AgentBinding[] | undefined,
  generated: AgentBinding[],
): AgentBinding[] {
  const existingList = Array.isArray(existing) ? existing : [];
  const generatedSimpleChannels = new Set(
    generated
      .filter((binding) => !binding.match.peer && !binding.match.guildId && !binding.match.teamId)
      .map((binding) => `${binding.match.channel}:${binding.match.accountId ?? ""}`),
  );
  const existingUnmanaged = existingList.filter((binding) => {
    const isSimple =
      !binding.match?.peer &&
      !binding.match?.guildId &&
      !binding.match?.teamId &&
      binding.match?.channel;
    if (!isSimple) {
      return true;
    }
    const key = `${binding.match.channel}:${binding.match.accountId ?? ""}`;
    return !generatedSimpleChannels.has(key);
  });
  return [...generated, ...existingUnmanaged];
}

function telegramPeerBindingKey(binding: AgentBinding): string | null {
  if (binding.match.channel !== "telegram") {
    return null;
  }
  const kind = binding.match.peer?.kind;
  const peerId = binding.match.peer?.id?.trim();
  if ((kind !== "dm" && kind !== "group") || !peerId) {
    return null;
  }
  const accountId = binding.match.accountId?.trim() || "__default__";
  return `${accountId}:${kind}:${peerId}`;
}

function buildTelegramPeerBinding(route: OrgTemplateTelegramPeerRoute): AgentBinding | null {
  const agentId = route.agentId.trim();
  const peerId = route.peer.id.trim();
  if (!agentId || !peerId) {
    return null;
  }
  const kind = route.peer.kind;
  if (kind !== "dm" && kind !== "group") {
    return null;
  }
  const accountId = route.accountId?.trim();
  return {
    agentId,
    match: {
      channel: "telegram",
      ...(accountId ? { accountId } : {}),
      peer: { kind, id: peerId },
    },
  };
}

export function mergeOrgTemplateTelegramPeerBindings(
  existing: AgentBinding[] | undefined,
  routes: ReadonlyArray<OrgTemplateTelegramPeerRoute>,
): AgentBinding[] {
  const existingList = Array.isArray(existing) ? existing : [];
  const incoming = routes
    .map((route) => buildTelegramPeerBinding(route))
    .filter((binding): binding is AgentBinding => Boolean(binding));
  if (incoming.length === 0) {
    return existingList;
  }

  // Last write wins for duplicate entries in the same onboarding run.
  const incomingByKey = new Map<string, AgentBinding>();
  for (const binding of incoming) {
    const key = telegramPeerBindingKey(binding);
    if (!key) {
      continue;
    }
    incomingByKey.set(key, binding);
  }
  if (incomingByKey.size === 0) {
    return existingList;
  }

  const replacedKeys = new Set<string>();
  const merged: AgentBinding[] = [];
  for (const binding of existingList) {
    const key = telegramPeerBindingKey(binding);
    if (!key || !incomingByKey.has(key)) {
      merged.push(binding);
      continue;
    }
    if (replacedKeys.has(key)) {
      continue;
    }
    const replacement = incomingByKey.get(key);
    if (replacement) {
      merged.push(replacement);
      replacedKeys.add(key);
    }
    incomingByKey.delete(key);
  }

  for (const binding of incomingByKey.values()) {
    merged.push(binding);
  }
  return merged;
}

export function buildOrgTemplateConfigSpec(params: {
  domainTemplateId: OrgDomainTemplateId;
  orgRootDir: string;
}): OrgTemplateConfigSpec {
  const agents = buildTemplateAgents(params);
  const defaultAgentId = agents.find((entry) => entry.default)?.id ?? agents[0]?.id ?? "main";
  const bindings = buildTemplateBindings(defaultAgentId);
  const agentIds = uniqueStable(agents.map((entry) => entry.id));

  return {
    agents,
    bindings,
    tools: {
      agentToAgent: {
        enabled: true,
        allow: agentIds,
      },
    },
    agentIds,
  };
}

export function applyOrgTemplateConfig(params: {
  baseConfig: OpenClawConfig;
  domainTemplateId: OrgDomainTemplateId;
  orgRootDir: string;
  policy: OrgTemplateConfigMergePolicy;
}): OpenClawConfig {
  if (params.policy === "keep") {
    return params.baseConfig;
  }

  const spec = buildOrgTemplateConfigSpec({
    domainTemplateId: params.domainTemplateId,
    orgRootDir: params.orgRootDir,
  });

  const existingAllow = params.baseConfig.tools?.agentToAgent?.allow ?? [];
  const mergedAllow = uniqueStable([...spec.agentIds, ...existingAllow]);

  return {
    ...params.baseConfig,
    agents: {
      ...params.baseConfig.agents,
      list: mergeAgents(params.baseConfig.agents?.list, spec.agents),
    },
    bindings: mergeBindings(params.baseConfig.bindings, spec.bindings),
    tools: {
      ...params.baseConfig.tools,
      agentToAgent: {
        ...params.baseConfig.tools?.agentToAgent,
        ...spec.tools.agentToAgent,
        allow: mergedAllow,
      },
    },
  };
}
