# Changelog

## [Unreleased]

## [2.1.5] - 2026-05-27

### Fixed
- Preferred runtime mode now keeps `agent.runtime='legion'` in both native and OpenAI-compatible daemon modes, so enabling LegionIO routes inference through the local daemon regardless of daemon protocol selection.

## [2.1.4] - 2026-05-26

### Fixed
- Health poll no longer overrides endpoint mode — `checkHealth` was unconditionally setting `agent.runtime='legion'` on daemon online transition, forcing native mode even when OpenAI-compatible was selected

## [2.1.2] - 2026-05-26

### Fixed
- Force `agent.runtime = 'legion'` when native mode is active so the inference provider is actually invoked (fixes 404 on `/api/llm/inference/chat/completions`)
- Always use `/v1` as the provider base URL — the AI SDK appends `/chat/completions` automatically; in native mode the inference provider intercepts before it's reached

## [2.1.0] - 2026-05-25

### Added
- Thinking/reasoning support: daemon `thinking-delta` events emitted as observer messages for distinct UI display
- Client tool passthrough: plugin executes host tools when daemon returns `requires_tool_result` and feeds results back for multi-round inference
- `request_id` sent with every inference request for tracing correlation
- `include_thinking` and `client_tool_passthrough` flags in request body

### Fixed
- Tool calls format changed from OpenAI-nested `{id, type, function:{name, arguments}}` to flat `{id, name, arguments}` matching the daemon's `normalize_message_tool_calls` expectation

## [2.0.4] - 2025-05-22

### Fixed
- Auto-set Legion as active runtime when daemon comes online

## [2.0.3] - 2025-05-21

### Fixed
- Standardize plugin tool names

## [2.0.2] - 2025-05-20

### Fixed
- Filter haiku models from catalog (requires lex-* extension not yet available)
- Sort vllm models first in catalog, add provider/instance tags
- Stamp requestedModelKey onto done event for UI model indicator
- Fix model filter incorrectly excluding qwen3.6-27b
- Merge legion models with existing catalog instead of replacing
- Debug log writes to `~/Documents/kai/kai-desktop/debug-logs/`

## [2.0.1] - 2025-05-19

### Changed
- Updated README and plugin description to reflect v2 architecture

## [2.0.0] - 2025-05-19

### Added
- LLM routing selector with per-conversation overrides
- Daemon model catalog sync (auto-registers available models)
- Full inference streaming via SSE through daemon pipeline
- Tool forwarding and tool history in daemon inference
- Circuit breaker with automatic daemon health recovery
- Runtime registration so Kai can route all inference through Legion

### Changed
- Complete rewrite of inference provider architecture
- Provider endpoint set to `/api/llm/inference`

## [1.0.2] - 2025-05-10

### Changed
- Remove priority and required from plugin.json

### Fixed
- Config resolution uses `~/.legionio/settings`

## [1.0.1] - 2025-05-08

### Changed
- Restructured plugin to `src/backend` + `src/frontend` + `src/shared`

## [1.0.0] - 2025-05-07

### Added
- Initial release: Legion daemon integration plugin for Kai desktop
- Daemon health polling and status banner
- LLM inference routing through daemon
