import { Type } from "@sinclair/typebox";
import crypto from "node:crypto";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import type { AnyAgentTool } from "./common.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  resolveAgentIdFromSessionKey,
} from "../../routing/session-key.js";
import { SESSION_LABEL_MAX_LENGTH } from "../../sessions/session-label.js";
import { INTERNAL_MESSAGE_CHANNEL } from "../../utils/message-channel.js";
import { AGENT_LANE_NESTED } from "../lanes.js";
import { jsonResult, readStringParam } from "./common.js";
import {
  createAgentToAgentPolicy,
  extractAssistantText,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
  resolveSessionReference,
  stripToolMessages,
} from "./sessions-helpers.js";
import { buildAgentToAgentMessageContext } from "./sessions-send-helpers.js";

const SessionsFanoutRequestSchema = Type.Object({
  agentId: Type.String({ minLength: 1, maxLength: 64 }),
  message: Type.String(),
  // Optional: kept for UX parity with sessions_send.
  label: Type.Optional(Type.String({ minLength: 1, maxLength: SESSION_LABEL_MAX_LENGTH })),
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
});

const SessionsFanoutToolSchema = Type.Object({
  requests: Type.Array(SessionsFanoutRequestSchema, { minItems: 1, maxItems: 10 }),
  timeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
  // If true, return after dispatch (no waits / no replies).
  fireAndForget: Type.Optional(Type.Boolean()),
});

type FanoutStatus = "ok" | "accepted" | "timeout" | "error" | "forbidden";

type FanoutResultRow = {
  agentId: string;
  sessionKey: string;
  runId?: string;
  status: FanoutStatus;
  reply?: string;
  error?: string;
};

type PlannedRequest = {
  agentId: string;
  rawSessionKey: string;
  message: string;
  timeoutSeconds: number;
};

type DispatchedRequest = {
  agentId: string;
  sessionKey: string;
  displayKey: string;
  runId: string;
  timeoutSeconds: number;
};

function coerceTimeoutSeconds(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  return fallback;
}

function pickOverallStatus(
  rows: FanoutResultRow[],
): "ok" | "partial" | "forbidden" | "timeout" | "error" {
  const ok = rows.filter((r) => r.status === "ok").length;
  const forbidden = rows.filter((r) => r.status === "forbidden").length;
  const timeout = rows.filter((r) => r.status === "timeout").length;
  const error = rows.filter((r) => r.status === "error").length;
  const accepted = rows.filter((r) => r.status === "accepted").length;

  if (ok > 0 && forbidden === 0 && timeout === 0 && error === 0 && accepted === 0) {
    return "ok";
  }
  if (ok > 0) {
    return "partial";
  }
  if (forbidden > 0 && ok === 0) {
    return "forbidden";
  }
  if (timeout > 0 && ok === 0) {
    return "timeout";
  }
  return "error";
}

function scoreStatus(status: FanoutStatus): number {
  switch (status) {
    case "ok":
      return 5;
    case "accepted":
      return 4;
    case "timeout":
      return 3;
    case "error":
      return 2;
    case "forbidden":
      return 1;
    default:
      return 0;
  }
}

