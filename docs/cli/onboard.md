---
summary: "CLI reference for `openclaw onboard` (interactive onboarding wizard)"
read_when:
  - You want guided setup for gateway, workspace, auth, channels, and skills
title: "onboard"
---

# `openclaw onboard`

Interactive onboarding wizard (local or remote Gateway setup).

## Related guides

- CLI onboarding hub: [Onboarding Wizard (CLI)](/start/wizard)
- CLI onboarding reference: [CLI Onboarding Reference](/start/wizard-cli-reference)
- CLI automation: [CLI Automation](/start/wizard-cli-automation)
- macOS onboarding: [Onboarding (macOS App)](/start/onboarding)

## Examples

```bash
openclaw onboard
openclaw onboard --flow quickstart
openclaw onboard --flow manual
openclaw onboard --mode remote --remote-url ws://gateway-host:18789
```

Organization template flow (interactive):

- During local onboarding, the wizard asks for **Organization template (domain)** and **Organization root directory (orgRoot)**.
- Template examples: `app-service-dev`, `image-creative`, `legal`, `medical`, `real-estate`, `accounting`, `ecommerce`, `marketing`, `education`, `hr`.
- Generated outputs include:
  - `agents.list[]` role agents (for example `app-service-dev-ceo`, `app-service-dev-dev`)
  - `tools.agentToAgent` allowlist for generated agent IDs
  - `<orgRoot>/<agentId>/workspace` and `<orgRoot>/<agentId>/.openclaw/agent`
  - `<orgRoot>/shared/templates/*` and `<orgRoot>/shared/STATUS_BOARD.md`
  - If Telegram is selected during onboarding, optional peer-to-agent routing rules are added to `bindings[]`
    - DM example: `{ agentId: "app-service-dev-dev", match: { channel: "telegram", accountId: "default", peer: { kind: "dm", id: "123456789" } } }`
    - Group example: `{ agentId: "app-service-dev-qa", match: { channel: "telegram", accountId: "default", peer: { kind: "group", id: "-1001234567890:topic:99" } } }`

Related docs:

- [Multi-agent concept](/concepts/multi-agent)
- [CLI Onboarding Reference](/start/wizard-cli-reference)

Flow notes:

- `quickstart`: minimal prompts, auto-generates a gateway token.
- `manual`: full prompts for port/bind/auth (alias of `advanced`).
- Fastest first chat: `openclaw dashboard` (Control UI, no channel setup).

## Common follow-up commands

```bash
openclaw configure
openclaw agents add <name>
```

<Note>
`--json` does not imply non-interactive mode. Use `--non-interactive` for scripts.
</Note>
