import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import { runOnboardingWizard } from "./onboarding.js";

const setupChannels = vi.hoisted(() => vi.fn(async (cfg) => cfg));
const setupSkills = vi.hoisted(() => vi.fn(async (cfg) => cfg));
const healthCommand = vi.hoisted(() => vi.fn(async () => {}));
const ensureWorkspaceAndSessions = vi.hoisted(() => vi.fn(async () => {}));
const seedOrgTemplateFilesystem = vi.hoisted(() => vi.fn(async () => {}));
const writeConfigFile = vi.hoisted(() => vi.fn(async () => {}));
const readConfigFileSnapshot = vi.hoisted(() =>
  vi.fn(async () => ({ exists: false, valid: true, config: {} })),
);
const ensureSystemdUserLingerInteractive = vi.hoisted(() => vi.fn(async () => {}));
const isSystemdUserServiceAvailable = vi.hoisted(() => vi.fn(async () => true));
const ensureControlUiAssetsBuilt = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
const runTui = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../commands/onboard-channels.js", () => ({
  setupChannels,
}));

vi.mock("../commands/onboard-skills.js", () => ({
  setupSkills,
}));

vi.mock("../commands/health.js", () => ({
  healthCommand,
}));

vi.mock("../config/config.js", async (importActual) => {
  const actual = await importActual<typeof import("../config/config.js")>();
  return {
    ...actual,
    readConfigFileSnapshot,
    writeConfigFile,
  };
});

vi.mock("../commands/onboard-helpers.js", async (importActual) => {
  const actual = await importActual<typeof import("../commands/onboard-helpers.js")>();
  return {
    ...actual,
    ensureWorkspaceAndSessions,
    detectBrowserOpenSupport: vi.fn(async () => ({ ok: false })),
    openUrl: vi.fn(async () => true),
    printWizardHeader: vi.fn(),
    probeGatewayReachable: vi.fn(async () => ({ ok: true })),
    resolveControlUiLinks: vi.fn(() => ({
      httpUrl: "http://127.0.0.1:18789",
      wsUrl: "ws://127.0.0.1:18789",
    })),
  };
});

vi.mock("./org-templates/filesystem.js", () => ({
  seedOrgTemplateFilesystem,
}));

vi.mock("../commands/systemd-linger.js", () => ({
  ensureSystemdUserLingerInteractive,
}));

vi.mock("../daemon/systemd.js", () => ({
  isSystemdUserServiceAvailable,
}));

vi.mock("../infra/control-ui-assets.js", () => ({
  ensureControlUiAssetsBuilt,
}));

vi.mock("../tui/tui.js", () => ({
  runTui,
}));

