import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldPreferLegionRuntime,
  shouldRegisterNativeInferenceProvider,
} from '../src/backend/index.js';
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

  it('only registers the native inference provider for native daemon mode', () => {
    assert.equal(
      shouldRegisterNativeInferenceProvider(config({ apiEndpoint: 'native' })),
      true,
    );
    assert.equal(
      shouldRegisterNativeInferenceProvider(config({ apiEndpoint: 'openai' })),
      false,
    );
  });

  it('does not prefer Legion when disabled or unconfigured', () => {
    assert.equal(shouldPreferLegionRuntime(config({ enabled: false })), false);
    assert.equal(shouldPreferLegionRuntime(config({ daemonUrl: '' })), false);
  });
});
