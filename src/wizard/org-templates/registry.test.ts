import { describe, expect, it } from "vitest";
import {
  ORG_DOMAIN_TEMPLATES,
  ORG_ROLE_TEMPLATES,
  getOrgDomainTemplate,
  getOrgRoleTemplate,
} from "./registry.js";

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

describe("org templates registry", () => {
  it("exports unique role ids", () => {
    const ids = ORG_ROLE_TEMPLATES.map((r) => r.id);
    expect(unique(ids)).toHaveLength(ids.length);
  });

  it("exports unique domain template ids", () => {
    const ids = ORG_DOMAIN_TEMPLATES.map((t) => t.id);
    expect(unique(ids)).toHaveLength(ids.length);
  });

  it("contains the expected built-in domains", () => {
    const ids = ORG_DOMAIN_TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        "accounting",
        "app-service-dev",
        "ecommerce",
        "education",
        "hr",
        "image-creative",
        "legal",
        "marketing",
        "medical",
        "real-estate",
      ].sort(),
    );
  });

  it("lookups work for a few known ids", () => {
    expect(getOrgRoleTemplate("ceo").label).toBe("CEO");
    expect(getOrgDomainTemplate("legal").label).toBe("Legal");
  });
});
