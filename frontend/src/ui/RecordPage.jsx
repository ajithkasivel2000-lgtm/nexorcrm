import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Eye, EyeOff, Lock, Paperclip, Upload, User, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useRecordViewOnly } from './RecordViewContext';
import focusNextField, { isPlainEnter } from './focusNextField';
import { boundsFor } from '../utils/dateBounds';
import DynamicDropdown from '../components/DynamicDropdown';
import PhoneInput from './PhoneInput';
import Select from './Select';
import { DEFAULT_DIAL, validateNumber } from './countries';
import './RecordPage.css';

/* ===========================================================================
   The record page kit.

   One layout and one set of field controls for every screen that shows a
   single record — lead, opportunity, channel partner, project, profile.
   Each of those had its own bespoke field component with its own edit
   behaviour, so the same action felt different depending on where you were.

   The contract is the same everywhere: fields edit in place, commit on blur or
   Enter, restore on Escape, and never write unless the value actually changed.
   =========================================================================== */

/**
 * Page shell: a sticky bar carrying the breadcrumb and a Back control, an
 * optional tab row, and the body.
 *
 * The bar is sticky because these pages are long — without it, the only way
 * out of a record was to scroll back to the top.
 *
 * Going back takes `onBack` when there is one and `backTo` otherwise. Not
 * every record is its own route: a screen shown by a parent's state, at the
 * same URL as the list behind it, cannot be left by navigating — the path
 * never changes, so nothing re-renders and the button appears dead. Those
 * screens pass a callback; the rest keep passing a path.
 */


