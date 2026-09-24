import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import focusNextField from '../ui/focusNextField';
import { createPortal } from 'react-dom';
import { ChevronDown, Plus, X } from 'lucide-react';
import { canDelete } from '../utils/currentUser';
import useLiveRefresh from '../utils/useLiveRefresh';
import { resourceFromPath } from '../utils/dataBus';
import './DynamicDropdown.css';

/**
 * Select-with-add-new, backed by a REST collection.
 *
 * @param {string} apiUrl          collection endpoint, e.g. '/api/projects'
 * @param {string} displayKey      field shown in the list, e.g. 'projectName'
 * @param {string} valueKey        field stored as the value, e.g. 'projectName'
 * @param {string} postPayloadKey  field sent when adding, e.g. 'projectName'
 *
 * `valueKey` matters: leads store the project/source *name*, not its id, so
 * these are usually the same field rather than 'id'.
 */
export default function DynamicDropdown({
    apiUrl,
    displayKey = 'name',
    valueKey = 'id',
    postPayloadKey = 'name',
    placeholder = 'Select option',
    value,
    name,
    required,
    onChange,
    onFetch,
    /* Choosing an option steps to the next field, as Enter does in a text
       field. */
    advanceOnPick = true,
}) {
    const [options, setOptions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newOption, setNewOption] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [internalValue, setInternalValue] = useState(value || '');
    const containerRef = useRef(null);
    const menuRef = useRef(null);
    const [menuPos, setMenuPos] = useState(null);

    useEffect(() => {
        if (value !== undefined) setInternalValue(value);
    }, [value]);

    const handleChange = (newVal) => {
        setInternalValue(newVal);
        if (onChange) onChange({ target: { name, value: newVal } });
    };

    /* Guard the missing-URL case loudly. Passing the wrong prop name used to
       leave apiUrl undefined, which made fetch() request the current page,
       receive HTML, and silently end up with zero options — and made "Add
       new..." look broken for the same reason. */
    const fetchOptions = useCallback(async () => {
        if (!apiUrl) {
            console.error('DynamicDropdown: no apiUrl given, so there is nothing to load.');
            setError('This dropdown is misconfigured.');
            return;
        }
        try {
            const res = await fetch(apiUrl);
            if (!res.ok) {
                setError(`Could not load options (${res.status}).`);
                return;
            }
            const data = await res.json();
            setOptions(Array.isArray(data) ? data : []);
            setError('');
            if (onFetch) onFetch(data);
        } catch (err) {
            console.error('Failed to fetch options for dropdown', err);
            setError('Could not reach the server.');
        }
        // onFetch is usually an inline arrow; depending on it would refetch forever.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiUrl]);

    useEffect(() => { fetchOptions(); }, [fetchOptions]);

    /* The collection this dropdown lists can be added to from anywhere — most
       often from another copy of this very component, since "Add new..." posts
       to the same endpoint. Keyed off apiUrl so each instance listens only for
       its own kind of row. */
    useLiveRefresh(resourceFromPath(apiUrl), () => { fetchOptions(); });

    /* The menu renders in a portal on <body>. Anchored absolutely inside its
       own container it was clipped by any scrolling ancestor — inside a modal
       the "Add new..." row was cut clean off. */
    const positionMenu = useCallback(() => {
        const trigger = containerRef.current;
        if (!trigger) return;
        const r = trigger.getBoundingClientRect();
        const menuHeight = menuRef.current?.offsetHeight || 260;
        const spaceBelow = window.innerHeight - r.bottom;
        // Flip above the field when there isn't room underneath.
        const dropUp = spaceBelow < menuHeight + 8 && r.top > spaceBelow;
        setMenuPos({
            left: r.left,
            width: r.width,
            top: dropUp ? undefined : r.bottom + 4,
            bottom: dropUp ? window.innerHeight - r.top + 4 : undefined,
            maxHeight: Math.max(160, (dropUp ? r.top : spaceBelow) - 12),
        });
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) { setMenuPos(null); return undefined; }
        positionMenu();
        // Reposition while the page moves; capture catches scrolling in any
        // ancestor, not just the window.
        window.addEventListener('scroll', positionMenu, true);
        window.addEventListener('resize', positionMenu);
        return () => {
            window.removeEventListener('scroll', positionMenu, true);
            window.removeEventListener('resize', positionMenu);
        };
    }, [isOpen, positionMenu, isAdding, options.length]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            // The menu lives outside the container now, so check both.
            const inTrigger = containerRef.current?.contains(e.target);
            const inMenu = menuRef.current?.contains(e.target);
            if (!inTrigger && !inMenu) {
                setIsOpen(false);
                setIsAdding(false);
                setNewOption('');
                setError('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleDelete = async (e, id, label) => {
        e.stopPropagation();
        // Name what is going. "this option" reads the same whether you clicked
        // the row you meant or the one above it.
        if (!await window.appConfirm(`Delete "${label}" from the list? This cannot be undone.`)) return;
        try {
            const res = await fetch(`${apiUrl}/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message || 'Could not delete that option.');
                return;
            }
            // If the deleted option was selected, clear it.
            const deletedOpt = options.find(o => o.id === id);
            if (deletedOpt && String(deletedOpt[valueKey]) === String(internalValue)) {
                handleChange('');
            }
            fetchOptions();
        } catch (err) {
            console.error('Failed to delete option', err);
            setError('Could not reach the server.');
        }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        const label = newOption.trim();
        if (!label || !apiUrl || isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [postPayloadKey]: label }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.message || `Could not add "${label}".`);
                return;
            }
            const created = await res.json().catch(() => null);
            setIsAdding(false);
            setNewOption('');
            await fetchOptions();
            // Select what was just added — that is nearly always the intent.
            if (created && created[valueKey] !== undefined) {
                handleChange(created[valueKey]);
                setIsOpen(false);
            }
        } catch (err) {
            console.error('Failed to add new option', err);
            setError('Could not reach the server.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const mayDelete = canDelete();
    const selectedOpt = options.find(o => String(o[valueKey]) === String(internalValue));
    const displayText = selectedOpt ? selectedOpt[displayKey] : (internalValue || placeholder);

    return (
        <div className="dynamic-dropdown-container" ref={containerRef}>
            <input type="hidden" name={name} value={internalValue || ''} required={required} />
            <div
                className={`dynamic-dropdown-header ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsOpen(o => !o); }
                    if (e.key === 'Escape') setIsOpen(false);
                }}
                role="button"
                aria-expanded={isOpen}
                tabIndex="0"
            >
                <span className={internalValue ? '' : 'is-placeholder'}>{displayText}</span>
                <ChevronDown size={14} className="dropdown-icon" />
            </div>

            {isOpen && createPortal(
                <div
                    className="dynamic-dropdown-menu"
                    ref={menuRef}
                    style={{
                        position: 'fixed',
                        left: menuPos?.left,
                        top: menuPos?.top,
                        bottom: menuPos?.bottom,
                        width: menuPos?.width,
                        maxHeight: menuPos?.maxHeight,
                        // Hidden until measured, so it never flashes at 0,0.
                        visibility: menuPos ? 'visible' : 'hidden',
                    }}
                >
                    <div className="dynamic-dropdown-list">
                        <div
                            className="dynamic-dropdown-item placeholder"
                            // Clearing the field is a choice too, so it steps on
                            // like any other.
                            onClick={() => {
                              handleChange('');
                              setIsOpen(false);
                              if (advanceOnPick) focusNextField(containerRef.current?.querySelector('.dynamic-dropdown-header'));
                            }}
                        >
                            {placeholder}
                        </div>
                        {options.map((opt) => (
                            <div
                                key={opt.id}
                                className={`dynamic-dropdown-item ${String(opt[valueKey]) === String(internalValue) ? 'selected' : ''}`}
                                /* Choosing finishes the field, so focus steps
                                   on to the next one — the same move Enter
                                   makes in a text field. */
                                onClick={() => {
                                  handleChange(opt[valueKey]);
                                  setIsOpen(false);
                                  if (advanceOnPick) focusNextField(containerRef.current?.querySelector('.dynamic-dropdown-header'));
                                }}
                            >
                                <span>{opt[displayKey]}</span>
                                {/* Every master's DELETE route is superadmin-only,
                                    so for anyone else this button could do nothing
                                    but return 403. */}
                                {mayDelete && (
                                    <button
                                        type="button"
                                        className="btn-delete-opt"
                                        onClick={(e) => handleDelete(e, opt.id, opt[displayKey])}
                                        title="Delete"
                                        aria-label={`Delete ${opt[displayKey]}`}
                                    >
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {options.length === 0 && !error && (
                            <p className="dynamic-dropdown-empty">
                                Nothing here yet — add the first one below.
                            </p>
                        )}
                    </div>

                    {error && <p className="dynamic-dropdown-error" role="alert">{error}</p>}

                    <div className="dynamic-dropdown-footer">
                        {!isAdding ? (
                            <button
                                type="button"
                                className="btn-add-new"
                                onClick={(e) => { e.stopPropagation(); setIsAdding(true); }}
                            >
                                <Plus size={14} /> Add new...
                            </button>
                        ) : (
                            <div className="dynamic-dropdown-add-form" onClick={(e) => e.stopPropagation()}>
                                <input
                                    type="text"
                                    placeholder="New option..."
                                    value={newOption}
                                    onChange={(e) => setNewOption(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); handleAdd(e); }
                                        if (e.key === 'Escape') { setIsAdding(false); setNewOption(''); }
                                    }}
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    className="btn-save-new"
                                    onClick={handleAdd}
                                    disabled={isSubmitting || !newOption.trim()}
                                >
                                    {isSubmitting ? '...' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    className="btn-cancel-new"
                                    onClick={() => { setIsAdding(false); setNewOption(''); setError(''); }}
                                >
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
