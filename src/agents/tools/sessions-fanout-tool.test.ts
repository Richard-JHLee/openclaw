import { describe, expect, it, vi } from "vitest";

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
        tools: { agentToAgent: { enabled: true, allow: ["*"] } },
      }) as never,
  };
});

import { createSessionsFanoutTool } from "./sessions-fanout-tool.js";

describe("sessions_fanout", () => {
  it("dispatches, waits, and collects replies", async () => {
    callGatewayMock.mockReset();

    const runReplies = new Map<string, string>();
    let runCounter = 0;

    callGatewayMock.mockImplementation(async (opts: unknown) => {
      const req = opts as { method?: string; params?: Record<string, unknown> };
      if (req.method === "sessions.resolve") {
        const key =
          (req.params?.key as string | undefined) ??
          (req.params?.sessionId as string | undefined) ??
          "";
        // echo key back as canonical
        return { key };
      }
      if (req.method === "agent") {
        runCounter += 1;
        const runId = `run-${runCounter}`;
        const msg = String(req.params?.message ?? "");
        runReplies.set(runId, `reply:${msg}`);
        return { runId };
      }
      if (req.method === "agent.wait") {
        return { status: "ok" };
      }
      if (req.method === "chat.history") {
        // Provide last waited reply; for this test it's enough to return some assistant text.
        // The tool reads only the last message.
        const sessionKey = String(req.params?.sessionKey ?? "");
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: `ok:${sessionKey}` }],
            },
          ],
        };
      }
      return {};
    });

    const tool = createSessionsFanoutTool({
      agentSessionKey: "agent:app-service-dev-ceo:main",
      agentChannel: "telegram",
    });

    const result = await tool.execute("call1", {
      requests: [
        { agentId: "app-service-dev-pm", message: "pm" },
        { agentId: "app-service-dev-dev", message: "dev" },
        { agentId: "app-service-dev-qa", message: "qa" },
      ],
      timeoutSeconds: 1,
    });

    const details = result.details as {
      status?: string;
      okCount?: number;
      results?: Array<{ agentId: string; status: string; reply?: string; sessionKey: string }>;
    };

    expect(details.status).toBeDefined();
    expect(details.okCount).toBe(3);
    expect(details.results?.length).toBe(3);

    const byAgent = new Map(details.results?.map((r) => [r.agentId, r]));
    expect(byAgent.get("app-service-dev-pm")?.status).toBe("ok");
    expect(byAgent.get("app-service-dev-dev")?.status).toBe("ok");
    expect(byAgent.get("app-service-dev-qa")?.status).toBe("ok");
  });
});
