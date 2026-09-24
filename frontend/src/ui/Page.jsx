import './Page.css';

/**
 * Standard screen shell: padded page background with a title block and an
 * actions slot on the right.
 *
 * <Page title="Channel Partners" subtitle="..." actions={<Button/>}>
 *   <DataTable ... />
 * </Page>
 */
export default function Page({ title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`nx-page nx-scope ${className}`.trim()}>
      {(title || actions) && (
        <header className="nx-page__header">
          <div className="nx-page__heading">
            {title && <h1 className="nx-page__title">{title}</h1>}
            {subtitle && <p className="nx-page__subtitle">{subtitle}</p>}
          </div>
          {actions && <div className="nx-page__actions">{actions}</div>}
        </header>
      )}
      {children}
    </div>
  );
}
