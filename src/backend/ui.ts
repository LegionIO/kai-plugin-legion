import type { PluginAPI, PluginConfig, PluginState } from '../shared/types.js';
import {
  PANEL_DEFINITIONS,
  BANNER_ID,
} from '../shared/constants.js';

// ---------------------------------------------------------------------------
// Register all static UI elements (settings, panels, commands, nav items)
// ---------------------------------------------------------------------------

export function registerUi(api: PluginAPI): void {
  api.ui.registerSettingsView({
    id: 'legion',
    label: 'Legion',
    priority: -4,
  });

  for (const panel of PANEL_DEFINITIONS) {
    api.ui.registerPanelView({
      id: panel.id,
      title: panel.title,
      visible: true,
      width: panel.width as 'default' | 'wide' | 'full',
      props: {
        view: panel.view,
      },
    });
  }

  api.ui.registerCommand({
    id: 'legion-command-center',
    label: 'Legion Command Center',
    shortcut: 'mod+k',
    visible: true,
    priority: 20,
    target: { type: 'panel', panelId: 'operations' },
  });

  updateNavigationItems(api, (api.state.get() || {}) as PluginState);
}

// ---------------------------------------------------------------------------
// Navigation items (badges update on every state change)
// ---------------------------------------------------------------------------

export function updateNavigationItems(api: PluginAPI, state: PluginState): void {
  const stateRecord = state as Record<string, unknown>;
  const unreadNotifications = Number(stateRecord.unreadNotificationCount || 0);
  const workflowCounts = (stateRecord.workflowCounts || {
    active: 0,
    needsInput: 0,
  }) as { active: number; needsInput: number };
  const dashboard = stateRecord.dashboard as Record<string, unknown> | null;
  const tasksSummary = dashboard?.tasksSummary as { running?: number } | undefined;

  for (const panel of PANEL_DEFINITIONS) {
    let badge: string | number | undefined = undefined;

    if (panel.id === 'notifications' && unreadNotifications > 0) {
      badge = unreadNotifications;
    }
    if (panel.id === 'workflows') {
      const activeCount =
        Number(workflowCounts.active || 0) + Number(workflowCounts.needsInput || 0);
      if (activeCount > 0) badge = activeCount;
    }
    if (panel.id === 'subagents') {
      const runningTasks = Number(tasksSummary?.running || 0);
      if (runningTasks > 0) badge = runningTasks;
    }

    api.ui.registerNavigationItem({
      id: panel.navId,
      label: panel.title,
      icon: { lucide: panel.icon },
      visible: true,
      priority: panel.priority,
      badge,
      target: { type: 'panel', panelId: panel.id },
    });
  }
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

export function updateBanner(
  api: PluginAPI,
  config: PluginConfig,
  state: PluginState,
): void {
  const stateRecord = state as Record<string, unknown>;

  if (!config.enabled) {
    api.ui.hideBanner(BANNER_ID);
    api.ui.hideBanner('legion-routing');
    return;
  }

  if (stateRecord.status === 'unconfigured') {
    api.ui.showBanner({
      id: BANNER_ID,
      text: 'Legion is installed but not configured yet. Add the daemon URL and auth settings in Settings to enable health checks, events, and the optional backend.',
      variant: 'info',
      dismissible: true,
      visible: true,
    });
    api.ui.hideBanner('legion-routing');
    return;
  }

  if (stateRecord.status === 'disabled') {
    api.ui.showBanner({
      id: BANNER_ID,
      text: 'Legion plugin is disabled.',
      variant: 'info',
      dismissible: true,
      visible: true,
    });
    api.ui.hideBanner('legion-routing');
    return;
  }

  // Text banner for online, offline, and checking states
  const status = (stateRecord.status as string) || 'offline';

  if (status === 'offline') {
    api.ui.showBanner({
      id: BANNER_ID,
      text: 'Legion daemon is offline. Check your daemon URL and ensure the service is running.',
      variant: 'warning',
      dismissible: true,
      visible: true,
    });
    api.ui.hideBanner('legion-routing');
    return;
  }

  // Online or checking — hide the status banner and show the routing banner
  api.ui.hideBanner(BANNER_ID);

  // Show routing banner when online
  api.ui.showBanner({
    id: 'legion-routing',
    component: 'RoutingBanner',
    visible: true,
    dismissible: false,
    props: {},
  });
}
