/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cx, safeJson, fmtAgo, fmtTime, asArray } from '../lib/utils.js';
import { Badge, Section, ActionButton, EmptyState } from '../components/index.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL = 5000;
const STATUSES = ['all', 'pending', 'running', 'completed', 'failed'] as const;

const STATUS_COLORS: Record<string, { fill: string; stroke: string; text: string }> = {
  running:   { fill: '#1d4ed8', stroke: '#3b82f6', text: '#93c5fd' },
  completed: { fill: '#166534', stroke: '#22c55e', text: '#86efac' },
  failed:    { fill: '#991b1b', stroke: '#ef4444', text: '#fca5a5' },
  pending:   { fill: '#854d0e', stroke: '#eab308', text: '#fde68a' },
};
const DEFAULT_COLOR = { fill: '#374151', stroke: '#6b7280', text: '#d1d5db' };

const STATUS_DOT: Record<string, string> = {
  running: 'bg-blue-400',
  completed: 'bg-emerald-400',
  failed: 'bg-red-400',
  pending: 'bg-amber-400',
};

const NODE_W = 160;
const NODE_H = 48;
const LAYOUT_NODE_H = 80;
const LAYER_GAP = 120;
const NODE_GAP = 30;
const PAD = 40;

/* ------------------------------------------------------------------ */
/*  Graph layout algorithm                                            */
/* ------------------------------------------------------------------ */

interface GraphNode {
  id: string;
  label: string;
  status: string;
  runner?: string;
  function?: string;
  created_at?: string;
  parent_id?: string | null;
  depends_on?: string[];
}

interface LayoutNode {
  node: GraphNode;
  x: number;
  y: number;
  layer: number;
}

interface LayoutEdge {
  from: LayoutNode;
  to: LayoutNode;
}

function buildLayout(nodes: GraphNode[]): { layoutNodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number } {
  if (nodes.length === 0) return { layoutNodes: [], edges: [], width: 400, height: 200 };

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency: parent -> children
  const children = new Map<string, string[]>();
  const hasParent = new Set<string>();

  for (const node of nodes) {
    const parents: string[] = [];
    if (node.parent_id && nodeMap.has(node.parent_id)) parents.push(node.parent_id);
    if (node.depends_on) {
      for (const dep of node.depends_on) {
        if (nodeMap.has(dep) && dep !== node.parent_id) parents.push(dep);
      }
    }
    for (const p of parents) {
      if (!children.has(p)) children.set(p, []);
      children.get(p)!.push(node.id);
      hasParent.add(node.id);
    }
  }

  // Assign layers via BFS from roots
  const layers = new Map<string, number>();
  const roots = nodes.filter((n) => !hasParent.has(n.id));
  if (roots.length === 0) roots.push(nodes[0]);

  const queue: string[] = [];
  for (const r of roots) {
    layers.set(r.id, 0);
    queue.push(r.id);
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const layer = layers.get(id)!;
    for (const childId of children.get(id) || []) {
      const existing = layers.get(childId);
      if (existing === undefined || existing < layer + 1) {
        layers.set(childId, layer + 1);
        queue.push(childId);
      }
    }
  }

  // Assign unvisited nodes to layer 0
  for (const node of nodes) {
    if (!layers.has(node.id)) layers.set(node.id, 0);
  }

  // Group by layer
  const layerGroups = new Map<number, GraphNode[]>();
  for (const node of nodes) {
    const l = layers.get(node.id)!;
    if (!layerGroups.has(l)) layerGroups.set(l, []);
    layerGroups.get(l)!.push(node);
  }

  const maxLayer = Math.max(...layerGroups.keys(), 0);
  const maxNodesInLayer = Math.max(...[...layerGroups.values()].map((g) => g.length), 1);

  const layoutNodes: LayoutNode[] = [];
  const layoutMap = new Map<string, LayoutNode>();

  for (const [layer, group] of layerGroups) {
    const totalWidth = group.length * NODE_W + (group.length - 1) * NODE_GAP;
    const startX = (maxNodesInLayer * NODE_W + (maxNodesInLayer - 1) * NODE_GAP - totalWidth) / 2 + PAD;

    group.forEach((node, i) => {
      const ln: LayoutNode = {
        node,
        x: startX + i * (NODE_W + NODE_GAP),
        y: PAD + layer * (LAYOUT_NODE_H + LAYER_GAP),
        layer,
      };
      layoutNodes.push(ln);
      layoutMap.set(node.id, ln);
    });
  }

  // Build edges
  const edges: LayoutEdge[] = [];
  for (const node of nodes) {
    const to = layoutMap.get(node.id);
    if (!to) continue;
    const parents: string[] = [];
    if (node.parent_id && nodeMap.has(node.parent_id)) parents.push(node.parent_id);
    if (node.depends_on) {
      for (const dep of node.depends_on) {
        if (nodeMap.has(dep) && dep !== node.parent_id) parents.push(dep);
      }
    }
    for (const pid of parents) {
      const from = layoutMap.get(pid);
      if (from) edges.push({ from, to });
    }
  }

  const width = Math.max(maxNodesInLayer * (NODE_W + NODE_GAP) + PAD * 2, 400);
  const height = (maxLayer + 1) * (LAYOUT_NODE_H + LAYER_GAP) + PAD * 2;

  return { layoutNodes, edges, width, height };
}

