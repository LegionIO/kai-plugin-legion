/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { EmptyState } from '../components/index.js';
import { DashboardView } from './DashboardView.js';
import { NotificationsView } from './NotificationsView.js';
import { OperationsView } from './OperationsView.js';
import { GitHubView } from './GitHubView.js';
import { KnowledgeView } from './KnowledgeView.js';
import { MarketplaceView } from './MarketplaceView.js';
import { WorkflowsView } from './WorkflowsView.js';
import { SubAgentsView } from './SubAgentsView.js';

export function LegionWorkspace({ props, pluginState, pluginConfig, onAction }: any): any {
  const view = props?.view || 'dashboard';

  if (view === 'dashboard') {
    return <DashboardView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }
  if (view === 'notifications') {
    return <NotificationsView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }
  if (view === 'operations') {
    return <OperationsView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }
  if (view === 'knowledge') {
    return <KnowledgeView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }
  if (view === 'github') {
    return <GitHubView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }
  if (view === 'marketplace') {
    return <MarketplaceView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }
  if (view === 'workflows') {
    return <WorkflowsView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }
  if (view === 'subagents') {
    return <SubAgentsView pluginState={pluginState} pluginConfig={pluginConfig} onAction={onAction} />;
  }

  return <EmptyState title="Unknown Legion view" body={`No renderer view is registered for "${view}".`} />;
}
