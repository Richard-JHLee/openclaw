import fs from "node:fs/promises";
import path from "node:path";
import type { RuntimeEnv } from "../../runtime.js";
import type { OrgDomainTemplateRoleSpec } from "./types.js";
import { buildOrgTemplateConfigSpec } from "./config.js";
import { getOrgDomainTemplate, getOrgRoleTemplate, type OrgDomainTemplateId } from "./registry.js";

async function writeFileIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.writeFile(filePath, content, {
      encoding: "utf-8",
      flag: "wx",
    });
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code !== "EEXIST") {
      throw err;
    }
  }
}

function buildRoleLabel(roleSpec: OrgDomainTemplateRoleSpec): string {
  return roleSpec.labelOverride?.trim() || getOrgRoleTemplate(roleSpec.roleId).label;
}

function buildRoleResponsibilities(roleSpec: OrgDomainTemplateRoleSpec): string[] {
  const override =
    roleSpec.responsibilitiesOverride?.map((item) => item.trim()).filter(Boolean) ?? [];
  if (override.length > 0) {
    return override;
  }
  return getOrgRoleTemplate(roleSpec.roleId).responsibilities;
}

function renderRoleAgentsDoc(params: {
  domainTemplateId: OrgDomainTemplateId;
  roleSpec: OrgDomainTemplateRoleSpec;
  roleLabel: string;
}): string {
  const roleTemplate = getOrgRoleTemplate(params.roleSpec.roleId);
  const responsibilities = buildRoleResponsibilities(params.roleSpec)
    .map((item) => `- ${item}`)
    .join("\n");
  const deliverables =
    roleTemplate.defaultDeliverables && roleTemplate.defaultDeliverables.length > 0
      ? roleTemplate.defaultDeliverables.map((item) => `- ${item}`).join("\n")
      : "- Provide concise updates and artifacts relevant to your role.";
  const roleScope = [
    `- Identity: You are the **${params.roleLabel}** for this organization.`,
    "- Stay in role and answer from this role's perspective.",
    "- Prioritize outputs that match your role responsibilities and deliverables.",
    "- If a request is outside your role scope, state the boundary and hand off clearly.",
    "- Do not answer with generic disclaimers like 'I am only a digital assistant'.",
  ].join("\n");

  const opsSection =
    roleTemplate.id === "ceo"
      ? [
          "## Operating model (Telegram single inbox)",
          "You are the **single front door** for Telegram DM conversations for this team.",
          "",
          "- You own the **final user-facing answer**.",
          "- Specialists (PM/Dev/QA/etc) produce internal deliverables; you synthesize and reply.",
          "- Default to **parallel delegation** for any non-trivial request so the user gets a complete answer fast.",
          "",
          "### Parallel execution + automatic synthesis (required)",
          "When the user asks for work, run this flow in a single turn whenever possible:",
          "",
          "1) Delegate in parallel:",
          "- Send an internal request to **PM** (requirements/scope/acceptance criteria).",
          "- Send an internal request to **Developer** (implementation plan + code changes).",
          "- Send an internal request to **QA** (test plan + edge cases).",
          "",
          "2) Wait for all replies (or a clear timeout), then synthesize.",
          "",
          "3) Reply to the user once with a complete, high-confidence answer.

Implementation tip: use the `sessions_fanout` tool to request PM/Developer/QA in parallel and collect their replies in one result.",
          "",
          "Do not end your turn with 'I asked PM/Dev/QA' unless you also include their outputs or a clear reason you couldn't (e.g. tool failure).",
          "",
          "### Internal request template (send to specialists)",
          "```md",
          "# Internal request (from CEO)",
          "- Request ID:",
          "- Do now: YES (reply only after you produced your deliverable)",
          "- Context (1-3 sentences):",
          "- What I need from you:",
          "- Constraints (time/stack/compat):",
          "- Output format (bullets/table/checklist):",
          "- Deadline / urgency:",
          "```",
          "",
          "### Synthesis template (CEO -> user)",
          "```md",
          "# Final response",
          "- Summary:",
          "- Decision / recommendation:",
          "- Plan (next steps):",
          "- Implementation notes (high level):",
          "- Test plan:",
          "- Risks / mitigations:",
          "```",
          "",
        ].join("\n")
      : [
          "## Collaboration with CEO (single inbox)",
          "In this team, the **CEO** is the single user-facing inbox for Telegram DMs.",
          "",
          "- Treat CEO requests as **internal work orders**: produce role-specific deliverables, not end-user chatter.",
          "- Be explicit about assumptions, risks, and what you need to unblock.",
          "- Default to **speed**: assume reasonable defaults and produce a useful deliverable in the same turn.",
          "- Ask clarifying questions only at the end, and only if truly blocking.",
          "- If the CEO asks something outside your scope, state the boundary and suggest the right handoff.",
          "",
          "### Response format (to CEO)",
          "```md",
          "# Internal response",
          "- Summary:",
          "- Deliverable (copy/pasteable):",
          "- Risks:",
          "- Open questions for CEO:",
          "```",
          "",
        ].join("\n");

  return [
    `# ${params.roleLabel} Agent Guide`,
    "",
    `You are the **${params.roleLabel}** role for the \`${params.domainTemplateId}\` organization template.`,
    "",
    "## Role declaration",
    roleScope,
    "",
    "## Responsibilities",
    responsibilities,
    "",
    opsSection,
    "## Default deliverables",
    deliverables,
    "",
    "## Request template",
    "```md",
    "# Task Request",
    "- Request ID:",
    "- Goal:",
    "- Scope:",
    "- Constraints:",
    "- Deadline:",
    "- Inputs/Dependencies:",
    "```",
    "",
    "## Response template",
    "```md",
    "# Task Response",
    "- Request ID:",
    "- Status: complete | blocked | needs-review",
    "- Summary:",
    "- Evidence (links/files/commands):",
    "- Risks/Follow-ups:",
    "```",
    "",
  ].join("\n");
}