export function RecordPage({
  crumbs = [],
  title,
  backTo,
  onBack,
  backLabel = 'Back',
  tabs,
  activeTab,
  onTabChange,
  actions,
  children,
  className = '',
}) {
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const topbarRef = useRef(null);

  /* Publish the header's real height as --nx-rec-topbar-h, so anything that
     docks below it — the lead profile's sub-tabs, its side rail — knows where
     the sticky block ends. The tabs no longer need it: they are inside it.

     Before paint, so the strip is never briefly in the wrong place, and again
     whenever the bar resizes — the window narrowing, a status control
     appearing, the browser being zoomed. */
  useLayoutEffect(() => {
    const bar = topbarRef.current;
    const root = rootRef.current;
    if (!bar || !root) return undefined;

    const measure = () => {
      const { height } = bar.getBoundingClientRect();
      if (height > 0) root.style.setProperty('--nx-rec-topbar-h', `${Math.round(height)}px`);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      // Older browsers keep the stylesheet's estimate and a resize listener.
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
    // Once: the refs are stable and the observer reports every later change,
    // so re-running per render would only rebuild the same observer.
  }, []);

  return (
    <div className={`nx-rec ${className}`.trim()} ref={rootRef}>
      {/* The bar and the tabs stick as one block, so there is no offset
          between them to get wrong and no way for one to cover the other. */}
      <div className="nx-rec__header" ref={topbarRef}>
        <div className="nx-rec__topbar">
          <nav className="nx-rec__crumb">
            {crumbs.length > 0 ? (
              <span className="is-current" style={{ fontSize: '18px', fontWeight: '600', color: 'var(--nx-text)' }}>
                {crumbs[crumbs.length - 1].label}{title ? ` : ${title}` : ''}
              </span>
            ) : title ? (
              <span className="is-current" style={{ fontSize: '18px', fontWeight: '600', color: 'var(--nx-text)' }}>
                {title}
              </span>
            ) : null}
          </nav>
          {actions}
          {(onBack || backTo) && (
            <button
              type="button"
              className="nx-rec__back"
              onClick={() => (onBack ? onBack() : navigate(backTo))}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              <span>{backLabel}</span>
            </button>
          )}
        </div>

        {tabs && tabs.length > 0 && (
          <div className="nx-rec__tabs" role="tablist">
            {tabs.map(({ key, label, icon: TabIcon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={activeTab === key}
                className={`nx-rec__tab${activeTab === key ? ' is-active' : ''}`}
                onClick={() => onTabChange?.(key)}
              >
                {TabIcon && <TabIcon size={14} />} {label || key}
              </button>
            ))}
          </div>
        )}
      </div>

      {children}
    </div>
  );
}

/** The column grid. `cols` is how many columns at full width. */
export function RecordGrid({ cols = 3, children, className = '' }) {
  return <div className={`nx-rec__grid nx-rec__grid--${cols} ${className}`.trim()}>{children}</div>;
}

/** One column of cards. */
export function RecordColumn({ children, className = '' }) {
  return <div className={`nx-rec__col ${className}`.trim()}>{children}</div>;
}

/** A titled card with an icon and an optional pill or control in its header. */
export function RecordCard({ icon: Icon, title, subtitle, aside, children, className = '' }) {
  return (
    <section className={`nx-rec-card ${className}`.trim()}>
      {(title || Icon || aside) && (
        <header className="nx-rec-card__head">
          {Icon && <span className="nx-rec-card__icon"><Icon size={16} /></span>}
          <div className="nx-rec-card__titles">
            {title && <h2 className="nx-rec-card__title">{title}</h2>}
            {subtitle && <p className="nx-rec-card__sub">{subtitle}</p>}
          </div>
          {aside}
        </header>
      )}
      <div className="nx-rec-card__body">{children}</div>
    </section>
  );
}

/** The field grid inside a card. */
export function RecordFields({ cols = 2, children, className = '' }) {
  return <div className={`nx-rec-fields nx-rec-fields--${cols} ${className}`.trim()}>{children}</div>;
}

/**
 * The confirm/discard pair an edited field grows until it is saved.
 *
 * Nothing in this kit writes on blur any more, so an edit needs somewhere to
 * be committed from. A text field has Enter; a dropdown, a file picker or an
 * owner menu has no such key, so this is the only way to save one — it appears
 * on any field whose draft differs from the stored value and disappears once
 * the two agree again.
 *
 * `onMouseDown` is prevented so clicking the tick does not move focus out of
 * the field first, which would be a visible flicker on the way to saving.
 */
function FieldCommit({ dirty, onCommit, onCancel, label = 'change' }) {
  if (!dirty) return null;
  return (
    <span className="nx-rec-field__commit">
      <button
        type="button"
        className="nx-rec-field__commit-btn is-save"
        onMouseDown={(e) => e.preventDefault()}
        /* Called with no arguments on purpose: callers pass RecordField's
           commit() directly, and that now takes an optional value as its first
           parameter. Forwarding the click event would hand it a MouseEvent to
           save instead of the field's own draft. */
        onClick={() => onCommit?.()}
        title="Save (Enter)"
        aria-label={`Save ${label}`}
      >
        <Check size={14} />
      </button>
      <button
        type="button"
        className="nx-rec-field__commit-btn is-cancel"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onCancel?.()}
        title="Discard (Esc)"
        aria-label={`Discard ${label}`}
      >
        <X size={14} />
      </button>
    </span>
  );
}

/**
 * One editable field, in either of the two shapes this app needs.
 *
 * `onSave` is for a record that writes one field at a time. Nothing is written
 * as you move around: type, then press Enter or click the tick that appears.
 * Tab and blur only move the cursor, Escape restores the stored value, and a
 * draft that matches what is stored is never sent.
 *
 * `onChange` is for a page with its own Save button: it fires on every
 * keystroke so the form's state is never a blur behind what is on screen —
 * clicking Save straight after typing would otherwise post the previous value.
 *
 * A screen uses one or the other, not both.
 */
export function RecordField({
  label,
  value,
  icon: Icon,
  type = 'text',
  inputMode,
  pattern,
  options,
  multiline = false,
  readOnly = false,
  required = false,
  placeholder = '',
  onSave,
  onChange,
  suffix,
  // A caller that validates as you type supplies these; `validate` is for
  // the commit-time check instead.
  error: externalError,
  hint,
  hintTone = 'muted',
  action = null,
  full = false,
  validate,
  normalize,
  autoComplete,
  /* Enter steps to the next field. Off for a field whose Enter already means
     something else. */
  enterAdvances = true,
  /* Dropdown only: choosing an option saves it there and then, so no tick
     appears. For a field whose every value opens a dialog of its own — the
     pick is already the decision, and a tick in between asks a second time for
     something the next screen is about to confirm anyway. Off by default: a
     plain field must still be reviewable before it is written. */
  saveOnPick = false,
  /* Date fields only: 'future' greys out everything before now, 'past' greys
     out everything after it. Left unset the field takes any date, which is the
     right answer for one that genuinely goes both ways. */
  when = null,
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [ownError, setOwnError] = useState('');
  // A locked record wins over whatever this field was told.
  const locked = useRecordViewOnly();
  readOnly = readOnly || locked;
  const editable = !readOnly && (onSave || onChange);
  const error = externalError || ownError;

  useEffect(() => { setDraft(value ?? ''); setOwnError(''); }, [value]);

  const type_ = (next) => {
    setDraft(next);
    if (error) setOwnError('');
    onChange?.(next);
  };

  /* Returns whether the field is settled — saved, or unchanged and so nothing
     to save. False only when validation refused it, which is what keeps Enter
     from stepping past a field the user still has to fix. */
  const commit = (raw = draft) => {
    if (readOnly || !onSave) return false;   // the onChange shape has nothing to commit
    /* The value is passed in for saveOnPick: setDraft is asynchronous, so
       committing straight after a pick would otherwise write the value the
       field held before the click. Store the canonical form, so
       "  Ajith@X.com " and "ajith@x.com" are not two values in the database. */
    const next = normalize ? normalize(raw) : raw;
    if (next !== draft) setDraft(next);
    if ((next ?? '') === (value ?? '')) { setOwnError(''); return true; }
    const message = validate ? validate(next) : '';
    if (message) { setOwnError(message); return false; }
    setOwnError('');
    onSave(next);
    return true;
  };

  const cancel = () => { setDraft(value ?? ''); setOwnError(''); };

  /* An unsaved edit, which is what puts the tick on screen. Only the onSave
     shape can be dirty: the onChange shape has already handed every keystroke
     to the page, which saves on its own button. */
  const dirty = !!onSave && !readOnly && (draft ?? '') !== (value ?? '');

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { cancel(); e.currentTarget.blur(); return; }
    if (e.key !== 'Enter') return;

    const field = e.currentTarget;

    /* Ctrl/Cmd+Enter finishes a textarea, since plain Enter there is a
       newline. It saves and steps on like any other field. */
    if (multiline) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (commit() && enterAdvances) focusNextField(field);
      }
      return;
    }

    if (!isPlainEnter(e)) return;

    /* The onChange shape has no per-field save of its own — the page owns a
       Save button. Enter still steps to the next field, but on the LAST one it
       is let through untouched so the form's own submit still fires. That is
       what keeps Enter-to-save working on the settings and create screens
       while every field before it moves forward. */
    if (!onSave) {
      if (enterAdvances && focusNextField(field)) e.preventDefault();
      return;
    }

    /* Enter saves this field, then moves to the next. It used to blur and let
       the blur handler save, which is why simply tabbing out wrote to the
       record — the two paths are separate now and only this one writes.
       A field that fails validation keeps the cursor, so the error is read
       where it happened rather than two fields further down. */
    e.preventDefault();
    if (commit() && enterAdvances) focusNextField(field);
  };

  /** The values the option list offers, in either shape it accepts. */
  const optionValues = (options || []).map((o) => (typeof o === 'string' ? o : o.value));

  return (
    <div className={`nx-rec-field${full ? ' nx-rec-fields__full' : ''}${error ? ' has-error' : ''}`}>
      <span className="nx-rec-field__label">
        {label}
        {required && <span className="nx-rec-field__req">*</span>}
      </span>
      {options ? (
        <div className="nx-rec-field__pick">
        <Select
          icon={Icon}
          value={draft}
          disabled={readOnly}
          // Choosing an option only drafts it; the tick alongside saves it —
          // unless saveOnPick, where the pick IS the save.
          onChange={(e) => {
            const next = e.target.value;
            type_(next);
            if (saveOnPick) commit(next);
          }}
          onKeyDown={onKeyDown}
        >
          {/* The blank row is a prompt for a field nobody has set yet. Once
              there is a value it is only a way to wipe it by accident — and
              the wipe is saved and written to the record's log, so a misclick
              leaves a permanent entry saying the field was set to nothing. */}
          {!draft && <option value="">Select</option>}

          {/* What the record actually holds, when the list has since lost it.
              A master list is edited over time, and a status like "Opportunity"
              is set by the app rather than chosen from one — without this the
              field shows "Select" and the real value is invisible, which reads
              as data loss. */}
          {draft && !optionValues.includes(draft) && (
            <option value={draft}>{draft}</option>
          )}

          {options.map((o) => (typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>))}
        </Select>
        {!saveOnPick && (
          <FieldCommit dirty={dirty} onCommit={commit} onCancel={cancel} label={label} />
        )}
        </div>
      ) : (
        <div className={`nx-rec-field__control${readOnly ? ' is-readonly' : ''}${multiline ? ' nx-rec-field__control--area' : ''}`}>
          {Icon && <span className="nx-rec-field__icon"><Icon size={14} /></span>}
          {multiline ? (
            <textarea
              className="nx-rec-field__input nx-rec-field__input--area"
              value={draft}
              readOnly={!editable}
              placeholder={placeholder}
              onChange={(e) => type_(e.target.value)}
              onKeyDown={onKeyDown}
            />
          ) : (
            <input
              className="nx-rec-field__input"
              type={type}
              inputMode={inputMode}
              pattern={pattern}
              value={draft}
              readOnly={!editable}
              placeholder={placeholder}
              onChange={(e) => type_(e.target.value)}
              onKeyDown={onKeyDown}
              autoComplete={autoComplete || 'off'}
              {...boundsFor(when)}
            />
          )}
          {suffix && <span className="nx-rec-field__suffix">{suffix}</span>}
          <FieldCommit dirty={dirty} onCommit={commit} onCancel={cancel} label={label} />
          {action}
        </div>
      )}
      {error
        ? <p className="nx-rec-field__error" role="alert">{error}</p>
        : hint ? <p className={`nx-rec-field__hint is-${hintTone}`}>{hint}</p> : null}
    </div>
  );
}

