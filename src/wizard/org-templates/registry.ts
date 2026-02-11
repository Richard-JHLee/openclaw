import type { OrgDomainTemplate, OrgDomainTemplateRoleSpec, OrgRoleTemplate } from "./types.js";

const baseRoles = [
  {
    id: "ceo",
    label: "CEO",
    description: "Owns priorities, approves scope, resolves conflicts.",
    responsibilities: [
      "Define success criteria and scope boundaries",
      "Prioritize work and unblock the team",
      "Review outputs for correctness and risk",
    ],
    defaultDeliverables: ["Weekly status", "Decision log", "High-level plan"],
  },
  {
    id: "cto",
    label: "CTO",
    description: "Defines technical direction and guardrails.",
    responsibilities: [
      "Choose architecture and technical strategy",
      "Review security, reliability, and maintainability",
      "Set engineering standards and tooling constraints",
    ],
    defaultDeliverables: ["Architecture notes", "Tech constraints", "Risk assessment"],
  },
  {
    id: "pm",
    label: "PM",
    description: "Turns goals into requirements and plans.",
    responsibilities: [
      "Write PRD and acceptance criteria",
      "Coordinate timelines and stakeholder updates",
      "Keep scope focused and measurable",
    ],
    defaultDeliverables: ["PRD", "User stories", "Acceptance criteria"],
  },
  {
    id: "dev",
    label: "Developer",
    description: "Implements and ships working software changes.",
    responsibilities: [
      "Design and implement features",
      "Write and maintain tests",
      "Fix bugs and improve performance",
    ],
    defaultDeliverables: ["Implementation plan", "PR-ready code", "Test plan"],
  },
  {
    id: "designer",
    label: "Designer",
    description: "Designs user flows, UI, and content structure.",
    responsibilities: [
      "Define user journeys and information architecture",
      "Produce UI mocks and interaction notes",
      "Ensure accessibility and clarity",
    ],
    defaultDeliverables: ["Wireframes", "UI spec", "Copy suggestions"],
  },
  {
    id: "qa",
    label: "QA",
    description: "Validates quality, catches regressions, and tests edge cases.",
    responsibilities: [
      "Create test cases and verify acceptance criteria",
      "Reproduce issues and report clear bug details",
      "Run regression checks on critical paths",
    ],
    defaultDeliverables: ["Test cases", "Bug reports", "Release checklist"],
  },
  {
    id: "domain-expert",
    label: "Domain Expert",
    description: "Provides subject-matter expertise and correctness checks.",
    responsibilities: [
      "Clarify domain terminology and constraints",
      "Validate outputs for domain correctness",
      "Flag compliance and risk considerations",
    ],
    defaultDeliverables: ["Domain notes", "Terminology glossary", "Compliance checklist"],
  },
] as const satisfies readonly OrgRoleTemplate[];

export const ORG_ROLE_TEMPLATES: ReadonlyArray<OrgRoleTemplate> = baseRoles;

export type OrgRoleId = (typeof baseRoles)[number]["id"];

export function getOrgRoleTemplate(roleId: OrgRoleId): OrgRoleTemplate {
  const role = ORG_ROLE_TEMPLATES.find((r) => r.id === roleId);
  if (!role) {
    throw new Error(`org-templates: unknown roleId: ${roleId}`);
  }
  return role;
}

function role(
  roleId: OrgRoleId,
  opts?: Omit<OrgDomainTemplateRoleSpec, "roleId">,
): OrgDomainTemplateRoleSpec {
  return { roleId, ...opts };
}

const domainTemplates = [
  {
    id: "legal",
    label: "Legal",
    description: "Legal research, drafting, and case/workflow support.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Case Manager / PM" }),
      role("dev"),
      role("qa"),
      role("domain-expert", { labelOverride: "Attorney / Legal Expert" }),
    ],
  },
  {
    id: "medical",
    label: "Medical",
    description: "Clinical documentation support and healthcare workflows.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Clinic Ops / PM" }),
      role("dev"),
      role("qa"),
      role("domain-expert", { labelOverride: "Clinician / Medical Expert" }),
    ],
  },
  {
    id: "real-estate",
    label: "Real Estate",
    description: "Listings, client coordination, and deal workflows.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Agent Ops / PM" }),
      role("dev"),
      role("designer"),
      role("qa"),
      role("domain-expert", { labelOverride: "Realtor / Domain Expert" }),
    ],
  },
  {
    id: "accounting",
    label: "Accounting",
    description: "Bookkeeping support, reporting, and process automation.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Finance Ops / PM" }),
      role("dev"),
      role("qa"),
      role("domain-expert", { labelOverride: "Accountant / Finance Expert" }),
    ],
  },
  {
    id: "ecommerce",
    label: "E-commerce",
    description: "Store ops, catalog, customer support workflows, and growth tasks.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Growth / PM" }),
      role("dev"),
      role("designer"),
      role("qa"),
      role("domain-expert", { labelOverride: "E-commerce Operator" }),
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    description: "Campaign planning, content, and analytics workflows.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Campaign PM" }),
      role("designer", { labelOverride: "Creative / Designer" }),
      role("qa", { labelOverride: "QA (Brand/Copy)" }),
      role("domain-expert", { labelOverride: "Marketer / Strategist" }),
    ],
  },
  {
    id: "education",
    label: "Education",
    description: "Curriculum content, tutoring workflows, and admin support.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Program Manager / PM" }),
      role("dev"),
      role("designer", { labelOverride: "Learning Designer" }),
      role("qa"),
      role("domain-expert", { labelOverride: "Educator / Subject Expert" }),
    ],
  },
  {
    id: "hr",
    label: "HR",
    description: "Hiring workflows, policy docs, and people-ops support.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "People Ops / PM" }),
      role("dev"),
      role("qa"),
      role("domain-expert", { labelOverride: "HR Specialist" }),
    ],
  },
  {
    id: "app-service-dev",
    label: "App/Service Development",
    description: "Product engineering for web/mobile apps and services.",
    roles: [role("ceo"), role("cto"), role("pm"), role("dev"), role("designer"), role("qa")],
  },
  {
    id: "image-creative",
    label: "Image & Creative",
    description: "Visual content creation, branding, and creative production workflows.",
    roles: [
      role("ceo"),
      role("pm", { labelOverride: "Producer / PM" }),
      role("designer", { labelOverride: "Creative Director / Designer" }),
      role("qa", { labelOverride: "QA (Brand/Style)" }),
      role("domain-expert", { labelOverride: "Creative Specialist" }),
    ],
  },
] as const satisfies readonly OrgDomainTemplate[];

export const ORG_DOMAIN_TEMPLATES: ReadonlyArray<OrgDomainTemplate> = domainTemplates;

export type OrgDomainTemplateId = (typeof domainTemplates)[number]["id"];

export function listOrgDomainTemplates(): ReadonlyArray<OrgDomainTemplate> {
  return ORG_DOMAIN_TEMPLATES;
}

export function getOrgDomainTemplate(templateId: OrgDomainTemplateId): OrgDomainTemplate {
  const tmpl = ORG_DOMAIN_TEMPLATES.find((t) => t.id === templateId);
  if (!tmpl) {
    throw new Error(`org-templates: unknown domain template id: ${templateId}`);
  }
  return tmpl;
}
