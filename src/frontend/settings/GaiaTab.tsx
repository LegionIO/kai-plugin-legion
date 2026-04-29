/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { cx, asArray } from '../lib/utils.js';
import { Section, ActionButton } from '../components/index.js';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const POLL_INTERVAL = 3000;

const ACTIVE_PHASES = [
  'sensory_processing', 'emotional_evaluation', 'gut_instinct', 'memory_retrieval',
  'working_memory_integration', 'action_selection', 'prediction_engine', 'social_cognition',
  'theory_of_mind', 'homeostasis_regulation', 'identity_entropy_check', 'post_tick_reflection',
  'knowledge_retrieval', 'knowledge_promotion', 'procedural_check', 'mesh_interface',
] as const;

const DREAM_PHASES = [
  'dream_onset', 'dream_narrative', 'dream_emotion', 'dream_consolidation',
  'dream_creativity', 'dream_rehearsal', 'dream_integration', 'dream_emergence',
] as const;

const MODE_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  dormant:        { color: 'text-gray-400',    bg: 'bg-gray-500/10',    label: '⏸ Dormant' },
  sentinel:       { color: 'text-amber-400',   bg: 'bg-amber-500/10',   label: '\u{1F441} Sentinel' },
  full_active:    { color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: '⚡ Full Active' },
  dormant_active: { color: 'text-violet-400',  bg: 'bg-violet-500/10',  label: '☾ Dormant Active' },
};

