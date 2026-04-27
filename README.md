# kai-plugin-legion

Legion daemon integration plugin for [Kai desktop](https://github.com/LegionIO/kai-desktop). Provides daemon health monitoring, event streaming, proactive GAIA threads, workflow routing, knowledge panels, marketplace tooling, GitHub views, sub-agent management, and **daemon-powered LLM inference**.

## Inference Routing

When this plugin is installed and the Legion daemon is online, **all LLM inference automatically routes through the daemon's `/api/llm/inference` endpoint**. This upgrades Kai's standard inference pipeline to use your local daemon for model execution, tool handling, and context management.

- **Daemon online** → All inference goes through Legion daemon
- **Daemon offline** → Automatic fallback to Kai's standard Mastra pipeline
- **Seamless switching** → No manual intervention required

The daemon is the **primary inference provider** when this plugin is active — not an optional backend. Configure the daemon URL in Settings > Legion > Connection.

## Quick Start

```bash
# Clone and install
git clone https://github.com/LegionIO/kai-plugin-legion.git
cd kai-plugin-legion
npm install

# Build for development (installs to ~/.kai/plugins/legion/)
npm run dev

# Or build for production (outputs to dist/)
npm run build
```

Launch (or restart) Kai desktop — it will discover the plugin and prompt you to approve its permissions.

## Development

```bash
# Dev build + file watcher (rebuilds on changes)
npm run dev -- --watch

# Production build (outputs to dist/)
npm run build
```

After rebuilding, restart Kai desktop to pick up changes (the host hashes plugin files on load).

## Project Structure

```
kai-plugin-legion/
├── plugin.json              # Plugin manifest (name, permissions, config schema)
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript config (type checking only)
├── esbuild.config.mjs       # Bundler — dual entry points (backend + frontend)
├── .github/workflows/
│   └── release.yml          # Automated release workflow
├── src/
│   ├── backend/             # Node.js/Electron main process (16 modules)
│   │   ├── index.ts         # activate/deactivate entry point, runtime sync
│   │   ├── daemon-client.ts # HTTP client with circuit breaker + JWT auth
│   │   ├── events.ts        # SSE event stream with auto-reconnect
│   │   ├── events-classify.ts # Event → notification classifier
│   │   ├── backend.ts       # Backend registration state tracking
│   │   ├── tools.ts         # 8 registered tools (refresh, threads, panels, etc.)
│   │   ├── actions.ts       # Action handler dispatcher
│   │   ├── actions-daemon.ts # 65+ daemon CRUD action handlers
│   │   ├── workflows.ts     # Trigger dispatch + triage routing
│   │   ├── conversations.ts # Managed conversations + proactive GAIA thread
│   │   ├── knowledge.ts     # Apollo query, ingest, monitors
│   │   ├── config.ts        # Config resolution and auth source detection
│   │   ├── state.ts         # Plugin state management + navigation updates
│   │   ├── ui.ts            # Panels, nav items, banners, commands
│   │   ├── doctor.ts        # Diagnostic health checks
│   │   └── utils.ts         # Shared utilities
│   ├── frontend/            # Browser/renderer process
│   │   ├── index.ts         # Component registration (PanelView + SettingsView)
│   │   ├── lib/             # React shim, hooks, utilities, bridge
│   │   ├── components/      # 13 shared UI primitives
│   │   ├── panels/          # 8 panel views (Dashboard, Knowledge, GitHub, etc.)
│   │   └── settings/        # 25 settings tabs (Connection, LLM, GAIA, etc.)
│   └── shared/              # Shared between backend and frontend
│       ├── types.ts         # TypeScript type definitions
│       └── constants.ts     # Panel definitions, timing, limits, defaults
└── dist/                    # Build output (gitignored)
```

## Build System

The plugin uses **esbuild** with two bundled entry points:

| Entry | Platform | Output |
|-------|----------|--------|
| `src/backend/index.ts` | Node.js (ESM) | `backend.js` |
| `src/frontend/index.ts` | Browser (ESM) | `frontend.js` |

- `npm run dev` builds to `~/.kai/plugins/legion/` (with `plugin.json` copied alongside)
- `npm run build` builds to `dist/`
- `--watch` flag enables file watching for either mode

## Configuration

After loading, open **Settings > Legion** in Kai desktop. The plugin exposes 28 config fields across multiple tabs. At minimum you need:

- **Daemon URL** — e.g. `http://127.0.0.1:4567`
- **Config Dir** — path containing `crypt.json` for JWT auth (auto-detected from `~/.kai/settings`, `~/.legion/settings`, or `~/.config/legion/settings`)

## Panels

| Panel | Description |
|-------|-------------|
| Mission Control | Dashboard with daemon health, tasks, workers, GAIA status |
| Notifications | Real-time event stream from the daemon |
| Operations | Command center for natural-language daemon commands |
| Knowledge | Apollo knowledge base queries and ingestion |
| GitHub | Repository status and integration overview |
| Marketplace | Extension/plugin management |
| Workflows | Trigger rules, triage routing, active workflows |
| Sub-Agents | Daemon-spawned sub-agent monitoring |

## Tools

The plugin registers 8 tools that Claude can call during conversations:

1. **refresh_status** — Refresh daemon health and plugin state
2. **create_thread** — Create a Legion-managed conversation
3. **open_panel** — Open a Legion control panel
4. **execute_command** — Send a natural-language command to the daemon
5. **knowledge_query** — Query Legion knowledge / Apollo
6. **manage_triggers** — List, enable, disable, or test trigger rules
7. **memory_search** — Search daemon memory stores
8. **worker_status** — Fetch live status for one or all workers

## Permissions

| Permission | Purpose |
|---|---|
| `config:read/write` | Read and persist plugin settings |
| `tools:register` | Register 8 conversation tools |
| `ui:banner/modal/settings/panel/navigation` | Status banner, settings, 8 panels, sidebar nav |
| `messages:hook` | Pre/post message processing |
| `network:fetch` | HTTP requests to daemon |
| `notifications:send` | Toast and native OS notifications |
| `conversations:read/write` | Manage Legion/GAIA threads |
| `navigation:open` | Open panels and conversations programmatically |
| `state:publish` | Publish plugin state to renderer |
| `agent:inference-provider` | Route LLM inference through daemon backend |

## Releasing

The included GitHub Actions workflow automates versioning and publishing:

1. Go to **Actions > Release Plugin > Run workflow**
2. Choose a version bump (major / minor / patch)
3. The workflow will:
   - Bump version in `plugin.json` and `package.json`
   - Commit and tag the release
   - Build the plugin
   - Create a GitHub Release with `legion-v{version}.tar.gz`

## License

MIT
