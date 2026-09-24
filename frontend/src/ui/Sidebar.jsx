import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import SearchInput from './SearchInput';
import './Sidebar.css';

/**
 * Application sidebar.
 *
 * Accepts the existing menu shape unchanged:
 *   [{ title, items: [{ name, path, icon, pageId, subItems: [{name, path}] }] }]
 *
 * `icon` may be a rendered element (<Home size={18} />) or a component.
 *
 * Collapsing keeps the rail visible with icons only; hovering the rail expands
 * it temporarily so a collapsed sidebar is still navigable without unpinning.
 */
export default function Sidebar({
  sections = [],
  currentPath = '/',
  onNavigate,
  pinned = true,
  onPinnedChange,
  logo,
  logoIcon,
  footer,
  searchable = true,
}) {
  const [hovered, setHovered] = useState(false);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const navRef = useRef(null);

  const open = pinned || hovered;

  const isItemActive = (item) => {
    if (item.path) {
      return item.path === '/' ? currentPath === '/' : currentPath.startsWith(item.path);
    }
    return item.subItems?.some((s) => s.path === currentPath) || false;
  };

  /* Filter by search across both parent and child labels. A parent survives if
     it matches itself or any of its children, and matching children are kept. */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((section) => {
        const items = section.items.reduce((acc, item) => {
          const selfMatch = item.name.toLowerCase().includes(q);
          const subs = item.subItems?.filter((s) => s.name.toLowerCase().includes(q)) || [];
          if (selfMatch) acc.push(item);
          else if (subs.length) acc.push({ ...item, subItems: subs });
          return acc;
        }, []);
        return { ...section, items };
      })
      .filter((s) => s.items.length > 0);
  }, [sections, query]);

  /* Auto-open the group that owns the current route, so a deep link doesn't
     land on a page whose parent menu is collapsed. */
  useEffect(() => {
    const owner = sections
      .flatMap((s) => s.items)
      .find((item) => item.subItems?.some((sub) => sub.path === currentPath));
    if (owner) setExpanded((prev) => new Set(prev).add(owner.name));
  }, [currentPath, sections]);

  // While searching, reveal every matching group.
  useEffect(() => {
    if (!query.trim()) return;
    setExpanded(new Set(filtered.flatMap((s) => s.items.map((i) => i.name))));
  }, [query, filtered]);

  const toggleGroup = (name) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const go = (path) => {
    if (!path) return;
    onNavigate?.(path);
    setHovered(false);
  };

  const renderIcon = (icon) => {
    if (!icon) return null;
    if (typeof icon === 'function') {
      const Icon = icon;
      return <Icon size={18} aria-hidden="true" />;
    }
    return icon;
  };

  return (
    <aside
      className={`nx-sidebar nx-scope ${open ? 'is-open' : 'is-collapsed'}`}
      onMouseEnter={() => !pinned && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* ---- Brand ------------------------------------------------------- */}
      <div className="nx-sidebar__brand">
        <div className="nx-sidebar__logo">
          {open ? logo : (logoIcon || logo)}
        </div>
        <button
          type="button"
          className="nx-sidebar__pin"
          onClick={() => onPinnedChange?.(!pinned)}
          aria-label={pinned ? 'Collapse sidebar' : 'Pin sidebar open'}
          title={pinned ? 'Collapse sidebar' : 'Pin sidebar open'}
        >
          {pinned ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
      </div>

      {/* ---- Search ------------------------------------------------------ */}
      {searchable && open && (
        <SearchInput
          className="nx-sidebar__search"
          tone="inverse"
          size="sm"
          placeholder="Search menu..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {/* ---- Navigation -------------------------------------------------- */}
      <nav className="nx-sidebar__nav" ref={navRef}>
        {filtered.length === 0 && (
          <p className="nx-sidebar__no-results">No menu items match “{query}”.</p>
        )}

        {filtered.map((section) => (
          <div className="nx-sidebar__section" key={section.title}>
            {open && <p className="nx-sidebar__section-title">{section.title}</p>}
            <ul className="nx-sidebar__list">
              {section.items.map((item) => {
                const active = isItemActive(item);
                const hasSub = item.subItems?.length > 0;
                const isOpen = expanded.has(item.name);

                return (
                  <li key={item.name}>
                    <button
                      type="button"
                      className={`nx-sidebar__item ${active ? 'is-active' : ''}`}
                      onClick={() => (hasSub ? toggleGroup(item.name) : go(item.path))}
                      aria-expanded={hasSub ? isOpen : undefined}
                      aria-current={active && !hasSub ? 'page' : undefined}
                      // The title gives collapsed-rail users a native tooltip.
                      title={!open ? item.name : undefined}
                    >
                      <span className="nx-sidebar__icon">{renderIcon(item.icon)}</span>
                      <span className="nx-sidebar__label">{item.name}</span>
                      {hasSub && (
                        <ChevronDown
                          size={14}
                          className={`nx-sidebar__chevron ${isOpen ? 'is-open' : ''}`}
                          aria-hidden="true"
                        />
                      )}
                    </button>

                    {hasSub && isOpen && open && (
                      <ul className="nx-sidebar__sublist">
                        {item.subItems.map((sub) => (
                          <li key={sub.path}>
                            <button
                              type="button"
                              className={`nx-sidebar__subitem ${currentPath === sub.path ? 'is-active' : ''}`}
                              onClick={() => go(sub.path)}
                              aria-current={currentPath === sub.path ? 'page' : undefined}
                            >
                              <span className="nx-sidebar__dot" aria-hidden="true" />
                              {sub.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {footer && <div className="nx-sidebar__footer">{footer}</div>}
    </aside>
  );
}
