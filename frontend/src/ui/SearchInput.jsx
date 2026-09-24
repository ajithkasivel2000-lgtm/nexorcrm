import { Search, X } from 'lucide-react';
import './SearchInput.css';

/**
 * The one search field.
 *
 * Every screen had grown its own: a filled pill on the dashboard header, an
 * outlined one in the table toolbar, a translucent one in the sidebar, plus
 * two more with bespoke classes. They used different shapes, backgrounds and
 * clear-button behaviour.
 *
 * tone: 'default' for light surfaces, 'inverse' for the dark sidebar.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  tone = 'default',
  size = 'md',
  onClear,
  className = '',
  inputRef,
  ...rest
}) {
  const clear = () => {
    onClear?.();
    onChange?.({ target: { value: '' } });
  };

  return (
    <div className={`nx-search nx-search--${tone} nx-search--${size} ${className}`.trim()}>
      <Search size={15} className="nx-search__icon" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        className="nx-search__input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-label={placeholder}
        {...rest}
      />
      {value && (
        <button
          type="button"
          className="nx-search__clear"
          onClick={clear}
          aria-label="Clear search"
          // Keep focus in the field so typing can continue straight away.
          onMouseDown={(e) => e.preventDefault()}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
