import './Button.css';

/**
 * The one button in the system.
 *
 * variant: primary | secondary | ghost | danger | subtle
 * size:    sm | md | lg
 *
 * `loading` disables the button and swaps the leading icon for a spinner, so
 * a submitting form can't be double-fired.
 */
export default function Button({
  children,
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  type = 'button',
  className = '',
  ...rest
}) {
  const classes = [
    'nx-btn',
    `nx-btn--${variant}`,
    `nx-btn--${size}`,
    fullWidth ? 'nx-btn--block' : '',
    loading ? 'is-loading' : '',
    !children && (Icon || IconRight) ? 'nx-btn--icon-only' : '',
    className,
  ].filter(Boolean).join(' ');

  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 18 : 16;

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading ? (
        <span className="nx-btn__spinner" aria-hidden="true" />
      ) : (
        Icon && <Icon size={iconSize} aria-hidden="true" />
      )}
      {children && <span className="nx-btn__label">{children}</span>}
      {IconRight && !loading && <IconRight size={iconSize} aria-hidden="true" />}
    </button>
  );
}