/**
 * A password, with a control to reveal it.
 *
 * Typing a password you cannot see is how typos become lockouts, so every
 * password field in the app offers to show it.
 */
export function RecordPasswordField({
  label, name, value, onChange, placeholder = '', autoComplete = 'new-password',
  required = false, error, hint, hintTone = 'muted', full = false,
}) {
  const [shown, setShown] = useState(false);

  return (
    <div className={`nx-rec-field${full ? ' nx-rec-fields__full' : ''}${error ? ' has-error' : ''}`}>
      <span className="nx-rec-field__label">
        {label}
        {required && <span className="nx-rec-field__req">*</span>}
      </span>
      <div className="nx-rec-field__control">
        <span className="nx-rec-field__icon"><Lock size={14} /></span>
        <input
          className="nx-rec-field__input"
          type={shown ? 'text' : 'password'}
          name={name}
          value={value ?? ''}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          onChange={(e) => onChange?.(e)}
        />
        <button
          type="button"
          className="nx-rec-field__action"
          onClick={() => setShown((v) => !v)}
          aria-label={shown ? 'Hide password' : 'Show password'}
          title={shown ? 'Hide password' : 'Show password'}
        >
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {error
        ? <p className="nx-rec-field__error" role="alert">{error}</p>
        : hint ? <p className={`nx-rec-field__hint is-${hintTone}`}>{hint}</p> : null}
    </div>
  );
}

