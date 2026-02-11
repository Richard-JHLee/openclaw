import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome } from "./test-helpers.js";

describe("multi-agent agentDir validation", () => {
  it("rejects shared agents.list agentDir", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const shared = path.join(tmpdir(), "openclaw-shared-agentdir");
    const res = validateConfigObject({
      agents: {
        list: [
          { id: "a", agentDir: shared },
          { id: "b", agentDir: shared },
        ],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues.some((i) => i.path === "agents.list")).toBe(true);
      expect(res.issues[0]?.message).toContain("Duplicate agentDir");
    }
  });

  it("throws on shared agentDir during loadConfig()", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".openclaw");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "openclaw.json"),
        JSON.stringify(
          {
            agents: {
              list: [
                { id: "a", agentDir: "~/.openclaw/agents/shared/agent" },
                { id: "b", agentDir: "~/.openclaw/agents/shared/agent" },
              ],
            },
            bindings: [{ agentId: "a", match: { channel: "telegram" } }],
          },
          null,
          2,
        ),
        "utf-8",
      );

      vi.resetModules();
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const { loadConfig } = await import("./config.js");
      expect(() => loadConfig()).toThrow(/duplicate agentDir/i);
      expect(spy.mock.calls.flat().join(" ")).toMatch(/Duplicate agentDir/i);
      spy.mockRestore();
    });
  });

  it("detects duplicates after agentDir path normalization", async () => {
    vi.resetModules();
    const { validateConfigObject } = await import("./config.js");
    const base = path.join(tmpdir(), "openclaw-agentdir-normalize");
    const normalized = path.join(base, "shared", "agent");
    const withDotSegments = path.join(base, "team-a", "..", "shared", "agent", ".");

    const res = validateConfigObject({
      agents: {
        list: [
          { id: "ceo", agentDir: normalized },
          { id: "cto", agentDir: `${withDotSegments}/` },
        ],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.message).toContain("Duplicate agentDir");
    }
  });

  it("returns duplicate detection deterministically across re-runs", async () => {
    vi.resetModules();
    const { findDuplicateAgentDirs } = await import("./agent-dirs.js");
    const shared = path.join(tmpdir(), "openclaw-shared-idempotent", "agent");
    const cfg = {
      agents: {
        list: [
          { id: "b", agentDir: shared },
          { id: "a", agentDir: `${shared}/` },
        ],
      },
      bindings: [{ agentId: "a", match: { channel: "cli", accountId: "*" } }],
    };

    const first = findDuplicateAgentDirs(cfg);
    const second = findDuplicateAgentDirs(cfg);
    expect(first).toEqual(second);
    expect(first[0]?.agentIds).toEqual(["a", "b"]);
  });
});
