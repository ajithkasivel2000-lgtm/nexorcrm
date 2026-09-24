import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, Briefcase, Calendar, CheckCircle, ChevronDown, Copy, Filter,
  FolderOpen, MoreVertical, Phone, Star, TrendingDown, TrendingUp, User, XCircle,
} from 'lucide-react';
import './ProjectStatusBoard.css';

/**
 * The Project Status board.
 *
 * Every figure on it comes from /api/dashboard — the count for the selected
 * window, the same count for the window before it, and a day-by-day series for
 * the bars. None of it is worked out here; this file decides how it reads, not
 * what it says.
 *
 * The one thing worth knowing before trusting the bars: a tile counts leads
 * that are AT a status and were CREATED inside the window, not leads that
 * entered that status during it. Nothing in the database records when a lead
 * reached a status, so the honest series is the one drawn from created dates.
 * projectStatusStats.js on the server says the same thing at more length.
 */

/* The icon and colour for each tile. Keyed by the same names the server
   returns, so a tile the server stops sending simply stops appearing. */
const LOOK = {
  'Today Leads': { icon: Calendar, tone: 'blue' },
  'New Lead': { icon: User, tone: 'green' },
  Attempted: { icon: Phone, tone: 'slate' },
  Interested: { icon: Star, tone: 'amber' },
  Allocate: { icon: User, tone: 'cyan' },
  'Site Visit': { icon: Calendar, tone: 'blue' },
  Rejected: { icon: XCircle, tone: 'red' },
  Duplicate: { icon: Copy, tone: 'slate' },
  Opportunity: { icon: Briefcase, tone: 'green' },
  'Missed Follow Up': { icon: AlertCircle, tone: 'amber' },
  'Site Visit Done': { icon: CheckCircle, tone: 'green' },
  'Site Visit Confirmed': { icon: CheckCircle, tone: 'blue' },
  'Re Scheduled Visit': { icon: Calendar, tone: 'amber' },
  'Site Visit Scheduled': { icon: Calendar, tone: 'blue' },
};

/**
 * Where "View details" goes.
 *
 * The Leads page filters by tab, not by every individual status, so a tile
 * lands on the closest tab that actually exists rather than on a query string
 * nothing reads. Anything without a tab of its own opens the full list.
 */
const DESTINATION = {
  Duplicate: '/leads?tab=duplicate-leads',
  Rejected: '/leads?tab=rejected-leads',
  'Missed Follow Up': '/leads?tab=follow-up',
  'Site Visit': '/leads?tab=site-visit',
  'Site Visit Done': '/leads?tab=site-visit',
  'Site Visit Confirmed': '/leads?tab=site-visit',
  'Re Scheduled Visit': '/leads?tab=site-visit',
  'Site Visit Scheduled': '/leads?tab=site-visit',
  Opportunity: '/opportunities',
};

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const pretty = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/** The little bar chart. Drawn as one SVG so there is nothing to lay out. */
function Bars({ series, tone }) {
  const max = Math.max(1, ...series);
  const n = series.length || 1;
  const slot = 100 / n;
  return (
    <svg className="psb-bars" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      {series.map((v, i) => {
        /* A day with nothing still gets a sliver, so the chart reads as a row
           of days rather than as missing data. */
        const h = v === 0 ? 2 : Math.max(3, (v / max) * 26);
        return (
          <rect
            key={i}
            className={`psb-bar is-${tone}`}
            x={i * slot + slot * 0.18}
            y={28 - h}
            width={slot * 0.64}
            height={h}
            rx={slot * 0.2}
          />
        );
      })}
    </svg>
  );
}

