import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, ArrowDownRight, ArrowUpRight, Briefcase, Building2, CalendarClock,
  CheckCircle2, Clock, Globe, MapPin, Minus, TrendingUp, Users,
  UserSquare,
} from 'lucide-react';
import {
  Area, AreaChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import './DashboardInsights.css';

/* ===========================================================================
   Everything the CRM knows, on one screen.

   Every figure here is derived from a real row. Where the data does not exist
   — booking amounts, departments, regions — the panel says so rather than
   showing a number nobody can trace.
   =========================================================================== */

/**
 * The categorical series colours.
 *
 * Both columns were checked with the data-viz validator against this app's own
 * surfaces (#ffffff light, #151d2e dark): lightness band, chroma floor,
 * colour-vision separation and normal-vision separation all pass in both
 * modes. Three light steps sit under 3:1 on white, so every chart using them
 * also carries a visible label or a legend value — never colour alone.
 */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

const readDark = () => typeof document !== 'undefined'
  && (document.documentElement.dataset.theme === 'dark'
    || document.body?.classList.contains('dark-mode')
    || (!document.documentElement.dataset.theme
      && window.matchMedia?.('(prefers-color-scheme: dark)').matches));

/**
 * Tracks the theme rather than sampling it during render.
 *
 * Read at render time the charts kept whatever colours they had when they last
 * happened to re-render, so toggling the theme left them in the old palette
 * until something unrelated changed.
 */
function useIsDark() {
  const [dark, setDark] = useState(readDark);

  useEffect(() => {
    const sync = () => setDark(readDark());
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    mq?.addEventListener?.('change', sync);
    // The toggle stamps data-theme on <html> and a class on <body>.
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => { mq?.removeEventListener?.('change', sync); observer.disconnect(); };
  }, []);

  return dark;
}

const nf = new Intl.NumberFormat('en-IN');

/**
 * A twelve-month series as a single path, sized to its own box.
 *
 * No axes, no grid, no tooltip: it exists to give the number beside it a
 * shape. The figure itself is the thing being read.
 */
function Sparkline({ series = [], color }) {
  const points = series.length ? series : [0];
  const max = Math.max(...points, 1);
  const w = 100;
  const h = 28;
  const step = points.length > 1 ? w / (points.length - 1) : w;

  const line = points.map((v, i) => `${i * step},${h - (v / max) * (h - 3) - 1.5}`);
  const area = `0,${h} ${line.join(' ')} ${w},${h}`;
  const id = `sp${color.replace('#', '')}`;

  return (
    <svg className="di-card__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * A headline figure: the number, what it counts, how it moved, and its shape.
 *
 * The change carries an arrow and a sign as well as its colour, so the
 * direction is never colour-alone.
 */
function StatCard({ icon: Icon, label, value, spark, color, tone = 'accent', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  const change = spark?.change;
  const hasChange = change !== null && change !== undefined;
  const up = hasChange && change > 0;
  const flat = hasChange && change === 0;

  return (
    <Tag className={`di-card di-card--${tone}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      <span className="di-card__top">
        <span className="di-card__icon"><Icon size={16} /></span>
        <span className="di-card__label">{label}</span>
      </span>
      <span className="di-card__figure">
        <span className="di-card__value">{typeof value === 'number' ? nf.format(value) : value}</span>
        {hasChange && (
          <span className={`di-card__change ${up ? 'is-up' : flat ? 'is-flat' : 'is-down'}`}>
            {up ? <ArrowUpRight size={13} /> : flat ? <Minus size={13} /> : <ArrowDownRight size={13} />}
            {up ? '+' : ''}{change}%
          </span>
        )}
      </span>
      <span className="di-card__foot">
        <Sparkline series={spark?.series} color={color} />
        <span className="di-card__sub">
          {spark?.thisMonth > 0 ? `+${spark.thisMonth} this month` : 'none this month'}
        </span>
      </span>
    </Tag>
  );
}

/** A titled panel. */
function Panel({ icon: Icon, title, subtitle, action, children, className = '' }) {
  return (
    <section className={`di-panel ${className}`.trim()}>
      <header className="di-panel__head">
        {Icon && <span className="di-panel__icon"><Icon size={15} /></span>}
        <div className="di-panel__titles">
          <h3 className="di-panel__title">{title}</h3>
          {subtitle && <p className="di-panel__sub">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="di-panel__body">{children}</div>
    </section>
  );
}

function Empty({ children }) {
  return <p className="di-empty">{children}</p>;
}

/**
 * A ranked list of categories as proportional bars.
 *
 * Bars rather than a second pie: comparing lengths against a shared baseline is
 * what magnitude wants, and every row carries its own number, so the colour is
 * decoration rather than the only way to read it.
 */
function RankedBars({ rows, colors, total, onRowClick }) {
  if (!rows || rows.length === 0) return <Empty>Nothing recorded yet.</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  const sum = total ?? rows.reduce((a, r) => a + r.value, 0);

  return (
    <ul className="di-bars">
      {rows.map((r, i) => {
        const pct = sum > 0 ? Math.round((r.value / sum) * 100) : 0;
        const Row = onRowClick ? 'button' : 'div';
        return (
          <li key={r.name}>
            <Row
              className="di-bars__row"
              type={onRowClick ? 'button' : undefined}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
            >
              <span className="di-bars__label" title={r.name}>{r.name}</span>
              <span className="di-bars__track">
                <span
                  className="di-bars__fill"
                  style={{ width: `${(r.value / max) * 100}%`, background: colors[i % colors.length] }}
                />
              </span>
              <span className="di-bars__value">{nf.format(r.value)}</span>
              <span className="di-bars__pct">{pct}%</span>
            </Row>
          </li>
        );
      })}
    </ul>
  );
}

/** Chart tooltip, drawn from tokens so it follows the theme. */
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="di-tip">
      {label && <p className="di-tip__label">{label}</p>}
      {payload.map((p) => (
        <p className="di-tip__row" key={p.name}>
          <span className="di-tip__swatch" style={{ background: p.color || p.payload?.fill }} />
          {p.name}: <strong>{nf.format(p.value)}</strong>
        </p>
      ))}
    </div>
  );
}

function DashboardInsights({ overview, onRefresh }) {
  const navigate = useNavigate();
  const dark = useIsDark();
  // Re-derived only when the theme flips, not on every parent render.
  const { SERIES, axis, grid } = useMemo(() => ({
    SERIES: dark ? SERIES_DARK : SERIES_LIGHT,
    axis: dark ? '#8091ab' : '#64748b',
    grid: dark ? '#24304a' : '#e8edf5',
  }), [dark]);

  const sourceTotal = useMemo(
    () => (overview?.leadsBySource || []).reduce((a, r) => a + r.value, 0),
    [overview],
  );

  if (!overview) return null;

  const { counts, conversion, workload, revenue } = overview;
  const spark = overview.sparklines || {};
  const trendHasData = overview.trend?.some((t) => t.leads > 0 || t.opportunities > 0);

  return (
    <div className="di">

      {/* ---- Headline counts ------------------------------------------- */}
      <div className="di-cards">
        <StatCard
          icon={Users} label="Leads" value={counts.leads} tone="accent"
          color={SERIES[0]} spark={spark.leads}
          onClick={() => navigate('/leads')}
        />
        <StatCard
          icon={Briefcase} label="Opportunities" value={counts.opportunities} tone="teal"
          color={SERIES[2]} spark={spark.opportunities}
          onClick={() => navigate('/opportunities')}
        />
        <StatCard
          icon={MapPin} label="Projects" value={counts.projects} tone="violet"
          color={SERIES[6]} spark={spark.projects}
          onClick={() => navigate('/projects/list')}
        />
        {/* Staff headcount is company information, and it links into Settings.
            The server sends null for it when the figures cover one person, and
            a card reading "Users 0" would be worse than no card at all. */}
        {counts.users !== null && counts.users !== undefined && (
          <StatCard
            icon={UserSquare} label="Users" value={counts.users} tone="blue"
            color={SERIES[0]} spark={spark.users}
            onClick={() => navigate('/settings/user-admin')}
          />
        )}
        <StatCard
          icon={Building2} label="Channel partners" value={counts.channelPartners} tone="orange"
          color={SERIES[1]} spark={spark.channelPartners}
          onClick={() => navigate('/channel-partners')}
        />
        <StatCard
          icon={UserSquare} label="Customers" value={counts.customers} tone="teal"
          color={SERIES[2]} spark={spark.customers}
          onClick={() => navigate('/customers')}
        />
        <StatCard
          icon={TrendingUp} label="Lead conversion" value={`${conversion.rate}%`} tone="green"
          color={SERIES[5]} spark={{ series: overview.trend.map((t) => t.opportunities), thisMonth: conversion.converted }}
        />
      </div>

      {/* ---- Trend + sources ------------------------------------------- */}
      <div className="di-grid di-grid--2-1">
        <Panel
          icon={TrendingUp}
          title="Leads and opportunities"
          subtitle="The last twelve months"
          action={onRefresh && (
            <button type="button" className="di-panel__action" onClick={onRefresh}>Refresh</button>
          )}
        >
          {trendHasData ? (
            <div className="di-chart">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={overview.trend} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="diLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="diOpps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={SERIES[2]} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={SERIES[2]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: grid }} />
                  <YAxis tick={{ fill: axis, fontSize: 12 }} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                  <Tooltip content={<ChartTip />} cursor={{ stroke: axis, strokeWidth: 1 }} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, color: axis, paddingTop: 8 }} />
                  <Area type="monotone" dataKey="leads" name="Leads" stroke={SERIES[0]} strokeWidth={2} fill="url(#diLeads)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="opportunities" name="Opportunities" stroke={SERIES[2]} strokeWidth={2} fill="url(#diOpps)" dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : <Empty>No leads or opportunities were created in the last twelve months.</Empty>}
        </Panel>

        <Panel icon={Globe} title="Where leads come from" subtitle={`${nf.format(sourceTotal)} leads by primary source`}>
          {overview.leadsBySource.length > 0 ? (
            <>
              <div className="di-donut">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={overview.leadsBySource}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={54}
                      outerRadius={78}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {overview.leadsBySource.map((r, i) => (
                        <Cell key={r.name} fill={SERIES[i % SERIES.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="di-donut__center">
                  <strong>{nf.format(sourceTotal)}</strong>
                  <span>leads</span>
                </div>
              </div>
              {/* The legend carries the numbers, so the chart never relies on
                  colour alone — which the light palette's contrast requires. */}
              <ul className="di-legend">
                {overview.leadsBySource.map((r, i) => (
                  <li key={r.name}>
                    <span className="di-legend__dot" style={{ background: SERIES[i % SERIES.length] }} />
                    <span className="di-legend__name" title={r.name}>{r.name}</span>
                    <span className="di-legend__value">{nf.format(r.value)}</span>
                    <span className="di-legend__pct">
                      {sourceTotal > 0 ? Math.round((r.value / sourceTotal) * 100) : 0}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : <Empty>No lead sources recorded yet.</Empty>}
        </Panel>
      </div>

      {/* ---- Breakdowns -------------------------------------------------- */}
      <div className="di-grid di-grid--4">
        <Panel icon={Briefcase} title="Opportunity pipeline" subtitle="By stage">
          <RankedBars rows={overview.opportunitiesByStage} colors={SERIES} />
        </Panel>

        <Panel icon={Activity} title="Lead status" subtitle="Across every lead">
          <RankedBars
            rows={overview.leadsByStatus}
            colors={SERIES}
            onRowClick={(r) => navigate(`/leads?status=${encodeURIComponent(r.name)}`)}
          />
        </Panel>

        <Panel icon={MapPin} title="Projects" subtitle="By status">
          <RankedBars rows={overview.projectsByStatus} colors={SERIES} />
        </Panel>

        <Panel icon={Users} title="Lead owners" subtitle="Who holds the pipeline">
          <RankedBars rows={overview.leadsByOwner.slice(0, 6)} colors={SERIES} />
        </Panel>
      </div>

      {/* ---- Work due + revenue ------------------------------------------ */}
      <div className="di-grid di-grid--2-1">
        <Panel icon={CalendarClock} title="What needs attention" subtitle="Follow-ups and site visits">
          <div className="di-work">
            <button type="button" className="di-work__item is-urgent" onClick={() => navigate('/follow-up-leads')}>
              <Clock size={16} />
              <strong>{nf.format(workload.followUpsOverdue)}</strong>
              <span>Follow-ups overdue</span>
            </button>
            <button type="button" className="di-work__item" onClick={() => navigate('/follow-up-leads')}>
              <CalendarClock size={16} />
              <strong>{nf.format(workload.followUpsToday)}</strong>
              <span>Due today</span>
            </button>
            <button type="button" className="di-work__item" onClick={() => navigate('/follow-up-leads')}>
              <CalendarClock size={16} />
              <strong>{nf.format(workload.followUpsThisWeek)}</strong>
              <span>Due this week</span>
            </button>
            <button type="button" className="di-work__item" onClick={() => navigate('/site-visits')}>
              <MapPin size={16} />
              <strong>{nf.format(workload.siteVisitsUpcoming)}</strong>
              <span>Site visits ahead</span>
            </button>
            <button type="button" className="di-work__item" onClick={() => navigate('/site-visits')}>
              <CheckCircle2 size={16} />
              <strong>{nf.format(workload.siteVisitsCompleted)}</strong>
              <span>Site visits done</span>
            </button>
          </div>
        </Panel>

        <Panel icon={TrendingUp} title="Booked value" subtitle="From opportunity booking amounts">
          {revenue.recordedOn > 0 ? (
            <div className="di-revenue">
              <strong>₹{nf.format(revenue.booked)}</strong>
              <span>
                across {revenue.recordedOn} of {revenue.outOf} opportunities
              </span>
            </div>
          ) : (
            <Empty>
              None of the {revenue.outOf} opportunities has a booking amount recorded,
              so there is no value to total yet.
            </Empty>
          )}
        </Panel>
      </div>

      {/* ---- Recent ------------------------------------------------------- */}
      <div className="di-grid di-grid--3 di-grid--recent">
        <Panel
          icon={Users}
          title="Recent leads"
          action={<button type="button" className="di-panel__action" onClick={() => navigate('/leads')}>View all</button>}
        >
          {overview.recentLeads.length > 0 ? (
            <ul className="di-list">
              {overview.recentLeads.map((l) => (
                <li key={l.id}>
                  <button type="button" className="di-list__row" onClick={() => navigate(`/leads/${l.id}`)}>
                    <span className="di-list__main">
                      <strong>{l.name || 'Unnamed lead'}</strong>
                      <span>{l.primarySource || 'No source'} · {l.owner || 'Unassigned'}</span>
                    </span>
                    <span className="di-list__tag">{l.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Empty>No leads yet.</Empty>}
        </Panel>

        <Panel
          icon={Briefcase}
          title="Recent opportunities"
          action={<button type="button" className="di-panel__action" onClick={() => navigate('/opportunities')}>View all</button>}
        >
          {overview.recentOpportunities.length > 0 ? (
            <ul className="di-list">
              {overview.recentOpportunities.map((o) => (
                <li key={o.id}>
                  <button type="button" className="di-list__row" onClick={() => navigate(`/opportunities/${o.id}`)}>
                    <span className="di-list__main">
                      <strong>{o.opportunityName || o.oppId || 'Unnamed'}</strong>
                      <span>{o.LeadsProject || 'No project'} · {o.opportunityOwner || 'Unassigned'}</span>
                    </span>
                    <span className="di-list__tag">{o.stage}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Empty>No opportunities yet.</Empty>}
        </Panel>

        <Panel icon={Activity} title="Recent activity" subtitle="Across every lead">
          {overview.recentActivity.length > 0 ? (
            <ul className="di-feed">
              {overview.recentActivity.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="di-feed__row"
                    onClick={() => a.leadId && navigate(`/leads/${a.leadId}`)}
                  >
                    <span className="di-feed__dot" />
                    <span className="di-feed__body">
                      <strong>{a.title}</strong>
                      {a.subtitle && <span>{a.subtitle}</span>}
                      <span className="di-feed__when">
                        {new Date(a.date).toLocaleString('en-GB', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true,
                        })}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <Empty>Nothing has happened yet.</Empty>}
        </Panel>
      </div>
    </div>
  );
}

/**
 * The dashboard page re-renders on every keystroke in its user search and on
 * every dropdown toggle. This section is eight sparklines, an area chart and a
 * pie chart — none of which depend on any of that — so it only re-renders when
 * the data or the callback actually changes.
 */
export default memo(DashboardInsights);