/**
 * A profile picture.
 *
 * The image is stored as a data URL on the record rather than uploaded to a
 * file store — that is how the create-user form has always done it, and it is
 * why the size cap matters: the string goes in the database row.
 */
export function RecordAvatarField({
  label = 'Profile Image',
  value,
  onChange,
  hint = 'JPG or PNG, up to 2MB',
  maxBytes = 2 * 1024 * 1024,
  full = false,
}) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');

  const pick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file is not an image.');
      return;
    }
    if (file.size > maxBytes) {
      setError(`Image must be smaller than ${Math.round(maxBytes / 1024 / 1024)}MB.`);
      return;
    }
    setError('');
    const reader = new FileReader();
    reader.onloadend = () => onChange?.(reader.result);
    reader.onerror = () => setError('That image could not be read.');
    reader.readAsDataURL(file);
    // Let the same file be chosen again after a remove.
    e.target.value = '';
  };

  return (
    <div className={`nx-rec-field${full ? ' nx-rec-fields__full' : ''}${error ? ' has-error' : ''}`}>
      <span className="nx-rec-field__label">{label}</span>
      <div className="nx-rec-avatar">
        <span className="nx-rec-avatar__preview">
          {value ? <img src={value} alt="" /> : <User size={22} />}
        </span>
        <div className="nx-rec-avatar__actions">
          <input ref={inputRef} type="file" accept="image/*" onChange={pick} hidden />
          <button type="button" className="nx-rec-avatar__btn" onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> {value ? 'Change' : 'Choose image'}
          </button>
          {value && (
            <button
              type="button"
              className="nx-rec-avatar__btn is-plain"
              onClick={() => { setError(''); onChange?.(''); }}
            >
              Remove
            </button>
          )}
        </div>
      </div>
      {error
        ? <p className="nx-rec-field__error" role="alert">{error}</p>
        : hint ? <p className="nx-rec-field__hint is-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * A set of mutually exclusive choices, shown in full.
 *
 * A settings page wants every option visible — the choice itself is the
 * documentation — so this stays radios rather than collapsing into a dropdown.
 */
export function RecordRadioGroup({ label, name, value, options = [], onChange, required = false, full = false }) {
  const items = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));

  return (
    <div className={`nx-rec-field${full ? ' nx-rec-fields__full' : ''}`} role="radiogroup" aria-label={label}>
      <span className="nx-rec-field__label">
        {label}
        {required && <span className="nx-rec-field__req">*</span>}
      </span>
      <div className="nx-rec-radios">
        {items.map((o) => (
          <label className="nx-rec-radio" key={String(o.value)}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={String(value) === String(o.value)}
              onChange={(e) => onChange?.(e)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * Two numbers that belong together — a minimum and a maximum.
 */
export function RecordRange({ label, required = false, min, max, onMinChange, onMaxChange, full = false }) {
  return (
    <div className={`nx-rec-field${full ? ' nx-rec-fields__full' : ''}`}>
      <span className="nx-rec-field__label">
        {label}
        {required && <span className="nx-rec-field__req">*</span>}
      </span>
      <div className="nx-rec-range">
        <div className="nx-rec-field__control">
          <input className="nx-rec-field__input" type="number" value={min ?? ''} onChange={onMinChange} />
        </div>
        <span className="nx-rec-range__sep">to</span>
        <div className="nx-rec-field__control">
          <input className="nx-rec-field__input" type="number" value={max ?? ''} onChange={onMaxChange} />
        </div>
      </div>
    </div>
  );
}

/**
 * A phone number with its country code, saved together — a half-applied save
 * would leave the record with a dial code that does not match its number.
 */
export function RecordPhoneField({
  label, value, dial, name, countryName, onSave, required = false, action, full = false,
}) {
  const locked = useRecordViewOnly();
  const [num, setNum] = useState(value || '');
  const [code, setCode] = useState(dial || DEFAULT_DIAL);
  const [error, setError] = useState('');

  const savedNum = value || '';
  const savedCode = dial || DEFAULT_DIAL;

  useEffect(() => { setNum(value || ''); setError(''); }, [value]);
  useEffect(() => { setCode(dial || DEFAULT_DIAL); }, [dial]);

  const commit = (nextNum, nextCode) => {
    if (nextNum === savedNum && nextCode === savedCode) { setError(''); return; }
    const message = validateNumber(nextNum, nextCode, { required });
    if (message) { setError(message); return; }
    setError('');
    onSave(nextNum, nextCode);
  };

  const cancel = () => { setNum(savedNum); setCode(savedCode); setError(''); };

  /* Either half counts: changing only the country still needs saving, and it
     is saved together with the number so the record can never hold a dial
     code that does not match its digits. */
  const dirty = !locked && (num !== savedNum || code !== savedCode);

  return (
    <div className={`nx-rec-field nx-rec-field--dynamic${full ? ' nx-rec-fields__full' : ''}${error ? ' has-error' : ''}`}>
      <span className="nx-rec-field__label">
        {label}
        {required && <span className="nx-rec-field__req">*</span>}
      </span>
      <div className="nx-rec-phone">
        <PhoneInput
          name={name}
          countryName={countryName}
          value={num}
          dial={code}
          disabled={locked}
          onChange={(v) => { if (locked) return; setNum(v); if (error) setError(''); }}
          onDialChange={(v) => { if (!locked) setCode(v); }}
          onKeyDown={(e) => {
            if (locked || e.key !== 'Enter') return;
            e.preventDefault();
            commit(num, code);
          }}
          required={required}
        />
        <FieldCommit dirty={dirty} onCommit={() => commit(num, code)} onCancel={cancel} label={label} />
        {action}
      </div>
      {error && <p className="nx-rec-field__error" role="alert">{error}</p>}
    </div>
  );
}

/**
 * A document field.
 *
 * Note what this does NOT do: no file is uploaded anywhere. Picking one stores
 * its *name* against the record, which is how this has always worked — the
 * control is a label for a document held outside the CRM, not an attachment.
 */
export function RecordFileField({ label, value, onSave, full = false }) {
  const inputRef = useRef(null);
  // The picked name, held back until it is confirmed. null means "nothing
  // picked since the last save", so the stored name is what shows.
  const [draft, setDraft] = useState(null);

  useEffect(() => { setDraft(null); }, [value]);

  const shown = draft ?? value;
  const dirty = draft !== null && draft !== value;

  return (
    <div className={`nx-rec-field${full ? ' nx-rec-fields__full' : ''}`}>
      <span className="nx-rec-field__label">{label}</span>
      <div className="nx-rec-field__control">
        <span className="nx-rec-field__icon"><Paperclip size={14} /></span>
        <span className={`nx-rec-field__filename${shown ? '' : ' is-empty'}`}>
          {shown || 'No document'}
        </span>
        <input
          ref={inputRef}
          type="file"
          className="nx-rec-field__file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setDraft(file.name);
          }}
        />
        <FieldCommit
          dirty={dirty}
          onCommit={() => { onSave?.(draft); setDraft(null); }}
          onCancel={() => setDraft(null)}
          label={label}
        />
        <button
          type="button"
          className="nx-rec-field__action"
          onClick={() => inputRef.current?.click()}
          title={value ? `Replace ${value}` : 'Choose a document'}
        >
          <Upload size={15} />
        </button>
      </div>
    </div>
  );
}

/**
 * A field backed by one of the master tables — projects, lead sources.
 * DynamicDropdown already knows how to list a master and add an entry to it
 * inline, so it stays; this only supplies the surrounding label and layout.
 *
 * Records store the master's *name* rather than its id, so valueKey and
 * displayKey are normally the same field.
 */
export function RecordLookupField({
  label, value, apiUrl,
  displayKey = 'sourceName', valueKey = 'sourceName', postPayloadKey = 'sourceName',
  placeholder, onSave, full = false,
}) {
  const locked = useRecordViewOnly();
  // The picked entry, held until confirmed. null means nothing picked since
  // the last save, so the stored value is what shows.
  const [draft, setDraft] = useState(null);

  useEffect(() => { setDraft(null); }, [value]);

  // Locked, it shows the chosen value as plain text: a dropdown you cannot
  // open is more confusing than a line of text.
  if (locked) {
    return <RecordField label={label} value={value ?? ''} placeholder={placeholder} full={full} readOnly />;
  }

  const shown = draft ?? (value || '');
  const dirty = draft !== null && draft !== (value || '');

  return (
    <div className={`nx-rec-field nx-rec-field--dynamic${full ? ' nx-rec-fields__full' : ''}`}>
      <span className="nx-rec-field__label">{label}</span>
      <div className="nx-rec-field__pick">
        <DynamicDropdown
          apiUrl={apiUrl}
          displayKey={displayKey}
          valueKey={valueKey}
          postPayloadKey={postPayloadKey}
          placeholder={placeholder}
          value={shown}
          onChange={(e) => setDraft(e.target.value)}
        />
        <FieldCommit
          dirty={dirty}
          onCommit={() => { onSave?.(draft); setDraft(null); }}
          onCancel={() => setDraft(null)}
          label={label}
        />
      </div>
    </div>
  );
}

/**
 * An owner picker. The value stored on the record is a user id, so the input
 * shows the matching user's name while still saving the id.
 */
export function RecordUserField({
  label, value, users = [], options, onSave, placeholder = 'Search a user',
  /* Choosing a name saves it there and then, so no tick appears. For an owner
     whose onSave asks for confirmation of its own, the tick was a second
     prompt for the same decision. */
  saveOnPick = false,
}) {
  const locked = useRecordViewOnly();
  const [open, setOpen] = useState(false);
  // null until the user actually types, so the current owner stays on screen.
  const [term, setTerm] = useState(null);
  // The picked owner, held until confirmed; null means nothing picked since
  // the last save, so the record's own owner is what shows.
  const [draft, setDraft] = useState(null);
  const wrapRef = useRef(null);

  // A save landing (or the record reloading) makes any draft stale.
  useEffect(() => { setDraft(null); }, [value]);

  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setTerm(null);
      }
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const nameOf = (u) => u.username || u.firstName || u.name || 'User';
  const effective = draft ?? value;
  const current = users.find((u) => u.id === effective || u.username === effective);
  const display = current ? nameOf(current) : (effective || '');
  const dirty = !locked && draft !== null && draft !== value;

  // `users` resolves the current value's name; `options` is who you may pick.
  // They differ where a record is owned by someone not assignable by hand.
  const matches = (options || users).filter((u) => {
    const q = (term || '').toLowerCase();
    return !q
      || (u.username && u.username.toLowerCase().includes(q))
      || (u.firstName && u.firstName.toLowerCase().includes(q))
      || (u.name && u.name.toLowerCase().includes(q));
  });

  return (
    <div className="nx-rec-field" ref={wrapRef}>
      <span className="nx-rec-field__label">{label}</span>
      <div className="nx-rec-field__control nx-rec-field__control--menu">
        <span className="nx-rec-field__icon"><User size={14} /></span>
        <input
          className="nx-rec-field__input"
          value={term ?? display}
          placeholder={locked ? '' : placeholder}
          readOnly={locked}
          onFocus={(e) => { if (locked) return; setOpen(true); e.target.select(); }}
          onChange={(e) => { if (!locked) setTerm(e.target.value); }}
        />
        {!locked && <ChevronDown size={14} className="nx-rec-field__icon" />}
        {!saveOnPick && (
          <FieldCommit
            dirty={dirty}
            onCommit={() => { onSave?.(draft); setDraft(null); }}
            onCancel={() => setDraft(null)}
            label={label}
          />
        )}
        {open && !locked && (
          <div className="nx-rec-menu">
            {matches.length > 0 ? matches.map((u) => (
              <button
                type="button"
                key={u.id}
                className={`nx-rec-menu__item${(u.id === value) ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const next = u.id || u.username;
                  setOpen(false);
                  setTerm(null);
                  if (saveOnPick) {
                    /* No draft is kept on purpose. onSave may ask the user to
                       confirm, and may be declined; holding a draft through
                       that would leave the field showing an owner the record
                       does not have. Left alone the field falls back to the
                       stored value, so a decline reads as nothing having
                       happened and an accepted change arrives as a new value. */
                    onSave?.(next);
                    return;
                  }
                  // Picking only drafts the owner; the tick saves it.
                  setDraft(next);
                }}
              >
                {nameOf(u)}
                {u.firstName && <span className="nx-rec-menu__hint">{u.firstName} {u.lastName || ''}</span>}
              </button>
            )) : <div className="nx-rec-menu__empty">No users found</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** A field whose value the user cannot change, shown as plain text. */
export function RecordReadOnly({ label, value, icon, full }) {
  return <RecordField label={label} value={value ?? ''} icon={icon} full={full} readOnly />;
}

/** The gradient summary card at the top of a record's side rail. */
export function RecordHero({ initials, name, meta, badge, tiles = [] }) {
  return (
    <section className="nx-rec-hero">
      <div className="nx-rec-hero__top">
        <span className="nx-rec-hero__avatar">{initials}</span>
        <div className="nx-rec-hero__names">
          <h2 className="nx-rec-hero__name">{name}</h2>
          {meta && <p className="nx-rec-hero__id">{meta}</p>}
        </div>
        {badge && <span className="nx-rec-hero__badge">{badge}</span>}
      </div>
      {tiles.length > 0 && (
        <div className="nx-rec-hero__tiles">
          {tiles.map(({ icon: TileIcon, value, label }) => (
            <div className="nx-rec-hero__tile" key={label}>
              {TileIcon && <TileIcon size={16} className="nx-rec-hero__tile-icon" />}
              <span className="nx-rec-hero__tile-text">
                <span className="nx-rec-hero__tile-value">{value || '—'}</span>
                <span className="nx-rec-hero__tile-label">{label}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** The stage rail. `stages` is an ordered list; `current` is the index. */
export function RecordProgress({ stages = [], current = 0 }) {
  return (
    <div className="nx-rec-steps">
      {stages.map((label, i) => (
        <div
          key={label}
          className={`nx-rec-step${i < current ? ' is-done' : ''}${i === current ? ' is-current' : ''}`}
        >
          <span className="nx-rec-step__dot">
            {i < current ? <Check size={14} /> : <span className="nx-rec-step__pip" />}
          </span>
          <span className="nx-rec-step__label">{label}</span>
        </div>
      ))}
    </div>
  );
}

/** A timeline of entries: {id, title, subtitle, date, icon}. */
export function RecordTimeline({ entries = [], emptyMessage = 'Nothing recorded yet.' }) {
  return (
    <div className="nx-rec-log">
      {entries.length === 0 && <p className="nx-rec-log__empty">{emptyMessage}</p>}
      {entries.map((e, i) => {
        const EntryIcon = e.icon;
        return (
          <div className="nx-rec-log__item" key={e.id || i}>
            <span className="nx-rec-log__dot">{EntryIcon ? <EntryIcon size={14} /> : null}</span>
            <div className="nx-rec-log__body">
              <p className="nx-rec-log__title">{e.title}</p>
              {e.subtitle && <p className="nx-rec-log__meta">{e.subtitle}</p>}
              {e.date && <p className="nx-rec-log__date">{e.date}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Placeholder for a tab that has no data behind it yet. */
export function RecordEmptyTab({ icon: Icon, title, children }) {
  return (
    <RecordCard>
      <div className="nx-rec-empty-tab">
        {Icon && <Icon size={28} />}
        <p className="nx-rec-card__title">{title}</p>
        <p className="nx-rec-card__sub">{children}</p>
      </div>
    </RecordCard>
  );
}