function Tile({ tile, onOpen }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const look = LOOK[tile.key] || { icon: FolderOpen, tone: 'slate' };
  const Icon = look.icon;

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const up = tile.change > 0;
  const flat = !tile.change;
  const Trend = up ? TrendingUp : TrendingDown;

  return (
    <div className={`psb-tile is-${look.tone}`}>
      <div className="psb-tile__head">
        <span className="psb-tile__icon"><Icon size={18} /></span>
        <span className="psb-tile__label" title={tile.key}>{tile.key}</span>

        <div className="psb-tile__menu" ref={menuRef}>
          <button
            type="button"
            className="psb-tile__menu-btn"
            aria-label={`Options for ${tile.key}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <div className="psb-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpen(); }}>
                View details
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  navigator.clipboard?.writeText(`${tile.key}: ${tile.count}`).catch(() => { });
                  setMenuOpen(false);
                }}
              >
                Copy figure
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="psb-tile__value">{tile.count}</p>

      <div className="psb-tile__foot">
        <span className={`psb-tile__change${flat ? ' is-flat' : up ? ' is-up' : ' is-down'}`}>
          <Trend size={13} aria-hidden="true" />
          {up ? '+' : ''}{tile.change}%
        </span>
        <span className="psb-tile__basis">{tile.basis}</span>
        <Bars series={tile.series || []} tone={look.tone} />
      </div>

      <button type="button" className="psb-tile__link" onClick={onOpen}>
        View Details <span aria-hidden="true">&rarr;</span>
      </button>
    </div>
  );
}

/**
 * @param {Array}  tiles          the server's projectStatus block
 * @param {Array}  projects       for the project filter
 * @param {string} selectedProject
 * @param {Function} onProjectChange
 * @param {object} range          { from, to } as Date or ISO
 * @param {Function} onRangeChange
 */
export default function ProjectStatusBoard({
  tiles = [], loading, projects = [], selectedProject, onProjectChange,
  range, onRangeChange,
}) {
  const navigate = useNavigate();
  const [projectOpen, setProjectOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(false);
  const projectRef = useRef(null);
  const rangeRef = useRef(null);

  useEffect(() => {
    const close = (e) => {
      if (projectRef.current && !projectRef.current.contains(e.target)) setProjectOpen(false);
      if (rangeRef.current && !rangeRef.current.contains(e.target)) setRangeOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const shown = useMemo(
    () => (hideEmpty ? tiles.filter((t) => t.count > 0) : tiles),
    [tiles, hideEmpty],
  );

  const open = (tile) => navigate(DESTINATION[tile.key] || '/leads');

  return (
    <section className="psb">
      <header className="psb__head">
        <span className="psb__head-icon"><FolderOpen size={18} /></span>
        <div className="psb__head-text">
          <h3>Project Status</h3>
          <p>Real-time overview of project activities and customer engagement</p>
        </div>

        <div className="psb__controls">
          {/* Project */}
          <div className="psb__control" ref={projectRef}>
            <button type="button" className="psb__btn" onClick={() => setProjectOpen((v) => !v)}>
              <FolderOpen size={15} />
              <span>{selectedProject}</span>
              <ChevronDown size={14} className={projectOpen ? 'is-open' : undefined} />
            </button>
            {projectOpen && (
              <ul className="psb__menu">
                <li>
                  <button
                    type="button"
                    className={selectedProject === 'All Projects' ? 'is-active' : undefined}
                    onClick={() => { onProjectChange('All Projects'); setProjectOpen(false); }}
                  >
                    All Projects
                  </button>
                </li>
                {projects.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className={selectedProject === p.projectName ? 'is-active' : undefined}
                      onClick={() => { onProjectChange(p.projectName); setProjectOpen(false); }}
                    >
                      {p.projectName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Date range */}
          <div className="psb__control" ref={rangeRef}>
            <button type="button" className="psb__btn" onClick={() => setRangeOpen((v) => !v)}>
              <Calendar size={15} />
              <span>{pretty(range.from)} &ndash; {pretty(range.to)}</span>
              <ChevronDown size={14} className={rangeOpen ? 'is-open' : undefined} />
            </button>
            {rangeOpen && (
              <div className="psb__range">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={iso(range.from)}
                    max={iso(range.to)}
                    onChange={(e) => e.target.value && onRangeChange({ ...range, from: new Date(e.target.value) })}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={iso(range.to)}
                    min={iso(range.from)}
                    onChange={(e) => e.target.value && onRangeChange({ ...range, to: new Date(e.target.value) })}
                  />
                </label>
                <div className="psb__range-presets">
                  {[['7 days', 7], ['30 days', 30], ['90 days', 90]].map(([label, days]) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => {
                        const to = new Date();
                        onRangeChange({ from: new Date(to.getTime() - days * 86400000), to });
                        setRangeOpen(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Hide the tiles sitting at zero — on a quiet week that is most of
              them, and an empty tile is noise rather than information. */}
          <button
            type="button"
            className={`psb__btn psb__btn--icon${hideEmpty ? ' is-on' : ''}`}
            onClick={() => setHideEmpty((v) => !v)}
            title={hideEmpty ? 'Showing tiles with activity' : 'Hide tiles with no activity'}
            aria-pressed={hideEmpty}
          >
            <Filter size={15} />
          </button>
        </div>
      </header>

      {loading ? (
        <div className="psb-grid">
          {Array.from({ length: 10 }, (_, i) => <div key={i} className="psb-tile is-skeleton" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="psb__empty">
          {tiles.length === 0
            ? 'No figures for this period yet.'
            : 'Nothing has activity in this period. Turn the filter off to see every status.'}
        </p>
      ) : (
        <div className="psb-grid">
          {shown.map((tile) => (
            <Tile key={tile.key} tile={tile} onOpen={() => open(tile)} />
          ))}
        </div>
      )}
    </section>
  );
}
