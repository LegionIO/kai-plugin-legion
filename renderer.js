import { initReact } from './src/renderer/lib/react.js';
import { LegionWorkspace } from './src/renderer/panels/index.js';
import { LegionSettings } from './src/renderer/settings/index.js';
import { LegionStatusBanner } from './src/renderer/components/LegionStatusBanner.js';

export function register(env) {
  const { React, registerComponents } = env;
  initReact(React);
  registerComponents('legion', { LegionSettings, LegionWorkspace, LegionStatusBanner });
}
