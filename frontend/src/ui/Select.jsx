import { Children, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import focusNextField from './focusNextField';
import { Check, ChevronDown } from 'lucide-react';
import Popover from './Popover';
import { useField } from './fieldContext';
import './Select.css';

/**
 * The plain text inside an <option>, whatever it is built from.
 *
 * The list is rendered by this component rather than the browser, so an
 * option's label has to be read out of its children. `String(children)` was
 * doing that, and on anything but a single string it produced the array's own
 * toString — `{name}{suffix}` came out as "Kumar,$," rather than "Kumar$".
 */
function textOf(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(node.props?.children);
  return '';
}

/**
 * A themed dropdown, drop-in for a native <select>.
 *
 * A native select draws its option list with operating-system chrome: system
 * font, white panel, blue highlight. None of it responds to the app's tokens,
 * so the list ignored dark mode entirely and looked nothing like the rest of
 * the UI. This renders the list itself, through Popover, so it is themed,
 * cannot be clipped by a scrolling ancestor, and matches every other menu.
 *
 * Kept API-compatible on purpose so the swap is mechanical:
 *
 *   <Select name="status" value={v} onChange={handleChange}>
 *     <option value="">Select</option>
 *     <option value="new">New</option>
 *   </Select>
 *
 * `onChange` receives `{ target: { name, value } }`, so an existing
 * `handleChange(e)` that reads `e.target.name` / `e.target.value` works
 * unchanged. `options` is accepted as an alternative to <option> children.
 */
export default function Select({
  name,
  value,
  onChange,
  options,
  children,
  // Optional leading icon, drawn inside the trigger so the control stays one
  // box rather than an icon sitting next to a second bordered element.
  icon: Icon,
  placeholder = 'Select',
  disabled = false,
  required = false,
  id,
  className = '',
  size = 'md',
  /* Choosing an option steps to the next field. Off for a dropdown that is a
     filter or a view switcher rather than part of a form being filled in. */
  advanceOnPick = true,
  'aria-label': ariaLabel,
}) {
  // Inside a <Field>, the label's htmlFor points at the generated id and the
  // error message is wired by aria-describedby; standalone these are empty.
  const field = useField();
  const triggerId = id || field.id;

  // <option> children and an `options` array describe the same thing.
  const items = useMemo(() => {
    if (Array.isArray(options)) {
      return options.map((o) => (typeof o === 'string'
        ? { value: o, label: o }
        : { value: o.value, label: o.label ?? String(o.value) }));
    }
    const out = [];
    Children.forEach(children, (child) => {
      if (!isValidElement(child) || child.type !== 'option') return;
      const optValue = child.props.value ?? '';
      out.push({
        value: optValue,
        label: textOf(child.props.children) || String(optValue),
        disabled: child.props.disabled,
      });
    });
    return out;
  }, [options, children]);

  const current = items.find((o) => String(o.value) === String(value ?? ''));
  // An empty-valued option is the caller's own placeholder row; showing its
  // label as the closed-state text is what a native select does.
  const display = current ? current.label : placeholder;

  const emit = (next) => onChange?.({ target: { name, value: next } });

  return (
    <div className={`nx-select2 nx-select2--${size} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}>
      <Popover
        // No explicit width: Popover falls back to the trigger's own width as
        // a minimum, so the menu lines up with the field and can still grow
        // for a long option.
        align="start"
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            id={triggerId}
            type="button"
            className={`nx-select2__trigger ${open ? 'is-open' : ''}`}
            aria-invalid={field.hasError || undefined}
            aria-describedby={field.describedBy}
            onClick={disabled ? undefined : toggle}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={ariaLabel}
          >
            {Icon && <Icon size={14} className="nx-select2__icon" aria-hidden="true" />}
            <span className={`nx-select2__value ${current && current.value !== '' ? '' : 'is-placeholder'}`}>
              {display}
            </span>
            <ChevronDown size={15} className="nx-select2__chevron" aria-hidden="true" />
          </button>
        )}
      >
        {({ close }) => (
          <SelectList
            items={items}
            value={value}
            /* Choosing an option finishes this field, so focus goes on to
               the next one — the same step Enter makes in a text field. Without
               it the walk down a form stopped dead at every dropdown: the menu
               closed and focus stayed on the trigger, so the next Enter just
               reopened it. */
            onPick={(next) => {
              emit(next);
              close();
              const trigger = document.getElementById(triggerId);
              if (advanceOnPick && trigger) focusNextField(trigger);
            }}
          />
        )}
      </Popover>

      {/* Keeps `new FormData(form)` working, and lets the browser enforce
          `required` on a control it can no longer see. */}
      <input
        type="text"
        name={name}
        value={value ?? ''}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="nx-select2__shadow"
        /* Chrome sees a nameless text input and offers to autofill it as a
           username, warning about it once per render — noise in the console,
           and an autofill that would silently overwrite a chosen option.
           This input exists only so `new FormData(form)` and `required` keep
           working; nothing should ever complete it. */
        autoComplete="off"
        readOnly
        onChange={() => {}}
      />
    </div>
  );
}

/**
 * The option list. Split out so the roving-focus state resets every time the
 * menu opens, rather than persisting across openings.
 */
function SelectList({ items, value, onPick }) {
  const selectedIndex = Math.max(0, items.findIndex((o) => String(o.value) === String(value ?? '')));
  const [active, setActive] = useState(selectedIndex);
  const listRef = useRef(null);

  // Open with the current choice in view, however long the list is.
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, []);

  const move = (delta) => {
    setActive((i) => {
      let next = i;
      for (let step = 0; step < items.length; step += 1) {
        next = (next + delta + items.length) % items.length;
        if (!items[next].disabled) return next;
      }
      return i;
    });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(items.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = items[active];
      if (item && !item.disabled) onPick(item.value);
    }
  };

  return (
    <div
      ref={listRef}
      className="nx-select2__list"
      role="listbox"
      tabIndex={0}
      onKeyDown={onKeyDown}
      // eslint-disable-next-line jsx-a11y/no-autofocus
      autoFocus
    >
      {items.length === 0 && <p className="nx-select2__empty">No options</p>}
      {items.map((o, i) => {
        const isSelected = String(o.value) === String(value ?? '');
        return (
          <button
            key={`${o.value}-${i}`}
            type="button"
            role="option"
            aria-selected={isSelected}
            data-active={i === active ? 'true' : undefined}
            disabled={o.disabled}
            className={`nx-select2__option ${isSelected ? 'is-selected' : ''} ${i === active ? 'is-active' : ''}`}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(o.value)}
          >
            <span className="nx-select2__option-label">{o.label}</span>
            {isSelected && <Check size={14} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}