const MODE_SVG_COLOR: Record<string, string> = {
  dormant: '#737373',
  sentinel: '#f59e0b',
  full_active: '#34d399',
  dormant_active: '#a78bfa',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function formatPhaseName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function phaseColor(status: string): string {
  switch (status) {
    case 'running': return '#34d399';
    case 'completed': return '#6ee7b7';
    case 'skipped': return 'transparent';
    default: return '#525252';
  }
}

function phaseStroke(status: string): string {
  return status === 'skipped' ? '#525252' : 'none';
}

function phaseDash(status: string): string {
  return status === 'skipped' ? '3,3' : 'none';
}

function formatSecondsAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

/* ------------------------------------------------------------------ */
/*  Phase Wheel (inline SVG component)                                */
/* ------------------------------------------------------------------ */

function PhaseWheel({
  phases,
  tickMode,
  tickCount,
  hoveredPhase,
  setHoveredPhase,
  tooltipPos,
  setTooltipPos,
}: {
  phases: any[];
  tickMode: string;
  tickCount: number;
  hoveredPhase: any;
  setHoveredPhase: (p: any) => void;
  tooltipPos: { x: number; y: number };
  setTooltipPos: (p: { x: number; y: number }) => void;
}) {
  const cxVal = 200;
  const cyVal = 200;
  const outerR = 160;
  const innerR = 100;
  const nodeR = 12;
  const innerNodeR = 9;

  const phaseMap = new Map(phases.map((p: any) => [p.name, p]));

  // Center text color
  const centerColor = MODE_SVG_COLOR[tickMode] || '#737373';

  return (
    <div className="relative flex justify-center">
      <svg viewBox="0 0 400 400" style={{ height: '360px', width: '360px' }}>
        {/* Outer ring track */}
        <circle cx={cxVal} cy={cyVal} r={outerR} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.15" />
        {/* Inner ring track */}
        <circle cx={cxVal} cy={cyVal} r={innerR} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.1" />

        {/* Outer (active) phase nodes */}
        {ACTIVE_PHASES.map((name, i) => {
          const angle = (i / ACTIVE_PHASES.length) * Math.PI * 2 - Math.PI / 2;
          const x = cxVal + outerR * Math.cos(angle);
          const y = cyVal + outerR * Math.sin(angle);
          const state = phaseMap.get(name) || { name, status: 'idle' };
          const isRunning = state.status === 'running';

          return (
            <g
              key={name}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e: any) => { setHoveredPhase(state); setTooltipPos({ x: e.clientX || 0, y: e.clientY || 0 }); }}
              onMouseLeave={() => setHoveredPhase(null)}
            >
              {/* Running pulse */}
              {isRunning && (
                <circle cx={x} cy={y} r={nodeR + 4} fill={phaseColor(state.status)} opacity="0.2">
                  <animate attributeName="r" values={`${nodeR + 2};${nodeR + 6};${nodeR + 2}`} dur="1.5s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.3;0.1;0.3" dur="1.5s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Node circle */}
              <circle
                cx={x} cy={y} r={nodeR}
                fill={phaseColor(state.status)}
                stroke={phaseStroke(state.status)}
                strokeWidth="1.5"
                strokeDasharray={phaseDash(state.status)}
              />
              {/* Abbreviated label */}
              <text
                x={x} y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="6"
                fill="currentColor"
                opacity="0.7"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {name.slice(0, 3).toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* Inner (dream) phase nodes */}
        {DREAM_PHASES.map((name, i) => {
          const angle = (i / DREAM_PHASES.length) * Math.PI * 2 - Math.PI / 2;
          const x = cxVal + innerR * Math.cos(angle);
          const y = cyVal + innerR * Math.sin(angle);
          const state = phaseMap.get(name) || { name, status: 'idle' };
          const isRunning = state.status === 'running';

          return (
            <g
              key={name}
              style={{ cursor: 'pointer' }}
              onMouseEnter={(e: any) => { setHoveredPhase(state); setTooltipPos({ x: e.clientX || 0, y: e.clientY || 0 }); }}
              onMouseLeave={() => setHoveredPhase(null)}
            >
              {/* Running pulse */}
              {isRunning && (
                <circle cx={x} cy={y} r={innerNodeR + 3} fill="#a78bfa" opacity="0.2">
                  <animate attributeName="r" values={`${innerNodeR + 1};${innerNodeR + 5};${innerNodeR + 1}`} dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              {/* Node circle */}
              <circle
                cx={x} cy={y} r={innerNodeR}
                fill={state.status === 'idle' ? '#525252' : '#a78bfa'}
                stroke={phaseStroke(state.status)}
                strokeWidth="1"
                strokeDasharray={phaseDash(state.status)}
                opacity={state.status === 'idle' ? '0.5' : '1'}
              />
              {/* Label */}
              <text
                x={x} y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="5"
                fill="currentColor"
                opacity="0.5"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {`D${i + 1}`}
              </text>
            </g>
          );
        })}

        {/* Center: tick mode */}
        <text
          x={cxVal} y={cyVal - 10}
          textAnchor="middle"
          fontSize="14"
          fontWeight="600"
          fill={centerColor}
        >
          {(tickMode || 'unknown').replace(/_/g, ' ').toUpperCase()}
        </text>
        {/* Center: tick count */}
        <text
          x={cxVal} y={cyVal + 12}
          textAnchor="middle"
          fontSize="10"
          fill="currentColor"
          opacity="0.5"
        >
          {`tick #${(tickCount || 0).toLocaleString()}`}
        </text>
      </svg>

      {/* Tooltip */}
      {hoveredPhase && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl border border-border/50 bg-popover/95 px-3 py-2 shadow-xl"
          style={{ left: tooltipPos.x + 12, top: tooltipPos.y - 40 }}
        >
          <p className="text-xs font-semibold">{formatPhaseName(hoveredPhase.name)}</p>
          <p className="text-[10px] text-muted-foreground capitalize">{hoveredPhase.status}</p>
          {hoveredPhase.duration_ms != null && <p className="text-[10px] text-muted-foreground">{hoveredPhase.duration_ms}ms</p>}
          {hoveredPhase.budget_ms != null && <p className="text-[10px] text-muted-foreground">Budget: {hoveredPhase.budget_ms}ms</p>}
          {hoveredPhase.last_run && <p className="text-[10px] text-muted-foreground">{hoveredPhase.last_run}</p>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  GaiaTab component                                                 */
/* ------------------------------------------------------------------ */

export function GaiaTab({ onAction }: { onAction: any }) {
  const [status, setStatus] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [hoveredPhase, setHoveredPhase] = useState<any>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const feedRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);

  /* -- Fetch status ------------------------------------------------ */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await Promise.resolve(onAction?.('gaia-status'));
      if (res?.ok === false) {
        setError(res.error || 'Failed to fetch GAIA status');
      } else {
        setStatus(res?.data ?? res);
        setLastFetched(new Date());
        setError('');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    }
    setLoading(false);
  }, [onAction]);

  /* -- Fetch events ------------------------------------------------ */
  const fetchEvents = useCallback(async () => {
    try {
      const res = await Promise.resolve(onAction?.('gaia-events', { query: { limit: '50' } }));
      if (res?.ok !== false && (res?.data || res)) {
        const newEvents = asArray(res?.data ?? res);
        setEvents((prev: any[]) => {
          const seen = new Set(prev.map((e: any) => `${e.timestamp}|${e.phase}`));
          const merged = [...prev, ...newEvents.filter((e: any) => !seen.has(`${e.timestamp}|${e.phase}`))];
          return merged.slice(-200);
        });
      }
    } catch { /* ignore event fetch errors */ }
  }, [onAction]);

  /* -- Effects ----------------------------------------------------- */
  useEffect(() => { fetchStatus(); fetchEvents(); }, [fetchStatus, fetchEvents]);

  useEffect(() => {
    if (live) {
      intervalRef.current = setInterval(() => { fetchStatus(); fetchEvents(); }, POLL_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [live, fetchStatus, fetchEvents]);

  useEffect(() => {
    if (live && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events, live]);

  /* -- Derived ----------------------------------------------------- */
  const mode = status?.tick_mode || status?.tickMode || status?.state || 'unknown';
  const mc = MODE_CONFIG[mode] || { color: 'text-gray-400', bg: 'bg-gray-500/10', label: mode.replace(/_/g, ' ') };
  const tickCount = status?.tick_count ?? status?.tickCount ?? 0;
  const phases: any[] = asArray(status?.phases);
  const buf = status?.sensory_buffer;
  const channels: any[] = asArray(status?.channels);
  const sessions = status?.sessions;
  const gate = status?.notification_gate;
  const dream = status?.dream_cycle;

  /* -- Render ------------------------------------------------------ */

  const headerActions = (
    <div className="flex items-center gap-2">
      {lastFetched && (
        <span className="text-[10px] text-muted-foreground">Updated {formatSecondsAgo(lastFetched)}</span>
      )}
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
        {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />}
        {live ? 'Stop' : 'Live'}
      </button>
      <ActionButton
        label={loading ? 'Refreshing...' : 'Refresh'}
        onClick={() => { fetchStatus(); fetchEvents(); }}
        disabled={loading}
        variant="secondary"
      />
    </div>
  );

  if (loading) {
    return (
      <Section title="GAIA Cognitive Engine" subtitle="Loading..." actions={headerActions}>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading GAIA status...</p>
      </Section>
    );
  }

  if (error && !status) {
    return (
      <Section title="GAIA Cognitive Engine" actions={headerActions}>
        <div className="flex flex-col items-center gap-3 py-8">
          <span className="text-2xl">{'⚠'}</span>
          <p className="text-sm text-muted-foreground">{error}</p>
          <ActionButton label="Retry" onClick={fetchStatus} />
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="GAIA Cognitive Engine"
      subtitle="Autonomous loop status and tick events"
      actions={headerActions}
    >
      <div className="grid gap-6">

        {/* -- Tick mode badge ------------------------------------------ */}
        <div className="flex items-center gap-3">
          <span className={cx('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium', mc.bg, mc.color)}>
            {mc.label}
          </span>
          <span className="text-xs text-muted-foreground">Tick #{tickCount.toLocaleString()}</span>
          {status?.uptime_seconds != null && (
            <span className="text-xs text-muted-foreground">Uptime: {Math.floor(status.uptime_seconds / 60)}m</span>
          )}
        </div>

        {/* -- Phase Wheel --------------------------------------------- */}
        <PhaseWheel
          phases={phases}
          tickMode={mode}
          tickCount={tickCount}
          hoveredPhase={hoveredPhase}
          setHoveredPhase={setHoveredPhase}
          tooltipPos={tooltipPos}
          setTooltipPos={setTooltipPos}
        />

        {/* -- Status cards grid --------------------------------------- */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">

          {/* Tick Mode card */}
          <div className="rounded-2xl border border-border/50 bg-card/30 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tick Mode</p>
            <p className={cx('mt-1 text-sm font-semibold capitalize', mc.color)}>{mode.replace(/_/g, ' ')}</p>
            {status?.uptime_seconds != null && (
              <p className="text-[10px] text-muted-foreground">Uptime: {Math.floor(status.uptime_seconds / 60)}m</p>
            )}
          </div>

          {/* Sensory Buffer card */}
          <div className="rounded-2xl border border-border/50 bg-card/30 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sensory Buffer</p>
            <p className="mt-1 text-lg font-bold">
              {String(buf?.depth ?? '—')}
              <span className="text-xs font-normal text-muted-foreground">/{buf?.max_capacity ?? 1000}</span>
            </p>
            {buf?.recent_signals != null && (
              <p className="text-[10px] text-muted-foreground">{buf.recent_signals} recent signals</p>
            )}
          </div>

          {/* Channels card */}
          <div className="rounded-2xl border border-border/50 bg-card/30 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Channels</p>
            <div className="mt-1 flex flex-col gap-1">
              {channels.length > 0 ? (
                channels.map((ch: any) => (
                  <div key={ch.name} className="flex items-center gap-1.5">
                    <span className={cx('h-1.5 w-1.5 rounded-full', ch.connected ? 'bg-emerald-400' : 'bg-gray-500')} />
                    <span className="text-xs">{ch.name}</span>
                    {ch.type && <span className="rounded-full bg-muted/50 px-1.5 py-0.5 text-[9px] text-muted-foreground">{ch.type}</span>}
                  </div>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No active channels</span>
              )}
            </div>
          </div>

          {/* Sessions card */}
          <div className="rounded-2xl border border-border/50 bg-card/30 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sessions</p>
            <p className="mt-1 text-lg font-bold">{String(sessions?.active_count ?? '—')}</p>
            {sessions?.ttl != null && (
              <p className="text-[10px] text-muted-foreground">TTL: {sessions.ttl}s</p>
            )}
            {sessions?.identities?.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {sessions.identities.slice(0, 3).map((id: string) => (
                  <span key={id} className="rounded-full bg-primary/10 px-2 py-0.5 text-[9px] text-primary">{id}</span>
                ))}
                {sessions.identities.length > 3 && (
                  <span className="text-[9px] text-muted-foreground">+{sessions.identities.length - 3}</span>
                )}
              </div>
            )}
          </div>

          {/* Notification Gate card */}
          <div className="rounded-2xl border border-border/50 bg-card/30 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Notification Gate</p>
            <div className="mt-1.5 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <span className={cx('h-1.5 w-1.5 rounded-full', gate?.schedule ? 'bg-emerald-400' : 'bg-gray-500')} />
                <span className="text-[10px]">Schedule: {gate?.schedule ? 'Open' : 'Closed'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span className="text-[10px]">Presence: {gate?.presence || '—'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                <span className="text-[10px]">Behavioral: {gate?.behavioral != null ? `${(gate.behavioral * 100).toFixed(0)}%` : '—'}</span>
              </div>
            </div>
          </div>

          {/* Dream Cycle card */}
          <div className="rounded-2xl border border-border/50 bg-card/30 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dream Cycle</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className={cx('text-sm', dream?.active ? 'text-violet-400' : 'text-gray-500')}>{'☾'}</span>
              <span className="text-xs font-medium">{dream?.active ? 'Active' : 'Idle'}</span>
            </div>
            {dream?.last_run && <p className="text-[10px] text-muted-foreground">Last: {dream.last_run}</p>}
            {dream?.insight_count != null && <p className="text-[10px] text-muted-foreground">{dream.insight_count} insights</p>}
            {dream?.phase_progress && <p className="text-[10px] text-muted-foreground">{dream.phase_progress}</p>}
          </div>
        </div>

        {/* -- Tick event stream --------------------------------------- */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">{'≣'}</span>
              <span className="text-xs font-medium">Tick Stream</span>
              {live && (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                  Live
                </span>
              )}
            </div>
            <span className="text-[10px] text-muted-foreground">{events.length} events</span>
          </div>

          <div
            ref={feedRef}
            className="max-h-[300px] overflow-y-auto rounded-2xl border border-border/30 bg-card/10"
          >
            {events.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No tick events yet</p>
            ) : (
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-card/80">
                  <tr className="border-b border-border/30 text-left text-muted-foreground">
                    <th className="px-3 py-1.5 font-medium">Time</th>
                    <th className="px-3 py-1.5 font-medium">Phase</th>
                    <th className="px-3 py-1.5 font-medium text-right">Duration</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev: any, i: number) => (
                    <tr
                      key={`${ev.timestamp}-${ev.phase}-${i}`}
                      className="border-b border-border/10 hover:bg-muted/20"
                    >
                      <td className="px-3 py-1 font-mono text-muted-foreground">{ev.timestamp || '—'}</td>
                      <td className="px-3 py-1">{(ev.phase || '').replace(/_/g, ' ')}</td>
                      <td className="px-3 py-1 text-right font-mono">
                        {ev.duration_ms != null ? `${ev.duration_ms}ms` : '—'}
                      </td>
                      <td className="px-3 py-1">
                        <span className={cx(
                          'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                          ev.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                          ev.status === 'running' ? 'bg-blue-500/10 text-blue-400' :
                          ev.status === 'skipped' ? 'bg-gray-500/10 text-gray-400' :
                          'bg-muted/50 text-muted-foreground',
                        )}>
                          {ev.status || '—'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
