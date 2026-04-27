import { initReact } from './lib/react.js';
import { LegionWorkspace } from './panels/index.js';
import { LegionSettings } from './settings/index.js';

export function register(env) {
  globalThis.React = env.React;
  initReact(env.React);

  env.registerComponents('legion', {
    PanelView: LegionWorkspace,
    SettingsView: LegionSettings,
  });
}
