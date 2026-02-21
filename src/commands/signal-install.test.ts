import { describe, expect, it } from "vitest";
import { assertAllowedDownloadUrl, isAllowedGitHubDownloadHost } from "./signal-install.js";

describe("signal-cli installer url safety", () => {
  it("allows known GitHub asset hosts", () => {
    expect(isAllowedGitHubDownloadHost("github.com")).toBe(true);
    expect(isAllowedGitHubDownloadHost("objects.githubusercontent.com")).toBe(true);
    expect(isAllowedGitHubDownloadHost("release-assets.githubusercontent.com")).toBe(true);
    expect(isAllowedGitHubDownloadHost("github-releases.githubusercontent.com")).toBe(true);
    expect(isAllowedGitHubDownloadHost("sub.github.com")).toBe(true);
  });

  it("rejects unexpected hosts", () => {
    expect(isAllowedGitHubDownloadHost("example.com")).toBe(false);
    expect(isAllowedGitHubDownloadHost("github.com.evil.com")).toBe(false);
  });

  it("accepts only https GitHub URLs", () => {
    expect(() =>
      assertAllowedDownloadUrl("https://github.com/foo/bar/releases/download/v1/a.zip"),
    ).not.toThrow();
    expect(() =>
      assertAllowedDownloadUrl("http://github.com/foo/bar/releases/download/v1/a.zip"),
    ).toThrow(/non-HTTPS/i);
    expect(() => assertAllowedDownloadUrl("https://example.com/a.zip")).toThrow(/unexpected host/i);
    expect(() => assertAllowedDownloadUrl("not a url")).toThrow(/invalid/i);
  });
});