/* ------------------------------------------------------------------ */
/*  TasksTab component                                                */
/* ------------------------------------------------------------------ */

export function TasksTab({ onAction }: { onAction: any }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [live, setLive] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<any>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const intervalRef = useRef<any>(null);

  /* -- Fetch tasks ------------------------------------------------- */
  const fetchTasks = useCallback(async () => {
    try {
      const filters: Record<string, string> = {};
      if (statusFilter !== 'all') filters.status = statusFilter;

      // Try graph endpoint first, fall back to list
      let res = await Promise.resolve(onAction?.('task-graph', { filters }));
      if (!res || res?.ok === false) {
        res = await Promise.resolve(onAction?.('tasks-list', { filters: statusFilter !== 'all' ? { status: statusFilter } : undefined }));
      }

      if (res?.ok === false) {
        setError(res.error || 'Failed to fetch tasks');
      } else {
        const raw = asArray(res?.data ?? res);
        const graphNodes: GraphNode[] = raw.map((t: any) => ({
          id: t.id,
          label: t.function || t.runner || t.name || (t.id ? t.id.slice(0, 8) : '?'),
          status: t.status || 'pending',
          runner: t.runner,
          function: t.function,
          created_at: t.created_at || t.createdAt,
          parent_id: t.parent_id,
          depends_on: t.depends_on,
        }));
        setTasks(graphNodes);
        setError('');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setLoading(false);
  }, [statusFilter, onAction]);

  /* -- Fetch detail for selected node ------------------------------ */
  const fetchDetail = useCallback(async (id: string) => {
    try {
      const res = await Promise.resolve(onAction?.('task-get', { id }));
      if (res?.ok !== false) {
        setSelectedDetail(res?.data ?? res);
      }
    } catch { setSelectedDetail(null); }
  }, [onAction]);

  /* -- Delete task ------------------------------------------------- */
  const deleteTask = useCallback(async (id: string) => {
    await Promise.resolve(onAction?.('task-delete', { id }));
    if (selectedId === id) { setSelectedId(null); setSelectedDetail(null); }
    void fetchTasks();
  }, [onAction, selectedId, fetchTasks]);

  /* -- Effects ----------------------------------------------------- */
  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(fetchTasks, POLL_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live, fetchTasks]);

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId);
    else setSelectedDetail(null);
  }, [selectedId, fetchDetail]);

  /* -- Derived ----------------------------------------------------- */
  const { layoutNodes, edges, width, height } = useMemo(() => buildLayout(tasks as GraphNode[]), [tasks]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) { counts[t.status] = (counts[t.status] || 0) + 1; }
    return counts;
  }, [tasks]);

  /* -- Render ------------------------------------------------------ */

  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setLive(!live)}
        className={cx(
          'flex items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs font-medium transition-colors',
          live
            ? 'bg-red-500/10 text-red-400'
            : 'border border-border/70 bg-card/60 text-muted-foreground hover:text-foreground',
        )}
      >
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />}
        {live ? 'Stop' : 'Live'}
      </button>
      <ActionButton label={loading ? 'Refreshing...' : 'Refresh'} onClick={fetchTasks} disabled={loading} variant="secondary" />
    </div>
  );

  if (loading) {
    return (
      <Section title="Task Graph" subtitle="Loading..." actions={headerActions}>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading tasks...</p>
      </Section>
    );
  }

  if (error && tasks.length === 0) {
    return (
      <Section title="Task Graph" actions={headerActions}>
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="text-2xl">{'⚠'}</span>
          <p className="text-sm text-muted-foreground">{error}</p>
          <ActionButton label="Retry" onClick={fetchTasks} />
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="Task Graph"
      subtitle={`${tasks.length} tasks`}
      actions={headerActions}
    >
      <div className="grid gap-4">

        {/* -- Status filter buttons ----------------------------------- */}
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cx(
                'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border/70 bg-card/40 text-muted-foreground hover:text-foreground',
              )}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {/* -- Status summary bar -------------------------------------- */}
        {Object.keys(statusCounts).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(statusCounts).map(([status, count]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className={cx('h-2 w-2 rounded-full', STATUS_DOT[status] || 'bg-gray-400')} />
                <span className="text-[10px] text-muted-foreground">{count} {status}</span>
              </div>
            ))}
          </div>
        )}

        {/* -- SVG Task Graph ------------------------------------------ */}
        {tasks.length === 0 ? (
          <EmptyState title="No tasks" body="No tasks match the current filter." />
        ) : (
          <div className="overflow-auto rounded-2xl border border-border/30 bg-card/10">
            <svg width={width} height={height} style={{ minWidth: '100%' }}>
              {/* Defs: arrowhead marker */}
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#6b7280" />
                </marker>
              </defs>

              {/* Edges (bezier curves) */}
              {edges.map((edge, i) => {
                const x1 = edge.from.x + NODE_W / 2;
                const y1 = edge.from.y + NODE_H;
                const x2 = edge.to.x + NODE_W / 2;
                const y2 = edge.to.y;
                const midY = (y1 + y2) / 2;
                return (
                  <path
                    key={`e${i}`}
                    d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                    fill="none"
                    stroke="#4b5563"
                    strokeWidth="1.5"
                    markerEnd="url(#arrowhead)"
                    opacity="0.6"
                  />
                );
              })}

              {/* Nodes */}
              {layoutNodes.map((ln) => {
                const colors = STATUS_COLORS[ln.node.status] || DEFAULT_COLOR;
                const isSelected = ln.node.id === selectedId;
                const isHovered = ln.node.id === hoveredId;
                const shortId = ln.node.id.slice(0, 8);
                const label = ln.node.label || ln.node.function || ln.node.runner || shortId;
                const displayLabel = label.length > 20 ? label.slice(0, 18) + '...' : label;

                return (
                  <g
                    key={ln.node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedId(isSelected ? null : ln.node.id)}
                    onMouseEnter={() => setHoveredId(ln.node.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    {/* Selection glow */}
                    {isSelected && (
                      <rect
                        x={ln.x - 3} y={ln.y - 3}
                        width={NODE_W + 6} height={NODE_H + 6}
                        rx={10} ry={10}
                        fill="none" stroke={colors.stroke} strokeWidth="2" opacity="0.5"
                      />
                    )}

                    {/* Node background */}
                    <rect
                      x={ln.x} y={ln.y}
                      width={NODE_W} height={NODE_H}
                      rx={8} ry={8}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={isHovered ? '2' : '1'}
                      opacity={isHovered ? '1' : '0.85'}
                    />

                    {/* Running pulse animation */}
                    {ln.node.status === 'running' && (
                      <rect
                        x={ln.x} y={ln.y}
                        width={NODE_W} height={NODE_H}
                        rx={8} ry={8}
                        fill="none" stroke={colors.stroke} strokeWidth="2"
                      >
                        <animate
                          attributeName="opacity"
                          values="0.6;0.1;0.6"
                          dur="2s"
                          repeatCount="indefinite"
                        />
                      </rect>
                    )}

                    {/* Label text */}
                    <text
                      x={ln.x + NODE_W / 2} y={ln.y + 18}
                      textAnchor="middle" fontSize="11" fontWeight="600"
                      fill={colors.text}
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {displayLabel}
                    </text>

                    {/* Status + short ID */}
                    <text
                      x={ln.x + NODE_W / 2} y={ln.y + 34}
                      textAnchor="middle" fontSize="9"
                      fill={colors.text} opacity="0.7"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      {`${ln.node.status} · ${shortId}`}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* -- Task list below graph ----------------------------------- */}
        {tasks.length > 0 && (
          <div className="grid gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Task List</h4>
            {tasks.map((t: any) => (
              <div
                key={t.id}
                className={cx(
                  'flex items-center justify-between rounded-2xl border px-4 py-2.5 transition-colors cursor-pointer',
                  selectedId === t.id
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/60 bg-background/45 hover:bg-muted/20',
                )}
                onClick={() => setSelectedId(selectedId === t.id ? null : t.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cx('h-2 w-2 rounded-full flex-shrink-0', STATUS_DOT[t.status] || 'bg-gray-400')} />
                  <span className="text-sm font-medium truncate">{t.label || t.id.slice(0, 12)}</span>
                  <Badge status={t.status || 'unknown'} />
                  {t.runner && <span className="text-[10px] text-muted-foreground">{t.runner}</span>}
                  {t.created_at && <span className="text-[10px] text-muted-foreground">{fmtAgo(t.created_at)}</span>}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <ActionButton label="Delete" onClick={(e: any) => { e?.stopPropagation?.(); deleteTask(t.id); }} variant="danger" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* -- Selected task detail panel ------------------------------ */}
        {selectedDetail && (
          <div className="rounded-2xl border border-border/50 bg-card/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold">Task Detail</h4>
              <button
                type="button"
                onClick={() => { setSelectedId(null); setSelectedDetail(null); }}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                Close {'×'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* ID */}
              <div>
                <span className="text-[10px] text-muted-foreground block">ID</span>
                <span className="font-mono text-[10px] break-all select-all">{selectedDetail.id}</span>
              </div>
              {/* Status */}
              <div>
                <span className="text-[10px] text-muted-foreground block">Status</span>
                <Badge status={selectedDetail.status || 'unknown'} />
              </div>
              {/* Runner */}
              {selectedDetail.runner && (
                <div>
                  <span className="text-[10px] text-muted-foreground block">Runner</span>
                  <span className="font-mono text-[10px]">{selectedDetail.runner}</span>
                </div>
              )}
              {/* Function */}
              {selectedDetail.function && (
                <div>
                  <span className="text-[10px] text-muted-foreground block">Function</span>
                  <span className="font-mono text-[10px]">{selectedDetail.function}</span>
                </div>
              )}
              {/* Created */}
              {(selectedDetail.created_at || selectedDetail.createdAt) && (
                <div>
                  <span className="text-[10px] text-muted-foreground block">Created</span>
                  <span className="text-[10px]">{fmtTime(selectedDetail.created_at || selectedDetail.createdAt)}</span>
                </div>
              )}
              {/* Duration */}
              {selectedDetail.duration_ms != null && (
                <div>
                  <span className="text-[10px] text-muted-foreground block">Duration</span>
                  <span className="text-[10px]">{selectedDetail.duration_ms}ms</span>
                </div>
              )}
              {/* Parent */}
              {selectedDetail.parent_id && (
                <div>
                  <span className="text-[10px] text-muted-foreground block">Parent</span>
                  <span className="font-mono text-[10px]">{selectedDetail.parent_id.slice(0, 8)}...</span>
                </div>
              )}
              {/* Dependencies */}
              {selectedDetail.depends_on?.length > 0 && (
                <div>
                  <span className="text-[10px] text-muted-foreground block">Dependencies</span>
                  <span className="text-[10px]">{selectedDetail.depends_on.length} tasks</span>
                </div>
              )}
            </div>

            {/* Error */}
            {selectedDetail.error && (
              <div>
                <span className="text-[10px] text-muted-foreground block">Error</span>
                <pre className="mt-1 max-h-20 overflow-auto rounded-xl border border-red-500/20 bg-red-500/5 p-2 text-[10px] font-mono text-red-400">
                  {selectedDetail.error}
                </pre>
              </div>
            )}

            {/* Args */}
            {selectedDetail.args !== undefined && (
              <div>
                <span className="text-[10px] text-muted-foreground block">Args</span>
                <pre className="mt-1 max-h-24 overflow-auto rounded-xl border border-border/30 bg-muted/20 p-2 text-[10px] font-mono">
                  {safeJson(selectedDetail.args)}
                </pre>
              </div>
            )}

            {/* Result */}
            {selectedDetail.result !== undefined && (
              <div>
                <span className="text-[10px] text-muted-foreground block">Result</span>
                <pre className="mt-1 max-h-24 overflow-auto rounded-xl border border-border/30 bg-muted/20 p-2 text-[10px] font-mono">
                  {safeJson(selectedDetail.result)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}
