import { SettingsView } from './SettingsView.tsx';

export function register(env: {
  React: unknown;
  registerComponents: (
    pluginName: string,
    components: Record<string, unknown>,
  ) => void;
}) {
  (globalThis as Record<string, unknown>).React = env.React;

  env.registerComponents('legion', {
    SettingsView,
  });
}
