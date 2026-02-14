import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGatewayMock(opts),
}));

vi.mock("../../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/config.js")>();
  return {
    ...actual,
    loadConfig: () =>
      ({
        session: { scope: "per-sender", mainKey: "main" },
        tools: { agentToAgent: { enabled: false } },
      }) as never,
  };
});

import { createSessionsFanoutTool } from "./sessions-fanout-tool.js";

describe("sessions_fanout gating", () => {
  beforeEach(() => {
    callGatewayMock.mockReset();
  });

  it("blocks cross-agent fanout when tools.agentToAgent.enabled is false", async () => {
    const tool = createSessionsFanoutTool({
      agentSessionKey: "agent:app-service-dev-ceo:main",
      agentChannel: "whatsapp",
    });

    const result = await tool.execute("call1", {
      requests: [
        { agentId: "app-service-dev-dev", message: "hi" },
        { agentId: "app-service-dev-pm", message: "hi" },
      ],
      timeoutSeconds: 0,
    });

    expect(callGatewayMock).not.toHaveBeenCalled();
    expect(result.details).toMatchObject({ status: "forbidden" });
  });
});
