# NexorCRM design system

Soft modern dashboard direction: rounded elevated cards, generous whitespace,
soft shadows, colourful status pills.

`tokens.css` is imported once in `main.jsx`. Every component here is styled
purely from those CSS variables, so **theme changes happen in `tokens.css` and
nowhere else**. Dark mode follows the app's existing `body.dark-mode` class —
components need no dark-mode rules of their own.

## Reference implementations

- `src/components/Leads/LookupListPage.jsx` — list + create/edit modal. Backs
  seven screens (lead status/type, project status/type, the three source lists)
  and uses `Page`, `DataTable`, `Modal`, `Field`/`Input` and `Button` together.
- `src/ChannelPartners.jsx` — list + navigation to separate create/edit routes,
  with status pills, row click-through, and export behind a page permission.

### Page
Standard screen shell — padded background, title block, actions slot. Use it as
the root of every migrated screen so padding and heading sizes stay consistent.

```jsx
<Page title="Channel Partners" subtitle="..." actions={<Button variant="primary">New</Button>}>
  <DataTable ... />
</Page>
```

Helper classes for table cells: `nx-page__id` (monospace ids),
`nx-page__strong` (primary column), `nx-page__muted` (secondary text),
`nx-page__row-actions` (right-aligned action cluster), `nx-page__delete`
(destructive hover on a ghost button).

## Usage

```jsx
import { Button, DataTable, Field, Input, Modal, Pill, toneForStatus } from './ui';
```

### Button
`variant`: `primary | secondary | ghost | subtle | danger` · `size`: `sm | md | lg`

```jsx
<Button variant="primary" icon={Plus} loading={saving}>Create lead</Button>
<Button variant="ghost" size="sm" icon={Trash2} aria-label="Delete" />
```
Icon-only buttons must carry an `aria-label`.

### Modal
Focus trap, ESC to close, background scroll lock (refcounted for stacked
dialogs), focus returned on close. `size`: `sm | md | lg | xl | full`.

Put the submit button in `footer` and link it to the form by id:

```jsx
<Modal open={open} onClose={close} title="Edit" footer={
  <>
    <Button onClick={close}>Cancel</Button>
    <Button variant="primary" type="submit" form="my-form" loading={saving}>Save</Button>
  </>
}>
  <form id="my-form" onSubmit={onSubmit}>
    <Field label="Name" required error={error}>
      <Input value={v} onChange={e => setV(e.target.value)} data-autofocus />
    </Field>
  </form>
</Modal>
```

`data-autofocus` marks the control that receives focus on open.

### Form
`Field` owns the generated id, the label association and the error wiring — the
control inside reads them from context, so never set `id` by hand.

```jsx
<FormGrid columns={2}>
  <Field label="Mobile" required error={errors.mobile} hint="10 digits">
    <Input name="mobile" prefix={Phone} />
  </Field>
  <Field label="Status">
    <Select options={['New Lead', 'Site Visit']} placeholder="Choose..." />
  </Field>
  <Field label="Notes" className="nx-field--full">
    <Textarea rows={4} />
  </Field>
</FormGrid>
```

`Checkbox` and `Switch` take their own `label` prop instead of a `Field`.

### DataTable
Sorting, search, selection, pagination, column visibility and CSV export are
in-memory and self-managing. Pass `serverSide` and drive `rows` yourself for
server-side paging.

```jsx
<DataTable
  columns={[
    { key: 'name', label: 'Name', render: r => <strong>{r.name}</strong> },
    { key: 'status', label: 'Status', render: r => (
        <Pill tone={toneForStatus(r.status)} dot>{r.status}</Pill>
      ) },
    { key: 'createdAt', label: 'Created', width: '160px' },
  ]}
  rows={rows}
  loading={loading}
  selectable
  exportName="leads"
  onRowClick={r => navigate(`/leads/${r.id}`)}
  bulkActions={(ids, clear) => <Button variant="danger" size="sm">Delete</Button>}
  actions={r => <Button variant="ghost" size="sm" icon={Pencil} aria-label="Edit" />}
/>
```

Column options: `sortable`, `searchable`, `hideable`, `width`, `align`,
`render(row)`, `sortValue(row)`, `exportValue(row)`.

Export writes what the viewer currently sees — current sort and search, visible
columns only.

### Sidebar
Takes the existing menu shape unchanged, so `Dashboard.jsx` can pass
`sidebarMenus` straight in.

```jsx
<Sidebar
  sections={sidebarMenus}
  currentPath={location.pathname}
  onNavigate={navigate}
  pinned={pinned}
  onPinnedChange={setPinned}
  logo={<img src="/logo_light.png" alt="NexorCRM" />}
  logoIcon={<img src="/favicon.png" alt="" />}
/>
```

## Conventions

- Never hardcode a colour, radius or spacing value — use a token.
- Wrap any new screen root in `nx-scope` for border-box and focus defaults.
- Icon-only controls need `aria-label`.
- Everything must survive 400px width; tables scroll horizontally on their own.