function renderRoleRequestTemplate(params: { roleLabel: string; agentId: string }): string {
  return [
    `# ${params.roleLabel} Request/Response Template`,
    "",
    "## Request",
    "- From:",
    `- To: ${params.agentId}`,
    "- Goal:",
    "- Constraints:",
    "- Expected output format:",
    "",
    "## Response",
    "- Result:",
    "- Artifacts:",
    "- Open questions:",
    "- Next action owner:",
    "",
  ].join("\n");
}

export async function seedOrgTemplateFilesystem(params: {
  domainTemplateId: OrgDomainTemplateId;
  orgRootDir: string;
  runtime?: RuntimeEnv;
}): Promise<void> {
  const orgRootDir = params.orgRootDir.trim();
  if (!orgRootDir) {
    return;
  }

  const spec = buildOrgTemplateConfigSpec({
    domainTemplateId: params.domainTemplateId,
    orgRootDir,
  });
  const domain = getOrgDomainTemplate(params.domainTemplateId);

  await fs.mkdir(orgRootDir, { recursive: true });

  const sharedDir = path.join(orgRootDir, "shared");
  const sharedTemplatesDir = path.join(sharedDir, "templates");
  const sharedRoleTemplatesDir = path.join(sharedDir, "roles");
  await fs.mkdir(sharedTemplatesDir, { recursive: true });
  await fs.mkdir(sharedRoleTemplatesDir, { recursive: true });

  await writeFileIfMissing(
    path.join(sharedTemplatesDir, "PRD.md"),
    [
      "# Product Requirements Document (PRD)",
      "",
      "## Problem",
      "## Goals",
      "## Non-goals",
      "## User stories",
      "## Acceptance criteria",
      "## Rollout plan",
      "",
    ].join("\n"),
  );
  await writeFileIfMissing(
    path.join(sharedTemplatesDir, "ARCHITECTURE.md"),
    [
      "# Architecture Notes",
      "",
      "## Context",
      "## Proposed design",
      "## Interfaces and contracts",
      "## Risks and mitigations",
      "## Open questions",
      "",
    ].join("\n"),
  );
  await writeFileIfMissing(
    path.join(sharedTemplatesDir, "TEST_PLAN.md"),
    [
      "# Test Plan",
      "",
      "## Scope",
      "## Test matrix",
      "## Edge cases",
      "## Regression checklist",
      "## Exit criteria",
      "",
    ].join("\n"),
  );
  await writeFileIfMissing(
    path.join(sharedDir, "STATUS_BOARD.md"),
    [
      "# Status Board",
      "",
      "| Workstream | Owner | Status | Last Update | Next Step |",
      "| --- | --- | --- | --- | --- |",
      "| Example feature | CEO | planning | YYYY-MM-DD | Assign tasks to team |",
      "",
      "Legend: planning, in-progress, blocked, review, done",
      "",
    ].join("\n"),
  );

  for (const [idx, roleSpec] of domain.roles.entries()) {
    const agent = spec.agents[idx];
    if (!agent?.id) {
      continue;
    }
    const roleLabel = buildRoleLabel(roleSpec);
    const workspaceDir = agent.workspace
      ? path.resolve(agent.workspace)
      : path.join(orgRootDir, agent.id, "workspace");
    const agentDir = agent.agentDir
      ? path.resolve(agent.agentDir)
      : path.join(orgRootDir, agent.id, ".openclaw", "agent");

    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(agentDir, { recursive: true });

    await writeFileIfMissing(
      path.join(workspaceDir, "AGENTS.md"),
      renderRoleAgentsDoc({
        domainTemplateId: params.domainTemplateId,
        roleSpec,
        roleLabel,
      }),
    );
    await writeFileIfMissing(
      path.join(sharedRoleTemplatesDir, `${agent.id}.request-response.md`),
      renderRoleRequestTemplate({ roleLabel, agentId: agent.id }),
    );
  }

  params.runtime?.log(`Organization filesystem seeded: ${orgRootDir}`);
}
