import { describe, expect, it, vi } from "vitest";
import type { ConnectParams, RequestFrame } from "./protocol/index.js";
import type { GatewayClient, GatewayRequestContext, RespondFn } from "./server-methods/types.js";

vi.mock("../infra/system-presence.js", () => ({
  listSystemPresence: () => [],
  updateSystemPresence: () => ({ key: "k", next: { text: "x", ts: Date.now() }, changedKeys: [] }),
}));

const { handleGatewayRequest } = await import("./server-methods.js");

function makeClient(scopes: string[], role: "operator" | "node" = "operator"): GatewayClient {
  return {
    connect: {
      role,
      scopes,
      client: {
        id: "test-client",
        version: "1.0.0",
        platform: "test",
        mode: "test",
      },
    } as ConnectParams,
  };
}

function makeReq(method: string): RequestFrame {
  return {
    type: "req",
    id: "req-1",
    method,
    params: {},
  };
}

describe("gateway method authorization", () => {
  it("rejects config.apply without operator.admin scope", async () => {
    const respond = vi.fn<Parameters<RespondFn>, ReturnType<RespondFn>>();

    await handleGatewayRequest({
      req: makeReq("config.apply"),
      client: makeClient(["operator.write"]),
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
    });

    expect(respond).toHaveBeenCalledTimes(1);
    const [, , error] = respond.mock.calls[0] ?? [];
    expect(error?.message ?? "").toContain("missing scope: operator.admin");
  });

  it("allows config.apply with operator.admin scope", async () => {
    const respond = vi.fn<Parameters<RespondFn>, ReturnType<RespondFn>>();
    const handler = vi.fn(async ({ respond: send }: { respond: RespondFn }) => {
      send(true, { ok: true }, undefined);
    });

    await handleGatewayRequest({
      req: makeReq("config.apply"),
      client: makeClient(["operator.admin"]),
      isWebchatConnect: () => false,
      respond,
      context: {} as GatewayRequestContext,
      extraHandlers: { "config.apply": handler },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
  });
});