describe("runOnboardingWizard", () => {
  it("exits when config is invalid", async () => {
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.openclaw/openclaw.json",
      exists: true,
      raw: "{}",
      parsed: {},
      valid: false,
      config: {},
      issues: [{ path: "routing.allowFrom", message: "Legacy key" }],
      legacyIssues: [{ path: "routing.allowFrom", message: "Legacy key" }],
    });

    const select: WizardPrompter["select"] = vi.fn(async (opts) =>
      opts.message === "Organization template (domain)" ? "app-service-dev" : "quickstart",
    );
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await expect(
      runOnboardingWizard(
        {
          acceptRisk: true,
          flow: "quickstart",
          authChoice: "skip",
          installDaemon: false,
          skipProviders: true,
          skipSkills: true,
          skipHealth: true,
          skipUi: true,
        },
        runtime,
        prompter,
      ),
    ).rejects.toThrow("exit:1");

    expect(select).not.toHaveBeenCalled();
    expect(prompter.outro).toHaveBeenCalled();
  });

  it("skips prompts and setup steps when flags are set", async () => {
    const select: WizardPrompter["select"] = vi.fn(async (opts) =>
      opts.message === "Organization template (domain)" ? "app-service-dev" : "quickstart",
    );
    const multiselect: WizardPrompter["multiselect"] = vi.fn(async () => []);
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect,
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(select).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Organization template (domain)" }),
    );
    expect(setupChannels).not.toHaveBeenCalled();
    expect(setupSkills).not.toHaveBeenCalled();
    expect(healthCommand).not.toHaveBeenCalled();
    expect(runTui).not.toHaveBeenCalled();
  });

  it("launches TUI without auto-delivery when hatching", async () => {
    runTui.mockClear();

    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-onboard-"));
    await fs.writeFile(path.join(workspaceDir, DEFAULT_BOOTSTRAP_FILENAME), "{}");

    const select: WizardPrompter["select"] = vi.fn(async (opts) => {
      if (opts.message === "How do you want to hatch your bot?") {
        return "tui";
      }
      if (opts.message === "Organization template (domain)") {
        return "app-service-dev";
      }
      return "quickstart";
    });

    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        workspace: workspaceDir,
        authChoice: "skip",
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        installDaemon: false,
      },
      runtime,
      prompter,
    );

    expect(runTui).toHaveBeenCalledWith(
      expect.objectContaining({
        deliver: false,
        message: "Wake up, my friend!",
      }),
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("offers TUI hatch even without BOOTSTRAP.md", async () => {
    runTui.mockClear();

    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-onboard-"));

    const select: WizardPrompter["select"] = vi.fn(async (opts) => {
      if (opts.message === "How do you want to hatch your bot?") {
        return "tui";
      }
      if (opts.message === "Organization template (domain)") {
        return "app-service-dev";
      }
      return "quickstart";
    });

    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text: vi.fn(async () => ""),
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        mode: "local",
        workspace: workspaceDir,
        authChoice: "skip",
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        installDaemon: false,
      },
      runtime,
      prompter,
    );

    expect(runTui).toHaveBeenCalledWith(
      expect.objectContaining({
        deliver: false,
        message: undefined,
      }),
    );

    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  it("applies selected org template and seeds filesystem in modify flow", async () => {
    seedOrgTemplateFilesystem.mockClear();
    writeConfigFile.mockClear();
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.openclaw/openclaw.json",
      exists: true,
      raw: "{}",
      parsed: {},
      valid: true,
      config: {},
      issues: [],
      legacyIssues: [],
    });

    const select: WizardPrompter["select"] = vi.fn(async (opts) => {
      if (opts.message === "Config handling") {
        return "modify";
      }
      if (opts.message === "Organization template (domain)") {
        return "legal";
      }
      return "quickstart";
    });
    const text: WizardPrompter["text"] = vi.fn(async (opts) =>
      opts.message === "Organization root directory (orgRoot)" ? "/tmp/openclaw-org/legal" : "",
    );
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text,
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(seedOrgTemplateFilesystem).toHaveBeenCalledWith(
      expect.objectContaining({
        domainTemplateId: "legal",
        orgRootDir: "/tmp/openclaw-org/legal",
      }),
    );

    const writes = writeConfigFile.mock.calls.map(
      ([cfg]) => cfg as { agents?: { list?: { id?: string }[] } },
    );
    expect(writes.some((cfg) => cfg.agents?.list?.some((agent) => agent.id === "legal-ceo"))).toBe(
      true,
    );
  });

  it("skips org filesystem seeding when existing config is kept", async () => {
    seedOrgTemplateFilesystem.mockClear();
    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.openclaw/openclaw.json",
      exists: true,
      raw: "{}",
      parsed: {},
      valid: true,
      config: {
        agents: {
          list: [{ id: "main", default: true, workspace: "/existing/workspace" }],
        },
      },
      issues: [],
      legacyIssues: [],
    });

    const select: WizardPrompter["select"] = vi.fn(async (opts) => {
      if (opts.message === "Config handling") {
        return "keep";
      }
      if (opts.message === "Organization template (domain)") {
        return "app-service-dev";
      }
      return "quickstart";
    });
    const text: WizardPrompter["text"] = vi.fn(async (opts) =>
      opts.message === "Organization root directory (orgRoot)"
        ? "/tmp/openclaw-org/app-service-dev"
        : "",
    );
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text,
      confirm: vi.fn(async () => false),
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        authChoice: "skip",
        installDaemon: false,
        skipProviders: true,
        skipSkills: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    expect(seedOrgTemplateFilesystem).not.toHaveBeenCalled();
  });

  it("adds Telegram peer routing bindings for org template agents", async () => {
    writeConfigFile.mockClear();
    setupChannels.mockImplementationOnce(async (cfg, _runtime, _prompter, options) => {
      options?.onSelection?.(["telegram"]);
      options?.onAccountId?.("telegram", "default");
      return cfg;
    });

    readConfigFileSnapshot.mockResolvedValueOnce({
      path: "/tmp/.openclaw/openclaw.json",
      exists: true,
      raw: "{}",
      parsed: {},
      valid: true,
      config: {},
      issues: [],
      legacyIssues: [],
    });

    const select: WizardPrompter["select"] = vi.fn(async (opts) => {
      if (opts.message === "Config handling") {
        return "modify";
      }
      if (opts.message === "Organization template (domain)") {
        return "app-service-dev";
      }
      if (opts.message === "Telegram routing target type") {
        return "dm";
      }
      if (opts.message === "Route this Telegram target to agent") {
        return "app-service-dev-dev";
      }
      return "quickstart";
    });
    const text: WizardPrompter["text"] = vi.fn(async (opts) => {
      if (opts.message === "Organization root directory (orgRoot)") {
        return "/tmp/openclaw-org/app-service-dev";
      }
      if (opts.message.startsWith("Telegram user id")) {
        return "123456789";
      }
      return "";
    });
    const confirm: WizardPrompter["confirm"] = vi.fn(async (opts) => {
      if (opts.message === "Configure Telegram routing for team agents now?") {
        return true;
      }
      if (opts.message === "Add another Telegram routing rule?") {
        return false;
      }
      return false;
    });
    const prompter: WizardPrompter = {
      intro: vi.fn(async () => {}),
      outro: vi.fn(async () => {}),
      note: vi.fn(async () => {}),
      select,
      multiselect: vi.fn(async () => []),
      text,
      confirm,
      progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
    };

    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn((code: number) => {
        throw new Error(`exit:${code}`);
      }),
    };

    await runOnboardingWizard(
      {
        acceptRisk: true,
        flow: "quickstart",
        authChoice: "skip",
        installDaemon: false,
        skipSkills: true,
        skipHealth: true,
        skipUi: true,
      },
      runtime,
      prompter,
    );

    const writes = writeConfigFile.mock.calls.map(([cfg]) => cfg as { bindings?: unknown[] });
    expect(
      writes.some((cfg) =>
        cfg.bindings?.some(
          (binding) =>
            (
              binding as {
                agentId?: string;
                match?: {
                  channel?: string;
                  accountId?: string;
                  peer?: { kind?: string; id?: string };
                };
              }
            ).agentId === "app-service-dev-dev" &&
            (
              binding as {
                match?: {
                  channel?: string;
                  accountId?: string;
                  peer?: { kind?: string; id?: string };
                };
              }
            ).match?.channel === "telegram" &&
            (binding as { match?: { accountId?: string; peer?: { kind?: string; id?: string } } })
              .match?.accountId === "default" &&
            (binding as { match?: { peer?: { kind?: string; id?: string } } }).match?.peer?.kind ===
              "dm" &&
            (binding as { match?: { peer?: { id?: string } } }).match?.peer?.id === "123456789",
        ),
      ),
    ).toBe(true);
  });

  it("shows the web search hint at the end of onboarding", async () => {
    const prevBraveKey = process.env.BRAVE_API_KEY;
    delete process.env.BRAVE_API_KEY;

    try {
      const note: WizardPrompter["note"] = vi.fn(async () => {});
      const prompter: WizardPrompter = {
        intro: vi.fn(async () => {}),
        outro: vi.fn(async () => {}),
        note,
        select: vi.fn(async (opts) =>
          opts.message === "Organization template (domain)" ? "app-service-dev" : "quickstart",
        ),
        multiselect: vi.fn(async () => []),
        text: vi.fn(async () => ""),
        confirm: vi.fn(async () => false),
        progress: vi.fn(() => ({ update: vi.fn(), stop: vi.fn() })),
      };

      const runtime: RuntimeEnv = {
        log: vi.fn(),
        error: vi.fn(),
        exit: vi.fn(),
      };

      await runOnboardingWizard(
        {
          acceptRisk: true,
          flow: "quickstart",
          authChoice: "skip",
          installDaemon: false,
          skipProviders: true,
          skipSkills: true,
          skipHealth: true,
          skipUi: true,
        },
        runtime,
        prompter,
      );

      const calls = (note as unknown as { mock: { calls: unknown[][] } }).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.some((call) => call?.[1] === "Web search (optional)")).toBe(true);
    } finally {
      if (prevBraveKey === undefined) {
        delete process.env.BRAVE_API_KEY;
      } else {
        process.env.BRAVE_API_KEY = prevBraveKey;
      }
    }
  });
});
