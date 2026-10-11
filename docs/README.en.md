[![SecurLab](../resources/logo.png)](../resources/logo.png)

# SecurLab

Local-first Minecraft server security testing workbench · Break your own server — before someone else does · MIT

[简体中文](../README.md) · [English](README.en.md)

[![Latest release](https://img.shields.io/github/v/release/Verlintas/SecurLab)](https://github.com/Verlintas/SecurLab/releases) [![Downloads](https://img.shields.io/github/downloads/Verlintas/SecurLab/total)](https://github.com/Verlintas/SecurLab/releases) [![License](https://img.shields.io/github/license/Verlintas/SecurLab)](../LICENSE) [![macOS arm64](https://img.shields.io/badge/macOS-arm64-ff0000?logo=apple&logoColor=white)](#download--install)

## Intro

SecurLab is an **authorized penetration-testing workbench** for Minecraft server owners and admins: run the attacker's full chain against your own server — scan → auth bypass → privilege escalation → impact validation — and get evidence-backed reports with remediation advice.

- **Attack-chain engine**: multi-step chains combining recon, auth attacks and verification, with conditional branches, per-step evidence and abortable runs
- **Manual single-module mode**: 17 modules can be run individually — recon / audit / access / auth / impact
- **Disposable labs built in**: no Docker; Paper + AuthMe + LuckPerms servers are provisioned automatically and start/stop with one click, console attached live
- **Dual terminals**: attack-engine log on the left, target server console on the right
- **Reports**: every run is recorded (steps / logs / evidence / findings) and exports to styled HTML or Markdown
- **Log forensics**: feed it a historical `latest.log` and rebuild the attack timeline (registration-hijack and privilege-takeover heuristics)
- **Safety rails**: active modules require an allowlisted target plus an authorization confirmation; destructive modules are engine-gated to local/lab targets
- **Requirements**: macOS (arm64; Windows planned); lab recipes need Java 21 (auto-detected)

> ⚠️ **Authorized testing only** — your own servers, or targets you are explicitly permitted to test.

## AI coding notice

This project is developed with AI coding assistance (opencode): requirements, review and releases are handled by the human maintainer; most code is written by AI.

- Evaluate correctness and safety yourself before using, quoting or building upon it
- If you spot issues in AI-generated code, please open an [Issue](https://github.com/Verlintas/SecurLab/issues) or PR

## Quick start

1. **Install**: grab the `.dmg` from [Releases](https://github.com/Verlintas/SecurLab/releases/latest) and drag it into Applications. The build is unsigned — first launch: right-click → Open, or:

    ```bash
    xattr -cr /Applications/SecurLab.app
    ```

2. **Try the lab first**: on the Lab tab, start recipe A (offline Paper + vulnerable AuthMe 6.0.0 + seeded ops/whitelist); the server console attaches to the right-hand terminal automatically

3. **Test your own server**: add your server `IP:port` to the allowlist in Settings and confirm authorization → on the Run tab, pick a chain or a single module. Start with read-only C0 recon

4. **Read the results**: the Reports tab shows evidence chains and remediation advice; export HTML / Markdown

Things to try:

- Dashboard — see the full matrix of 14 chains × 8 lab recipes
- Run — `C0` (read-only recon) or `C1` (offline OP takeover) against the lab, watching both terminals
- Toolbox — run any module manually, e.g. `recon.slp`, `audit.config`, `auth.proxy-forge`
- CLI: `HOST=play.example.com PORT=25565 CHAIN=C0 npm run live:run`

## Attack chain matrix

| Chain | Purpose | Status |
| --- | --- | --- |
| C0 | Recon sweep — SLP / legacy ping / query / players / fingerprint (read-only) | ✅ |
| C0A | Local config audit — `server.properties`, `ops.json`, plugin/proxy configs | ✅ |
| C1 | Offline OP takeover — claim a privileged name and verify operator rights | ✅ |
| C1C | Post-auth command surface — tab-complete tree + read-only probes | ✅ |
| C1V | Verify claimed identities — login with known credentials, check `/seed` | ✅ |
| C2 | Pre-join session race — AuthMe affected vs patched differential | ✅ |
| C4 | Proxy auto-login forgery — empty-secret `perform.login` | ✅ |
| C5 | Password spray — throttled, custom wordlists, kick-reconnect | ✅ |
| C6 / C6S / C6P | Registration-hijack sweep / sign-in surface scan / auth enforcement probe | ✅ |
| C7P | Chat & ad filter probe — pre/post-login message behavior | ✅ |
| C14 | Post-exploitation escalation — mass-op, location extraction (lab-only) | ✅ |
| C3 · C8–C13 | Proxy bypass, RCON, plugin CVE chain, permission misconfig, flood resilience, modded servers | planned |

## Features

### Attack-chain engine
- Chains are ordered step graphs with conditional branches (JSON-defined); steps support `when` guards and `continueOnError`
- Structured event bus (`run/step/log/evidence/finding`) drives both terminals and reports
- Single active run, abortable at any time, run records persisted

### Manual toolbox
- 17 modules grouped into five categories with dynamic per-module parameters
- Destructive modules are marked ⚠ lab-only in the UI and refused by the engine on non-local targets
- Shares the terminal, findings panel and report pipeline with chains

### Built-in labs
- Recipes A–H and R0/R1 cover offline servers, proxy misforwarding, query leaks, legacy CVEs, permission misconfig and session-race control groups
- Provisioner: PaperMC fill v3 API, GitHub Releases and Jenkins direct links, sha256 verification, local cache and CN mirror fallback
- Runtime patching: precise YAML path rewrites plus reload after startup (handles config migrations overwriting values)
- Multi-JDK auto-detection (JAVA_HOME / /Library/Java / Homebrew / PATH)

### Dual terminals & reports
- Two xterm terminals: attack engine + target server console (auto-attached by port)
- Evidence breadcrumbs per step; reports include severity, evidence JSON and a step timeline
- Exports: self-contained dark HTML (logo embedded) and GitHub-friendly Markdown

### Log forensics
- Parses Paper / Spigot / BungeeCord logs: joins, AuthMe register/login, op changes, dangerous commands, kicks
- Heuristics: registration hijack (registered right after first appearance), privilege takeover (op granted to fresh accounts), destruction bursts
- Outputs a Markdown incident report

## Download & install

- **Official**: [GitHub Releases](https://github.com/Verlintas/SecurLab/releases/latest) (full changelog included)
- **Accelerated mirrors** (third-party; often faster in mainland China — swap if one fails):

    ```
    https://gh-proxy.com/https://github.com/Verlintas/SecurLab/releases/latest/download/SecurLab-arm64.dmg
    https://ghproxy.net/https://github.com/Verlintas/SecurLab/releases/latest/download/SecurLab-arm64.dmg
    ```

    Any GitHub proxy works: prefix the official download URL with the proxy domain.

- Unsigned build (ad-hoc signed): if macOS warns it cannot verify the developer, right-click → Open, or `xattr -cr /Applications/SecurLab.app` (do **not** choose "Move to Trash")
- Labs require **Java 21** (e.g. `brew install openjdk@21`); server jars and plugins are downloaded from official sources on first use and cached

## Tech stack & architecture

Electron · React · TypeScript · Tailwind v4 · `mineflayer` / `node-minecraft-protocol` (protocol-level simulation) · xterm.js · native Java process labs (no Docker) · i18next (zh-CN / en)

```
src/main            Electron main: engine / lab / report / IPC
  engine/           runner + event bus + module registry + chains + destructive gate
    modules/        17 attack/recon modules + mineflayer session lib
  lab/              recipes / provisioner (download + verify + mirror fallback) / JDK detection / process manager / YAML patch
  report/           run-record store + HTML / Markdown generators
  settings.ts       allowlist / authorization / rate limit
src/preload         contextBridge API
src/renderer        React UI: dashboard / lab / run / reports / settings
src/shared          shared types (engine event protocol, network utils)
scripts/            acceptance suites and live CLIs (live:run / basefind / forensics / crack)
```

## Build & develop

Requires Node.js 22+ and Java 21 (labs only):

```bash
npm install
npm run dev          # dev mode
npm run typecheck    # type check
npm run build        # compile into out/
npm run dist:mac     # package macOS arm64 (.dmg / .zip)
```

Acceptance suites (most boot their own lab and run offline):

```bash
npm run lab:smoke     # lab provisioning + SLP + start/stop
npm run engine:smoke  # chain engine event pipeline
npm run attack:smoke  # C1/C5/C6 vs the vulnerable lab, asserted
npm run race:smoke    # C2 affected vs patched differential
npm run impact:smoke  # C14 escalation + destructive-gate check
npm run report:smoke  # HTML/Markdown export
```

Live CLI:

```bash
HOST=play.example.com PORT=25565 CHAIN=C0 npm run live:run         # run a chain
HOST=play.example.com PORT=25565 MODULE=recon.slp npm run live:run # run one module
LOG=/path/to/latest.log npm run log:forensics                      # incident timeline
```

## Milestones & roadmap

- **Done · M0 scaffold**: Electron + React + i18n + five-page shell
- **Done · M1 labs**: recipes / provisioner / JDK detection / process manager with console streaming
- **Done · M2 engine**: chain engine, event bus, dual-terminal run view
- **Done · M3 recon & audit**: SLP / legacy / query / player enum / config audit / log forensics
- **Done · M4–M5 attack chains**: C1/C5/C6, C2 control-group differential, C4 proxy forgery, report export
- **Done · v0.1.0 release**: manual toolbox, macOS packaging, live-test iteration
- **Planned**: C3 proxy bypass (multi-process labs), C8 RCON, C9 plugin CVE chain, C10 permission misconfig, C11 premium forgery, C12 flood resilience (lab-only), C13 modded servers, Windows packaging

## FAQ

**Can it be abused against third-party servers?** Three guardrails: active modules only accept allowlisted targets (localhost/labs by default); non-local targets additionally require an explicit authorization confirmation; destructive modules are hard-refused by the engine for non-local targets. The tool is built for testing your own infrastructure.

**Why native Java instead of Docker for labs?** Download-and-run: local Java processes plus automatic jar/plugin fetching means no kernel-level extra dependency on macOS or Windows; lab data lives in its own directory and resets only touch world/plugin data.

**Which server versions are supported?** Protocol layer uses `minecraft-data`, covering modern 1.21.x and older (1.8+). Modded servers get baseline probing; deeper modded attack surface is on the roadmap.

**Does testing impact the server?** Read-only chains (C0/C0A/C6S/C6P) make zero modifications; C1/C5/C6 produce join/registration/login attempts (rate-limited in Settings, abortable at any time); destructive demos only run against local labs.

## Contributing

Issues and PRs welcome. For bug reports, please attach a run log where possible (the Reports tab exports Markdown); new chains/modules should come with matching acceptance assertions.

## License

[MIT](../LICENSE) © 2026 Verlintas
