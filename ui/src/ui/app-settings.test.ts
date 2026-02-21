import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Tab } from "./navigation.ts";
import { applySettingsFromUrl, setTabFromRoute } from "./app-settings.ts";

type SettingsHost = Parameters<typeof setTabFromRoute>[0] & {
  logsPollInterval: number | null;
  debugPollInterval: number | null;
};

const createHost = (tab: Tab): SettingsHost => ({
  settings: {
    gatewayUrl: "",
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  },
  theme: "system",
  themeResolved: "dark",
  applySessionKey: "main",
  sessionKey: "main",
  tab,
  connected: false,
  chatHasAutoScrolled: false,
  logsAtBottom: false,
  eventLog: [],
  eventLogBuffer: [],
  basePath: "",
  themeMedia: null,
  themeMediaHandler: null,
  logsPollInterval: null,
  debugPollInterval: null,
});

describe("setTabFromRoute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts and stops log polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "logs");
    expect(host.logsPollInterval).not.toBeNull();
    expect(host.debugPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.logsPollInterval).toBeNull();
  });

  it("starts and stops debug polling based on the tab", () => {
    const host = createHost("chat");

    setTabFromRoute(host, "debug");
    expect(host.debugPollInterval).not.toBeNull();
    expect(host.logsPollInterval).toBeNull();

    setTabFromRoute(host, "chat");
    expect(host.debugPollInterval).toBeNull();
  });
});

describe("applySettingsFromUrl", () => {
  it("stores gatewayUrl as pending and does not auto-apply", () => {
    const host = createHost("chat");
    host.settings.gatewayUrl = "ws://127.0.0.1:18789";

    window.history.replaceState(
      {},
      "",
      "https://control.local/chat?gatewayUrl=wss%3A%2F%2Fevil.example%2Fws",
    );
    applySettingsFromUrl(host);

    expect(host.pendingGatewayUrl).toBe("wss://evil.example/ws");
    expect(host.settings.gatewayUrl).toBe("ws://127.0.0.1:18789");
    expect(window.location.search).toBe("");
  });

  it("does not set pending when gatewayUrl is unchanged", () => {
    const host = createHost("chat");
    host.settings.gatewayUrl = "ws://127.0.0.1:18789";

    window.history.replaceState(
      {},
      "",
      "https://control.local/chat?gatewayUrl=ws%3A%2F%2F127.0.0.1%3A18789",
    );
    applySettingsFromUrl(host);

    expect(host.pendingGatewayUrl).toBeUndefined();
    expect(host.settings.gatewayUrl).toBe("ws://127.0.0.1:18789");
    expect(window.location.search).toBe("");
  });

  it("ignores remote gatewayUrl from query params", () => {
    const host = createHost("chat");
    host.settings.gatewayUrl = "ws://127.0.0.1:18789";

    window.history.replaceState(
      {},
      "",
      "https://control.local/chat?gatewayUrl=ws%3A%2F%2Fevil.example%3A18789",
    );
    applySettingsFromUrl(host);

    expect(host.pendingGatewayUrl).toBeUndefined();
    expect(host.settings.gatewayUrl).toBe("ws://127.0.0.1:18789");
    expect(window.location.search).toBe("");
  });
});
