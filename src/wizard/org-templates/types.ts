export type OrgRoleTemplate = {
  /**
   * Stable machine id, suitable for `agentId` generation.
   * Example: "ceo", "dev", "qa".
   */
  id: string;
  /** Human-friendly display label. */
  label: string;
  /**
   * Short description for UI hints (e.g. onboarding select list).
   * Keep it concise and generally applicable across domains.
   */
  description: string;
  /** Responsibilities expressed as short bullet-like strings. */
  responsibilities: string[];
  /** Optional: common artifacts the role produces. */
  defaultDeliverables?: string[];
};

export type OrgDomainTemplateRoleSpec = {
  /** References a role from the global role registry. */
  roleId: string;
  /**
   * Optional per-domain override for display label, e.g. "Clinician" for medical.
   * Overrides only affect presentation; the stable `roleId` remains unchanged.
   */
  labelOverride?: string;
  /** Optional per-domain additions/overrides for responsibilities. */
  responsibilitiesOverride?: string[];
};

export type OrgDomainTemplate = {
  /** Stable machine id (slug). */
  id: string;
  /** Human-friendly display name. */
  label: string;
  /** Short description for onboarding hints. */
  description: string;
  /** Recommended roles for this domain template. */
  roles: OrgDomainTemplateRoleSpec[];
};
