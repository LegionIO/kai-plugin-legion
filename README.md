# kai-plugin-legion

LegionIO inference runtime plugin for [Kai desktop](https://github.com/LegionIO/kai-desktop). When enabled, all LLM inference routes through the LegionIO daemon. If the daemon is unavailable, requests fail instead of falling back to Kai's built-in runtime.

## What it does

- **Inference routing** — registers as Kai's primary inference provider; all tool calls, compaction, memory, and chat stream through `/api/llm/inference`
- **Daemon-selected default model** — adds a synthetic `Legionio` model that routes through LegionIO without forcing a concrete model ID
- **Live model catalog** — fetches the daemon's model list on startup and merges it into Kai's catalog (vllm models first, non-chat models excluded); re-syncs whenever the daemon comes back online
- **Status banner** — shows "LegionIO ● Available" (green) or "LegionIO ● Unavailable" (amber) in the Kai header; polls every 30 seconds
- **`daemon` tool** — a single conversation tool with 11 actions covering daemon health, knowledge, memory, workers, tasks, and arbitrary API calls
- **Fail-closed routing** — if the daemon goes offline mid-session, Kai surfaces the daemon failure instead of using another runtime

## Quick start

```bash
git clone https://github.com/LegionIO/kai-plugin-legion.git
cd kai-plugin-legion
npm install

# Dev build → installs directly to ~/.kai/plugins/legion/
npm run dev

# Production build → outputs to dist/
npm run build
```

Restart Kai desktop — it will discover the plugin and prompt you to approve its permissions.

```bash
# Rebuild on file changes
npm run dev -- --watch
```

## Configuration

Open **Settings → LegionIO** in Kai. Two settings are exposed:

| Setting | Default | Description |
|---------|---------|-------------|
| Enable LegionIO Runtime | `true` | Toggle inference routing on/off |
| Daemon URL | `http://127.0.0.1:4567` | The LegionIO daemon HTTP endpoint |

JWT auth is read automatically from `crypt.json` in your LegionIO config directory (typically `~/.legionio/settings`). No manual key entry needed.

## The `daemon` tool

The plugin registers one tool that Claude can call during conversations. It accepts an `action` parameter and an optional `params` object:

| Action | Endpoint | Description |
|--------|----------|-------------|
| `status` | `GET /api/ready` + `/api/health` | Daemon readiness and health snapshot |
| `query` | `POST /api/apollo/query` | Search the Apollo knowledge base |
| `ingest` | `POST /api/apollo/ingest` | Add content to the knowledge base |
| `delete` | `DELETE /api/apollo/{id}` | Remove a knowledge entry by ID |
| `workers` | `GET /api/workers` | Live worker status (all or by ID) |
| `tasks` | `GET /api/tasks` | Task list with optional status filter |
| `extensions` | `GET /api/extensions` | Loaded extension list |
| `execute` | `POST /api/do` | Run a natural-language command on the daemon |
| `config` | `GET/POST /api/settings/llm` | Read or write LLM pipeline settings |
| `memory` | `POST /api/memory/search` | Search daemon memory stores |
| `request` | `{method} {path}` | Generic escape-hatch for any daemon endpoint |

Example:
```
daemon { action: "query", params: { query: "deployment steps", limit: 5 } }
daemon { action: "execute", params: { input: "restart the indexer worker" } }
daemon { action: "status" }
```

## Model catalog behavior

On first successful health check, the plugin fetches `/api/llm/models` and:

1. Filters to `types: ["inference"]` models only (excludes embed, TTS, STT, image, video)
2. Excludes haiku models (temporarily, pending a daemon-side fix for the `lex-*` provider extension)
3. Sorts vllm-backed models to the top
4. Merges the resulting list into Kai's model catalog — prepended before any other plugin's models, without clobbering them
5. Sets the first legion model as the default if no default is currently active

The catalog re-syncs automatically whenever the daemon transitions from offline → online.

## Project structure

```
kai-plugin-legion/
├── plugin.json                  # Manifest: permissions, config schema
├── package.json
├── tsconfig.json
├── esbuild.config.mjs           # Single backend entry point
├── .github/workflows/
│   └── release.yml              # Automated release (verbump: major/minor/patch/none)
└── src/
    ├── backend/
    │   ├── index.ts             # activate/deactivate, health poll, model catalog sync
    │   ├── daemon-client.ts     # HTTP client: circuit breaker, JWT auth, retries
    │   ├── daemon-inference.ts  # SSE streaming provider: message normalization, sync fallback
    │   ├── tool.ts              # `daemon` tool registration (11 actions)
    │   └── utils.ts             # joinUrl, cleanText, clampNumber
    └── shared/
        ├── types.ts             # PluginAPI, PluginConfig, PluginState
        └── constants.ts         # HEALTH_POLL_MS, BANNER_ID, circuit-breaker timing
```

The plugin is backend-only — no frontend bundle, no React, no custom panels. Settings are handled by Kai's built-in config UI.

## Permissions

| Permission | Purpose |
|---|---|
| `config:read/write` | Read daemon URL / enabled flag; write model catalog and provider config |
| `tools:register` | Register the `daemon` conversation tool |
| `ui:banner` | Show the Available / Unavailable status banner |
| `ui:settings` | Register the LegionIO settings page |
| `network:fetch` | HTTP requests to the daemon |
| `state:publish` | Publish online/offline state to the renderer |
| `agent:inference-provider` | Take over as Kai's primary inference provider |
| `agent:register-runtime` | Register the `legion` runtime for Kai's runtime selector |
| `agent:register-cli-tool` | Register the `legionio` binary as a usable CLI tool |

## Releasing

```
Actions → Release Plugin → Run workflow → verbump: patch / minor / major / none
```

The workflow bumps the version in `plugin.json` and `package.json`, tags the commit, builds the plugin, and publishes a GitHub Release with `legion-v{version}.tar.gz`.

Use `none` to re-release the current version without a version bump.

## License

MIT
