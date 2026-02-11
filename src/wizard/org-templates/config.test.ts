import path from "node:path";
import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../../config/config.js";
import {
  applyOrgTemplateConfig,
  buildOrgTemplateConfigSpec,
  mergeOrgTemplateTelegramPeerBindings,
} from "./config.js";

describe("org template config generation", () => {
  it("builds template agents, bindings, and agent-to-agent allowlist", () => {
    const orgRootDir = path.join("/tmp", "openclaw-org", "app-service-dev");
    const spec = buildOrgTemplateConfigSpec({
      domainTemplateId: "app-service-dev",
      orgRootDir,
    });

    expect(spec.agents.length).toBeGreaterThan(0);
    expect(spec.agents[0]?.default).toBe(true);
    expect(spec.bindings).toEqual([
      { agentId: "app-service-dev-ceo", match: { channel: "cli", accountId: "*" } },
      { agentId: "app-service-dev-ceo", match: { channel: "webchat", accountId: "*" } },
    ]);
    expect(spec.tools.agentToAgent).toEqual({
      enabled: true,
      allow: spec.agentIds,
    });
    expect(spec.agents.map((entry) => entry.id)).toContain("app-service-dev-cto");
    expect(spec.agents.map((entry) => entry.id)).toContain("app-service-dev-designer");
    const generatedAgentDirs = spec.agents.map((entry) => entry.agentDir);
    expect(new Set(generatedAgentDirs).size).toBe(generatedAgentDirs.length);
    expect(spec.agents.every((entry) => entry.workspace?.startsWith(orgRootDir))).toBe(true);
    expect(spec.agents.every((entry) => entry.agentDir?.startsWith(orgRootDir))).toBe(true);
  });

  it("keeps existing config untouched when policy=keep", () => {
    const baseConfig: OpenClawConfig = {
      agents: {
        list: [{ id: "main", default: true, workspace: "/existing/workspace" }],
      },
      bindings: [{ agentId: "main", match: { channel: "telegram", accountId: "work" } }],
      tools: {
        agentToAgent: {
          enabled: false,
          allow: ["main"],
        },
      },
    };

    const next = applyOrgTemplateConfig({
      baseConfig,
      domainTemplateId: "legal",
      orgRootDir: "/tmp/openclaw-org/legal",
      policy: "keep",
    });

    expect(next).toEqual(baseConfig);
  });

  it("merges generated config while preserving unmanaged entries", () => {
    const baseConfig: OpenClawConfig = {
      agents: {
        list: [
          { id: "legal-ceo", model: "openai/gpt-5.2" },
          { id: "custom-analyst", default: true, workspace: "/custom/workspace" },
        ],
      },
      bindings: [
        { agentId: "custom-analyst", match: { channel: "telegram", accountId: "work" } },
        { agentId: "old-main", match: { channel: "cli", accountId: "*" } },
      ],
      tools: {
        agentToAgent: {
          enabled: false,
          allow: ["custom-analyst"],
        },
      },
    };

    const next = applyOrgTemplateConfig({
      baseConfig,
      domainTemplateId: "legal",
      orgRootDir: "/tmp/openclaw-org/legal",
      policy: "modify",
    });

    expect(next.agents?.list?.[0]?.id).toBe("legal-ceo");
    expect(next.agents?.list?.[0]?.workspace).toBe("/tmp/openclaw-org/legal/legal-ceo/workspace");
    expect(next.agents?.list?.[0]?.model).toBe("openai/gpt-5.2");
    expect(next.agents?.list?.some((entry) => entry.id === "custom-analyst")).toBe(true);
    expect(next.bindings).toEqual(
      expect.arrayContaining([
        { agentId: "legal-ceo", match: { channel: "cli", accountId: "*" } },
        { agentId: "legal-ceo", match: { channel: "webchat", accountId: "*" } },
        { agentId: "custom-analyst", match: { channel: "telegram", accountId: "work" } },
      ]),
    );
    expect(next.tools?.agentToAgent).toEqual({
      enabled: true,
      allow: expect.arrayContaining(["custom-analyst", "legal-ceo", "legal-pm"]),
    });
  });

  it("merges telegram peer bindings by replacing conflicts and appending new rules", () => {
    const existing = [
      {
        agentId: "app-service-dev-ceo",
        match: {
          channel: "telegram",
          accountId: "default",
          peer: { kind: "dm" as const, id: "111" },
        },
      },
      {
        agentId: "app-service-dev-ceo",
        match: {
          channel: "telegram",
          accountId: "default",
          peer: { kind: "group" as const, id: "-100200" },
        },
      },
      { agentId: "main", match: { channel: "cli", accountId: "*" } },
    ];

    const merged = mergeOrgTemplateTelegramPeerBindings(existing, [
      {
        agentId: "app-service-dev-dev",
        accountId: "default",
        peer: { kind: "dm", id: "111" },
      },
      {
        agentId: "app-service-dev-qa",
        accountId: "default",
        peer: { kind: "group", id: "-100999:topic:99" },
      },
    ]);

    expect(merged).toEqual(
      expect.arrayContaining([
        {
          agentId: "app-service-dev-dev",
          match: {
            channel: "telegram",
            accountId: "default",
            peer: { kind: "dm", id: "111" },
          },
        },
        {
          agentId: "app-service-dev-ceo",
          match: {
            channel: "telegram",
            accountId: "default",
            peer: { kind: "group", id: "-100200" },
          },
        },
        {
          agentId: "app-service-dev-qa",
          match: {
            channel: "telegram",
            accountId: "default",
            peer: { kind: "group", id: "-100999:topic:99" },
          },
        },
        { agentId: "main", match: { channel: "cli", accountId: "*" } },
      ]),
    );
    expect(
      merged.filter(
        (entry) =>
          entry.match.channel === "telegram" &&
          entry.match.peer?.kind === "dm" &&
          entry.match.peer?.id === "111",
      ),
    ).toHaveLength(1);
  });
});
