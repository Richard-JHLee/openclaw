import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { seedOrgTemplateFilesystem } from "./filesystem.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("seedOrgTemplateFilesystem", () => {
  it("creates agent workspace/agentDir and shared template files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-org-seed-"));
    tempDirs.push(root);

    await seedOrgTemplateFilesystem({
      domainTemplateId: "app-service-dev",
      orgRootDir: root,
    });

    const workspaceStat = await fs.stat(path.join(root, "app-service-dev-ceo", "workspace"));
    const agentDirStat = await fs.stat(
      path.join(root, "app-service-dev-ceo", ".openclaw", "agent"),
    );
    expect(workspaceStat.isDirectory()).toBe(true);
    expect(agentDirStat.isDirectory()).toBe(true);

    await expect(
      fs.readFile(path.join(root, "app-service-dev-ceo", "workspace", "AGENTS.md"), "utf-8"),
    ).resolves.toContain("CEO Agent Guide");
    await expect(
      fs.readFile(path.join(root, "shared", "templates", "PRD.md"), "utf-8"),
    ).resolves.toContain("# Product Requirements Document (PRD)");
    await expect(
      fs.readFile(path.join(root, "shared", "STATUS_BOARD.md"), "utf-8"),
    ).resolves.toContain("# Status Board");
    await expect(
      fs.readFile(
        path.join(root, "shared", "roles", "app-service-dev-dev.request-response.md"),
        "utf-8",
      ),
    ).resolves.toContain("To: app-service-dev-dev");
  });

  it("does not overwrite existing role guidance files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-org-seed-"));
    tempDirs.push(root);

    const ceoGuidePath = path.join(root, "legal-ceo", "workspace", "AGENTS.md");
    await fs.mkdir(path.dirname(ceoGuidePath), { recursive: true });
    await fs.writeFile(ceoGuidePath, "custom ceo guide", "utf-8");

    await seedOrgTemplateFilesystem({
      domainTemplateId: "legal",
      orgRootDir: root,
    });

    await expect(fs.readFile(ceoGuidePath, "utf-8")).resolves.toBe("custom ceo guide");
  });
});