export function createSessionsFanoutTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  sandboxed?: boolean;
}): AnyAgentTool {
  return {
    label: "Session Fan-out",
    name: "sessions_fanout",
    description:
      "Send messages to multiple agent sessions (fan-out), wait for replies, and return the collected results.",
    parameters: SessionsFanoutToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const cfg = loadConfig();
      const { mainKey, alias } = resolveMainSessionAlias(cfg);

      const visibility = cfg.agents?.defaults?.sandbox?.sessionToolsVisibility ?? "spawned";
      const requesterInternalKey =
        typeof opts?.agentSessionKey === "string" && opts.agentSessionKey.trim()
          ? resolveInternalSessionKey({
              key: opts.agentSessionKey,
              alias,
              mainKey,
            })
          : undefined;

      const restrictToSpawned =
        opts?.sandboxed === true &&
        visibility === "spawned" &&
        !!requesterInternalKey &&
        !isSubagentSessionKey(requesterInternalKey);

      if (restrictToSpawned) {
        // Match sessions_send: sandboxed sessions tools are limited; fan-out is too powerful.
        return jsonResult({
          runId: crypto.randomUUID(),
          status: "forbidden",
          error: "Sandboxed sessions_fanout is limited to spawned sessions",
        });
      }

      const a2aPolicy = createAgentToAgentPolicy(cfg);

      const requestsRaw = params.requests;
      if (!Array.isArray(requestsRaw) || requestsRaw.length === 0) {
        return jsonResult({
          runId: crypto.randomUUID(),
          status: "error",
          error: "requests is required",
        });
      }

      const defaultTimeoutSeconds = coerceTimeoutSeconds(params.timeoutSeconds, 30);
      const fireAndForget = params.fireAndForget === true;

      const requesterAgentId = requesterInternalKey
        ? resolveAgentIdFromSessionKey(requesterInternalKey)
        : "unknown";

      const planned: PlannedRequest[] = [];
      for (const raw of requestsRaw) {
        if (!raw || typeof raw !== "object") {
          continue;
        }
        const agentIdRaw = readStringParam(raw as Record<string, unknown>, "agentId", {
          required: true,
          label: "agentId",
        });
        const message = readStringParam(raw as Record<string, unknown>, "message", {
          required: true,
          label: "message",
        });
        const agentId = normalizeAgentId(agentIdRaw);
        const rawSessionKey = `agent:${agentId}:main`;
        const timeoutSeconds = coerceTimeoutSeconds(
          (raw as { timeoutSeconds?: unknown }).timeoutSeconds,
          defaultTimeoutSeconds,
        );
        planned.push({ agentId, rawSessionKey, message, timeoutSeconds });
      }

      if (planned.length === 0) {
        return jsonResult({
          runId: crypto.randomUUID(),
          status: "error",
          error: "No valid requests provided",
        });
      }

      // Global policy check: if we have any cross-agent targets, A2A must be enabled.
      const hasCrossAgent = planned.some((p) => p.agentId !== requesterAgentId);
      if (hasCrossAgent && !a2aPolicy.enabled) {
        return jsonResult({
          runId: crypto.randomUUID(),
          status: "forbidden",
          error:
            "Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent sends.",
        });
      }

      // Collect best row per agent.
      const byAgent = new Map<string, FanoutResultRow>();
      const upsert = (row: FanoutResultRow) => {
        const existing = byAgent.get(row.agentId);
        if (!existing || scoreStatus(row.status) > scoreStatus(existing.status)) {
          byAgent.set(row.agentId, row);
        }
      };

      // Per-agent allowlist enforcement.
      for (const p of planned) {
        if (p.agentId === requesterAgentId) {
          continue;
        }
        if (!a2aPolicy.isAllowed(requesterAgentId, p.agentId)) {
          upsert({
            agentId: p.agentId,
            sessionKey: p.rawSessionKey,
            status: "forbidden",
            error: "Agent-to-agent messaging denied by tools.agentToAgent.allow.",
          });
        }
      }

      const dispatches: DispatchedRequest[] = [];
      for (const p of planned) {
        const denied = byAgent.get(p.agentId);
        if (denied?.status === "forbidden") {
          continue;
        }

        const resolved = await resolveSessionReference({
          sessionKey: p.rawSessionKey,
          alias,
          mainKey,
          requesterInternalKey,
          restrictToSpawned: false,
        });
        if (!resolved.ok) {
          upsert({
            agentId: p.agentId,
            sessionKey: p.rawSessionKey,
            status: resolved.status,
            error: resolved.error,
          });
          continue;
        }

        const agentMessageContext = buildAgentToAgentMessageContext({
          requesterSessionKey: opts?.agentSessionKey,
          requesterChannel: opts?.agentChannel,
          targetSessionKey: resolved.displayKey,
        });

        try {
          const response = await callGateway<{ runId: string }>({
            method: "agent",
            params: {
              message: p.message,
              sessionKey: resolved.key,
              idempotencyKey: crypto.randomUUID(),
              deliver: false,
              channel: INTERNAL_MESSAGE_CHANNEL,
              lane: AGENT_LANE_NESTED,
              extraSystemPrompt: agentMessageContext,
            },
            timeoutMs: 10_000,
          });
          const runId = typeof response?.runId === "string" ? response.runId.trim() : "";
          if (!runId) {
            upsert({
              agentId: p.agentId,
              sessionKey: resolved.displayKey,
              status: "error",
              error: "Missing runId from gateway",
            });
            continue;
          }

          dispatches.push({
            agentId: p.agentId,
            sessionKey: resolved.key,
            displayKey: resolved.displayKey,
            runId,
            timeoutSeconds: p.timeoutSeconds,
          });

          if (fireAndForget) {
            upsert({
              agentId: p.agentId,
              sessionKey: resolved.displayKey,
              runId,
              status: "accepted",
            });
          }
        } catch (err) {
          const messageText = err instanceof Error ? err.message : String(err);
          upsert({
            agentId: p.agentId,
            sessionKey: p.rawSessionKey,
            status: "error",
            error: messageText,
          });
        }
      }

      if (fireAndForget) {
        const results = Array.from(byAgent.values());
        return jsonResult({
          runId: crypto.randomUUID(),
          status: pickOverallStatus(results),
          results,
        });
      }

      await Promise.all(
        dispatches.map(async (d) => {
          const timeoutMs = d.timeoutSeconds * 1000;
          try {
            const wait = await callGateway<{ status?: string; error?: string }>({
              method: "agent.wait",
              params: { runId: d.runId, timeoutMs },
              timeoutMs: timeoutMs + 2000,
            });
            const status = typeof wait?.status === "string" ? wait.status : "ok";
            if (status === "timeout") {
              upsert({
                agentId: d.agentId,
                sessionKey: d.displayKey,
                runId: d.runId,
                status: "timeout",
                error: typeof wait?.error === "string" ? wait.error : undefined,
              });
              return;
            }
            if (status === "error") {
              upsert({
                agentId: d.agentId,
                sessionKey: d.displayKey,
                runId: d.runId,
                status: "error",
                error: typeof wait?.error === "string" ? wait.error : "agent error",
              });
              return;
            }
          } catch (err) {
            const messageText = err instanceof Error ? err.message : String(err);
            upsert({
              agentId: d.agentId,
              sessionKey: d.displayKey,
              runId: d.runId,
              status: messageText.includes("gateway timeout") ? "timeout" : "error",
              error: messageText,
            });
            return;
          }

          try {
            const history = await callGateway<{ messages: Array<unknown> }>({
              method: "chat.history",
              params: { sessionKey: d.sessionKey, limit: 50 },
              timeoutMs: 10_000,
            });
            const filtered = stripToolMessages(
              Array.isArray(history?.messages) ? history.messages : [],
            );
            const last = filtered.length > 0 ? filtered[filtered.length - 1] : undefined;
            const reply = last ? extractAssistantText(last) : undefined;
            upsert({
              agentId: d.agentId,
              sessionKey: d.displayKey,
              runId: d.runId,
              status: "ok",
              reply,
            });
          } catch (err) {
            const messageText = err instanceof Error ? err.message : String(err);
            upsert({
              agentId: d.agentId,
              sessionKey: d.displayKey,
              runId: d.runId,
              status: "error",
              error: messageText,
            });
          }
        }),
      );

      const results = Array.from(byAgent.values());
      return jsonResult({
        runId: crypto.randomUUID(),
        status: pickOverallStatus(results),
        okCount: results.filter((r) => r.status === "ok").length,
        results,
      });
    },
  };
}
