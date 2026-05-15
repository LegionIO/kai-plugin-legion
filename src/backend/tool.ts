import type { PluginAPI } from '../shared/types.js';
import { daemonJson } from './daemon-client.js';
import { cleanText } from './utils.js';

/**
 * Register the single daemon tool with the Kai plugin API.
 *
 * The tool exposes the LegionIO daemon API as a set of named actions:
 *   status      — daemon health + readiness snapshot
 *   query       — knowledge / Apollo query
 *   ingest      — ingest content into knowledge
 *   delete      — delete a knowledge entry by ID
 *   workers     — live worker status
 *   tasks       — task list
 *   extensions  — extension list
 *   execute     — natural-language command via /api/do
 *   config      — read or write LLM pipeline settings
 *   memory      — search daemon memory stores
 *   request     — generic escape-hatch for any daemon endpoint
 */
export function registerTool(api: PluginAPI): void {
  api.tools.register([
    {
      name: 'daemon',
      description:
        'Interact with the LegionIO daemon. Use the `action` parameter to choose what to do. ' +
        'Actions: status (health snapshot), query (knowledge search), ingest (add to knowledge), ' +
        'delete (remove knowledge entry), workers (worker status), tasks (task list), ' +
        'extensions (extension list), execute (run a natural-language command), ' +
        'config (read/write LLM pipeline settings), memory (search memory stores), ' +
        'request (generic daemon API call).',
      inputSchema: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'status',
              'query',
              'ingest',
              'delete',
              'workers',
              'tasks',
              'extensions',
              'execute',
              'config',
              'memory',
              'request',
            ],
            description: 'The daemon action to perform.',
          },
          params: {
            type: 'object',
            description:
              'Action-specific parameters. ' +
              'status: {} | ' +
              'query: { query: string, limit?: number } | ' +
              'ingest: { content: string, title?: string, tags?: string[], source?: string } | ' +
              'delete: { id: string } | ' +
              'workers: { id?: string } | ' +
              'tasks: { status?: string, limit?: number } | ' +
              'extensions: {} | ' +
              'execute: { input: string } | ' +
              'config: { write?: object } | ' +
              'memory: { query: string, store?: string, limit?: number } | ' +
              'request: { path: string, method?: string, body?: object, query?: object }',
          },
        },
        required: ['action'],
      },
      execute: async ({
        action,
        params = {},
      }: {
        action: string;
        params?: Record<string, unknown>;
      }) => {
        switch (action) {
          case 'status': {
            const [ready, health] = await Promise.all([
              daemonJson(api, '/api/ready', { quiet: true }),
              daemonJson(api, '/api/health', { quiet: true }),
            ]);
            return {
              ok: ready.ok || health.ok,
              ready: ready.data ?? null,
              health: health.data ?? null,
            };
          }

          case 'query': {
            const result = await daemonJson(api, '/api/apollo/query', {
              method: 'POST',
              body: {
                query: params.query,
                limit: params.limit ?? 10,
              },
            });
            return result;
          }

          case 'ingest': {
            const result = await daemonJson(api, '/api/apollo/ingest', {
              method: 'POST',
              body: {
                content: params.content,
                title: params.title,
                tags: params.tags,
                source: params.source,
              },
            });
            return result;
          }

          case 'delete': {
            if (!cleanText(params.id as string)) {
              return { ok: false, error: 'id is required for delete action.' };
            }
            const result = await daemonJson(api, `/api/apollo/${params.id}`, {
              method: 'DELETE',
            });
            return result;
          }

          case 'workers': {
            const path = cleanText(params.id as string)
              ? `/api/workers/${params.id}`
              : '/api/workers';
            const result = await daemonJson(api, path);
            return result;
          }

          case 'tasks': {
            const result = await daemonJson(api, '/api/tasks', {
              query: {
                ...(params.status ? { status: String(params.status) } : {}),
                ...(params.limit ? { limit: String(params.limit) } : {}),
              },
            });
            return result;
          }

          case 'extensions': {
            const result = await daemonJson(api, '/api/extensions');
            return result;
          }

          case 'execute': {
            const input = cleanText(params.input as string);
            if (!input) {
              return { ok: false, error: 'input is required for execute action.' };
            }
            const result = await daemonJson(api, '/api/do', {
              method: 'POST',
              body: { input },
            });
            return result;
          }

          case 'config': {
            if (params.write && typeof params.write === 'object') {
              const result = await daemonJson(api, '/api/settings/llm', {
                method: 'POST',
                body: params.write,
              });
              return result;
            }
            const result = await daemonJson(api, '/api/settings/llm');
            return result;
          }

          case 'memory': {
            const result = await daemonJson(api, '/api/memory/search', {
              method: 'POST',
              body: {
                query: params.query,
                ...(params.store ? { store: params.store } : {}),
                limit: params.limit ?? 10,
              },
            });
            return result;
          }

          case 'request': {
            const path = cleanText(params.path as string);
            if (!path) {
              return { ok: false, error: 'path is required for request action.' };
            }
            const result = await daemonJson(api, path, {
              method: cleanText(params.method as string).toUpperCase() || 'GET',
              body: params.body,
              query: params.query && typeof params.query === 'object'
                ? params.query as Record<string, string>
                : undefined,
            });
            return result;
          }

          default:
            return {
              ok: false,
              error: `Unknown daemon action: "${action}". Valid actions: status, query, ingest, delete, workers, tasks, extensions, execute, config, memory, request.`,
            };
        }
      },
    },
  ]);
}
