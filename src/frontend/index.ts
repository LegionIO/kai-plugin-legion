import { LegionWorkspace } from './panels/index.tsx';
import { LegionSettings } from './settings/index.tsx';
import { RoutingBanner, RoutingModal } from './components/index.js';
import { initReact } from './lib/react.js';

export function register(env: {
  React: unknown;
  registerComponents: (pluginName: string, components: Record<string, unknown>) => void;
}) {
  (globalThis as Record<string, unknown>).React = env.React;
  initReact(env.React);

  env.registerComponents('legion', {
    PanelView: LegionWorkspace,
    SettingsView: LegionSettings,
    RoutingBanner: RoutingBanner,
    RoutingModal: RoutingModal,
  });
}
