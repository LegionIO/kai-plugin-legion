import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureBackendRegistration,
  ensureRuntimeRegistration,
  shouldPreferLegionRuntime,
  shouldRegisterNativeInferenceProvider,
} from '../src/backend/index.js';
import { markDaemonReachable } from '../src/backend/daemon-client.js';
import type { PluginConfig } from '../src/shared/types.js';

function config(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    enabled: true,
    daemonUrl: 'http://127.0.0.1:4567',
    apiEndpoint: 'native',
    apiKey: '',
    configDir: '',
    readyPath: '/api/ready',
    healthPath: '/api/health',
    streamPath: '/api/llm/inference',
    backendEnabled: true,
    ...overrides,
  };
}

describe('runtime preference routing', () => {
  it('prefers the Legion runtime for OpenAI-compatible daemon mode too', () => {
    assert.equal(
      shouldPreferLegionRuntime(config({ apiEndpoint: 'openai' })),
      true,
    );
  });

  it('registers the inference provider for every enabled Legion runtime mode', () => {
    assert.equal(
      shouldRegisterNativeInferenceProvider(config({ apiEndpoint: 'native' })),
      true,
    );
    assert.equal(
      shouldRegisterNativeInferenceProvider(config({ apiEndpoint: 'openai' })),
      true,
    );
  });

  it('does not prefer Legion when disabled or unconfigured', () => {
    assert.equal(shouldPreferLegionRuntime(config({ enabled: false })), false);
    assert.equal(shouldPreferLegionRuntime(config({ daemonUrl: '' })), false);
  });

  it('keeps Legion runtime and provider available when the daemon is offline', () => {
    const appConfig: { agent: { runtime: string } } = { agent: { runtime: 'mastra' } };
    let runtime: { id: string; isAvailable: () => boolean } | null = null;
    let inferenceProvider: { name: string; isAvailable: () => boolean } | null = null;
    const api = {
      config: {
        get: () => appConfig,
        set: (path: string, value: string) => {
          if (path === 'agent.runtime') appConfig.agent.runtime = value;
        },
      },
      agent: {
        registerRuntime: (value: typeof runtime) => {
          runtime = value;
        },
        unregisterRuntime: () => {},
        registerInferenceProvider: (value: typeof inferenceProvider) => {
          inferenceProvider = value;
        },
        unregisterInferenceProvider: () => {},
      },
    };

    markDaemonReachable(false);
    ensureRuntimeRegistration(api, config());
    ensureBackendRegistration(api, config());

    assert.equal(appConfig.agent.runtime, 'legion');
    assert.equal(runtime?.id, 'legion');
    assert.equal(runtime?.isAvailable(), true);
    assert.equal(inferenceProvider?.name, 'LegionIO');
    assert.equal(inferenceProvider?.isAvailable(), true);

    markDaemonReachable(true);
  });
});
