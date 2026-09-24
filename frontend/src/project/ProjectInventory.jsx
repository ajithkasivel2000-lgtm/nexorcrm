import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Layers, Plus, Trash2, SquarePen, Rows3,
} from 'lucide-react';
import {
  Button, DataTable, Modal, Pill, Select, Field, Input, Textarea, FormGrid, toast,
} from '../ui';
import './ProjectInventory.css';
import useLiveRefresh from '../utils/useLiveRefresh';

/**
 * Buildings and units — the inventory the project's figures are counted from.
 *
 * Nothing here is typed-in summary data. Every total on this tab and on the
 * Overview is a count of the rows below it, so a unit marked sold moves the
 * sales figure the moment it is saved and there is no second number to keep
 * in step.
 */

/** The seven states a unit can be in; the server refuses anything else. */
const UNIT_STATES = ['Available', 'Hold', 'Reserved', 'Booked', 'Sold', 'Blocked', 'Cancelled'];
const BUILDING_STATES = ['Planned', 'Under Construction', 'Completed', 'Handed Over', 'On Hold'];
const BHKS = ['1RK', '1BHK', '2BHK', '2.5BHK', '3BHK', '3.5BHK', '4BHK', '4BHK+', 'Plot', 'Shop', 'Office'];
const FACINGS = ['East', 'West', 'North', 'South', 'North East', 'North West', 'South East', 'South West'];

/* One colour per state, all seven distinct: the split bar below is read by
   colour, and two states sharing a fill would merge into one segment. */
const TONE = {
  Available: 'success', Hold: 'warning', Reserved: 'accent',
  Booked: 'info', Sold: 'purple', Blocked: 'neutral', Cancelled: 'danger',
};

function money(value, { compact = true } = {}) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency', currency: 'INR', maximumFractionDigits: 0,
      ...(compact ? { notation: 'compact' } : {}),
    }).format(n);
  } catch {
    return String(n);
  }
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* --------------------------------------------------------------------------
   Small pieces
   -------------------------------------------------------------------------- */

function Stat({ label, value, sub, tone }) {
  return (
    <div className={`nx-pi__stat${tone ? ` is-${tone}` : ''}`}>
      <p className="nx-pi__stat-label">{label}</p>
      <p className="nx-pi__stat-value">{value}</p>
      {sub && <p className="nx-pi__stat-sub">{sub}</p>}
    </div>
  );
}

/**
 * How the inventory splits across the states, drawn to scale.
 *
 * States with no units are left out rather than drawn as slivers — a legend
 * full of zeros tells the reader nothing.
 */
function StateBar({ counts, total }) {
  const present = UNIT_STATES.filter((s) => (counts[s] || 0) > 0);
  if (!present.length) return null;
  return (
    <div className="nx-pi__split">
      <div className="nx-pi__split-bar">
        {present.map((s) => (
          <span
            key={s}
            className={`nx-pi__split-seg is-${TONE[s]}`}
            style={{ width: `${(counts[s] / total) * 100}%` }}
            title={`${s}: ${counts[s]}`}
          />
        ))}
      </div>
      <ul className="nx-pi__legend">
        {present.map((s) => (
          <li key={s}>
            <i className={`nx-pi__dot is-${TONE[s]}`} />
            {s} <strong>{counts[s]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------------------
   The tab
   -------------------------------------------------------------------------- */

export default function ProjectInventory({ projectId, onChanged }) {
  const [buildings, setBuildings] = useState([]);
  const [units, setUnits] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(true);

  const [buildingForm, setBuildingForm] = useState(null); // null | {} | existing row
  const [unitForm, setUnitForm] = useState(null);
  const [bulkForm, setBulkForm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, u, i] = await Promise.all([
        fetch(`/api/projects/${projectId}/buildings`),
        fetch(`/api/projects/${projectId}/units`),
        fetch(`/api/projects/${projectId}/inventory`),
      ]);
      if (b.ok) setBuildings(await b.json());
      if (u.ok) setUnits(await u.json());
      // null is a valid answer here: it means no units have been recorded.
      if (i.ok) setInventory(await i.json());
    } catch (error) {
      console.error('Error loading the inventory:', error);
      toast.error('Could not load the inventory.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  /* Units are edited from the project page and in bulk from this table, and
     the figures above are counted from them. */
  useLiveRefresh(['projects'], () => { load(); });

  /** Reloads everything, then lets the page refresh its own summary. */
  const refresh = async () => {
    await load();
    if (onChanged) onChanged();
  };

  const send = async (url, method, body) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, payload };
  };

  /* ---- buildings -------------------------------------------------------- */

  const saveBuilding = async () => {
    const f = buildingForm;
    if (!f.name || !f.name.trim()) { toast.error('A building name is required'); return; }
    if (f.constructionProgress !== '' && f.constructionProgress !== undefined
      && (num(f.constructionProgress) === null || num(f.constructionProgress) < 0 || num(f.constructionProgress) > 100)) {
      toast.error('Progress is a percentage, 0 to 100');
      return;
    }

    setBusy(true);
    const body = {
      name: f.name.trim(), code: f.code || null, towerNumber: f.towerNumber || null,
      floors: num(f.floors), status: f.status || null,
      constructionProgress: num(f.constructionProgress),
      expectedCompletion: f.expectedCompletion || null,
      description: f.description || null,
    };
    const { ok, payload } = f.id
      ? await send(`/api/projects/${projectId}/buildings/${f.id}`, 'PUT', body)
      : await send(`/api/projects/${projectId}/buildings`, 'POST', body);
    setBusy(false);

    if (!ok) { toast.error(payload?.message || 'Could not save the building.'); return; }
    toast.success(f.id ? 'Building updated.' : 'Building added.');
    setBuildingForm(null);
    refresh();
  };

  const deleteBuilding = async (row) => {
    const { ok, payload } = await send(`/api/projects/${projectId}/buildings/${row.id}`, 'DELETE');
    if (!ok) { toast.error(payload?.message || 'Could not delete the building.'); return; }
    toast.success(`${row.name} deleted.`);
    refresh();
  };

  /* ---- units ------------------------------------------------------------ */

  const saveUnit = async () => {
    const f = unitForm;
    if (!f.unitNumber || !f.unitNumber.trim()) { toast.error('A unit number is required'); return; }
    for (const [key, label] of [['price', 'Price'], ['carpetArea', 'Carpet area'],
      ['builtUpArea', 'Built-up area'], ['saleableArea', 'Saleable area']]) {
      if (f[key] !== '' && f[key] !== undefined && num(f[key]) !== null && num(f[key]) < 0) {
        toast.error(`${label} cannot be negative`); return;
      }
    }

    setBusy(true);
    const body = {
      buildingId: f.buildingId || null,
      unitNumber: f.unitNumber.trim(),
      floor: num(f.floor), unitType: f.unitType || null, bhk: f.bhk || null,
      facing: f.facing || null,
      carpetArea: num(f.carpetArea), builtUpArea: num(f.builtUpArea),
      saleableArea: num(f.saleableArea), balconyArea: num(f.balconyArea),
      price: num(f.price), pricePerSqft: num(f.pricePerSqft), parking: num(f.parking),
      status: f.status || 'Available',
      reservedFor: f.reservedFor || null, notes: f.notes || null,
    };
    const { ok, payload } = f.id
      ? await send(`/api/projects/${projectId}/units/${f.id}`, 'PUT', body)
      : await send(`/api/projects/${projectId}/units`, 'POST', body);
    setBusy(false);

    if (!ok) { toast.error(payload?.message || 'Could not save the unit.'); return; }
    toast.success(f.id ? 'Unit updated.' : 'Unit added.');
    setUnitForm(null);
    refresh();
  };

  /**
   * Deletes the ticked units.
   *
   * A sold unit is refused by the server, and that refusal is reported rather
   * than swallowed: the reader needs to know which rows are still there.
   */
  const deleteUnits = async (ids) => {
    setBusy(true);
    const refused = [];
    for (const id of ids) {
      const row = units.find((u) => u.id === id);
      const { ok, payload } = await send(`/api/projects/${projectId}/units/${id}`, 'DELETE');
      if (!ok) refused.push(`${row?.unitNumber || id}: ${payload?.message || 'refused'}`);
    }
    setBusy(false);

    const done = ids.length - refused.length;
    if (done) toast.success(`${done} unit${done === 1 ? '' : 's'} deleted.`);
    if (refused.length) toast.error(refused.join(' · '));
    refresh();
  };

  /* ---- bulk add ---------------------------------------------------------
     A tower is entered floor by floor in practice, so the form asks for the
     shape of the floor and generates the rows. The preview is built from the
     same code that is posted, so what is shown is what is sent. */

  const bulkRows = useMemo(() => {
    const f = bulkForm;
    if (!f) return [];
    const from = num(f.floorFrom);
    const to = num(f.floorTo);
    const per = num(f.perFloor);
    if (from === null || to === null || per === null || to < from || per < 1) return [];

    const rows = [];
    for (let floor = from; floor <= to; floor += 1) {
      for (let n = 1; n <= per; n += 1) {
        rows.push({
          buildingId: f.buildingId || null,
          unitNumber: `${f.prefix || ''}${floor}${String(n).padStart(2, '0')}`,
          floor,
          bhk: f.bhk || null,
          unitType: f.unitType || null,
          facing: f.facing || null,
          saleableArea: num(f.saleableArea),
          carpetArea: num(f.carpetArea),
          price: num(f.price),
          status: f.status || 'Available',
        });
      }
    }
    return rows;
  }, [bulkForm]);

  const saveBulk = async () => {
    if (!bulkRows.length) { toast.error('Nothing to add — check the floor range.'); return; }
    if (bulkRows.length > 500) { toast.error('Add at most 500 units at a time.'); return; }

    setBusy(true);
    const { ok, payload } = await send(`/api/projects/${projectId}/units/bulk`, 'POST', { units: bulkRows });
    setBusy(false);

    if (!ok) { toast.error(payload?.message || 'Could not add the units.'); return; }
    toast.success(`${payload.created} units added.`);
    setBulkForm(null);
    refresh();
  };

  /* ---- table ------------------------------------------------------------ */

  const columns = useMemo(() => [
    {
      key: 'unitNumber',
      label: 'Unit',
      sortable: true,
      searchable: true,
      render: (r) => <strong>{r.unitNumber}</strong>,
    },
    {
      key: 'buildingName',
      label: 'Building',
      sortable: true,
      searchable: true,
      sortValue: (r) => r.building?.name || '',
      /* The name lives on the joined row, not under this key. Without an
         accessor the filter, the search and the export would all read
         `row.buildingName` — undefined — and quietly match nothing. */
      exportValue: (r) => r.building?.name || '',
      render: (r) => r.building?.name || 'Unassigned',
    },
    { key: 'floor', label: 'Floor', sortable: true, align: 'right', render: (r) => r.floor ?? '—' },
    { key: 'bhk', label: 'Config', sortable: true, searchable: true, render: (r) => r.bhk || '—' },
    { key: 'facing', label: 'Facing', sortable: true, render: (r) => r.facing || '—' },
    {
      key: 'saleableArea',
      label: 'Saleable',
      sortable: true,
      align: 'right',
      sortValue: (r) => num(r.saleableArea) ?? -1,
      render: (r) => (num(r.saleableArea) === null ? '—' : `${num(r.saleableArea).toLocaleString('en-IN')} sq ft`),
    },
    {
      key: 'price',
      label: 'Price',
      sortable: true,
      align: 'right',
      sortValue: (r) => num(r.price) ?? -1,
      exportValue: (r) => num(r.price) ?? '',
      render: (r) => money(r.price),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (r) => <Pill tone={TONE[r.status] || 'neutral'}>{r.status}</Pill>,
    },
  ], []);

  const filters = useMemo(() => [
    {
      key: 'buildingName',
      label: 'Building',
      placeholder: 'All buildings',
      options: buildings.map((b) => b.name),
    },
    { key: 'status', label: 'Status', placeholder: 'All statuses', options: UNIT_STATES },
    {
      key: 'bhk',
      label: 'Config',
      placeholder: 'All configurations',
      options: [...new Set(units.map((u) => u.bhk).filter(Boolean))],
    },
  ], [buildings, units]);

  /* ---- render ----------------------------------------------------------- */

  return (
    <div className="nx-pi">
      {/* ---- the figures, counted ---- */}
      <section className="nx-pi__panel">
        <header className="nx-pi__panel-head">
          <h3><Layers size={16} /> Inventory</h3>
          <div className="nx-pi__panel-actions">
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setBuildingForm({ status: 'Planned' })}>
              Add building
            </Button>
            <Button size="sm" variant="secondary" icon={Rows3} onClick={() => setBulkForm({
              buildingId: buildings[0]?.id || '', prefix: '', floorFrom: 1, floorTo: 1,
              perFloor: 4, status: 'Available',
            })}>
              Add a floor plan
            </Button>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => setUnitForm({ status: 'Available', buildingId: buildings[0]?.id || '' })}>
              Add unit
            </Button>
          </div>
        </header>

        {loading ? (
          <p className="nx-pi__muted">Loading…</p>
        ) : !inventory ? (
          <p className="nx-pi__empty">
            No units recorded yet. Add a building, then a floor plan — every figure on the
            Overview is counted from these rows.
          </p>
        ) : (
          <>
            <div className="nx-pi__stats">
              <Stat label="Units" value={inventory.total} sub={`across ${inventory.buildings} building${inventory.buildings === 1 ? '' : 's'}`} />
              <Stat label="Available" value={inventory.available} sub={money(inventory.availableValue)} tone="success" />
              <Stat label="Booked &amp; sold" value={inventory.sold} sub={money(inventory.soldValue)} tone="info" />
              <Stat
                label="Sales progress"
                value={inventory.salesProgress === null ? 'Not measurable' : `${inventory.salesProgress}%`}
                sub={inventory.salesProgress === null
                  ? 'Every unit is cancelled'
                  : `${inventory.sold} of ${inventory.total - inventory.counts.Cancelled} sellable`}
              />
              <Stat label="Inventory value" value={money(inventory.totalValue)} sub={inventory.totalArea ? `${inventory.totalArea.toLocaleString('en-IN')} sq ft saleable` : 'Area not recorded'} />
            </div>
            <StateBar counts={inventory.counts} total={inventory.total} />
          </>
        )}
      </section>

      {/* ---- buildings ---- */}
      {buildings.length > 0 && (
        <section className="nx-pi__panel">
          <header className="nx-pi__panel-head">
            <h3><Building2 size={16} /> Buildings <span className="nx-pi__count">{buildings.length}</span></h3>
          </header>
          <div className="nx-pi__buildings">
            {buildings.map((b) => (
              <article key={b.id} className="nx-pi__building">
                <div className="nx-pi__building-top">
                  <div>
                    <h4>{b.name}</h4>
                    <p className="nx-pi__muted">
                      {[b.towerNumber && `Tower ${b.towerNumber}`, b.floors && `${b.floors} floors`, b.code]
                        .filter(Boolean).join(' · ') || 'No details recorded'}
                    </p>
                  </div>
                  <div className="nx-pi__building-acts">
                    <Button variant="ghost" size="sm" icon={SquarePen} aria-label={`Edit ${b.name}`} title="Edit"
                      onClick={() => setBuildingForm({ ...b, expectedCompletion: b.expectedCompletion ? String(b.expectedCompletion).slice(0, 10) : '' })} />
                    <Button variant="ghost" size="sm" icon={Trash2} aria-label={`Delete ${b.name}`} title="Delete"
                      onClick={() => deleteBuilding(b)} />
                  </div>
                </div>
                <div className="nx-pi__building-meta">
                  {b.status && <Pill tone="neutral">{b.status}</Pill>}
                  <span>{b.units.total} unit{b.units.total === 1 ? '' : 's'}</span>
                  {b.units.Available ? <span>{b.units.Available} available</span> : null}
                </div>
                {/* Construction progress is entered by hand, so an absent value
                    says so rather than being drawn as a bar at zero. */}
                <div className="nx-pi__building-progress">
                  <span>{typeof b.constructionProgress === 'number' ? `${b.constructionProgress}% built` : 'Progress not tracked'}</span>
                  <div className={`nx-pi__bar${typeof b.constructionProgress === 'number' ? '' : ' is-unknown'}`}>
                    {typeof b.constructionProgress === 'number' && (
                      <i style={{ width: `${Math.max(0, Math.min(100, b.constructionProgress))}%` }} />
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---- units ---- */}
      {units.length > 0 && (
        <DataTable
          title="Units"
          columns={columns}
          rows={units}
          loading={loading}
          filters={filters}
          searchPlaceholder="Search units…"
          exportName="units"
          persistKey="project-units"
          timestamps={false}
          onDeleteSelected={deleteUnits}
          actions={(row) => (
            <Button
              variant="ghost" size="sm" icon={SquarePen}
              aria-label={`Edit unit ${row.unitNumber}`} title="Edit"
              onClick={() => setUnitForm({ ...row, buildingId: row.buildingId || '' })}
            />
          )}
          emptyMessage="No units match these filters"
        />
      )}

      {/* ---- building form ---- */}
      <Modal
        open={Boolean(buildingForm)}
        onClose={() => setBuildingForm(null)}
        onSubmit={() => { if (!busy) saveBuilding(); }}
        title={buildingForm?.id ? `Edit ${buildingForm.name}` : 'Add a building'}
        description="A tower or block. Plotted developments can skip this and add units directly."
        size="md"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setBuildingForm(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveBuilding} disabled={busy}>
              {busy ? 'Saving…' : 'Save building'}
            </Button>
          </>
        )}
      >
        {buildingForm && (
          <FormGrid columns={2}>
            <Field label="Name" required>
              <Input value={buildingForm.name || ''} onChange={(e) => setBuildingForm({ ...buildingForm, name: e.target.value })} placeholder="Tower A" />
            </Field>
            <Field label="Code">
              <Input value={buildingForm.code || ''} onChange={(e) => setBuildingForm({ ...buildingForm, code: e.target.value })} />
            </Field>
            <Field label="Tower number">
              <Input value={buildingForm.towerNumber || ''} onChange={(e) => setBuildingForm({ ...buildingForm, towerNumber: e.target.value })} />
            </Field>
            <Field label="Floors">
              <Input type="number" min="0" value={buildingForm.floors ?? ''} onChange={(e) => setBuildingForm({ ...buildingForm, floors: e.target.value })} />
            </Field>
            <Field label="Status">
              <Select
                value={buildingForm.status || ''}
                onChange={(e) => setBuildingForm({ ...buildingForm, status: e.target.value })}
                options={BUILDING_STATES}
                placeholder="Select a status"
              />
            </Field>
            <Field label="Construction progress (%)">
              <Input type="number" min="0" max="100" value={buildingForm.constructionProgress ?? ''} onChange={(e) => setBuildingForm({ ...buildingForm, constructionProgress: e.target.value })} />
            </Field>
            <Field label="Expected completion">
              <Input type="date" value={buildingForm.expectedCompletion || ''} onChange={(e) => setBuildingForm({ ...buildingForm, expectedCompletion: e.target.value })} />
            </Field>
            <Field label="Description" className="nx-field--full">
              <Textarea rows={2} value={buildingForm.description || ''} onChange={(e) => setBuildingForm({ ...buildingForm, description: e.target.value })} />
            </Field>
          </FormGrid>
        )}
      </Modal>

      {/* ---- unit form ---- */}
      <Modal
        open={Boolean(unitForm)}
        onClose={() => setUnitForm(null)}
        onSubmit={() => { if (!busy) saveUnit(); }}
        title={unitForm?.id ? `Unit ${unitForm.unitNumber}` : 'Add a unit'}
        description="The status is the inventory — availability, sales and value are all counted from it."
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setUnitForm(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveUnit} disabled={busy}>
              {busy ? 'Saving…' : 'Save unit'}
            </Button>
          </>
        )}
      >
        {unitForm && (
          <FormGrid columns={3}>
            <Field label="Building">
              <Select
                value={unitForm.buildingId || ''}
                onChange={(e) => setUnitForm({ ...unitForm, buildingId: e.target.value })}
                options={[{ value: '', label: 'No building (plot)' },
                  ...buildings.map((b) => ({ value: b.id, label: b.name }))]}
              />
            </Field>
            <Field label="Unit number" required>
              <Input value={unitForm.unitNumber || ''} onChange={(e) => setUnitForm({ ...unitForm, unitNumber: e.target.value })} placeholder="A-1203" />
            </Field>
            <Field label="Floor">
              <Input type="number" value={unitForm.floor ?? ''} onChange={(e) => setUnitForm({ ...unitForm, floor: e.target.value })} />
            </Field>

            <Field label="Configuration">
              <Select value={unitForm.bhk || ''} onChange={(e) => setUnitForm({ ...unitForm, bhk: e.target.value })} options={BHKS} placeholder="Select" />
            </Field>
            <Field label="Unit type">
              <Input value={unitForm.unitType || ''} onChange={(e) => setUnitForm({ ...unitForm, unitType: e.target.value })} placeholder="Apartment" />
            </Field>
            <Field label="Facing">
              <Select value={unitForm.facing || ''} onChange={(e) => setUnitForm({ ...unitForm, facing: e.target.value })} options={FACINGS} placeholder="Select" />
            </Field>

            <Field label="Carpet area (sq ft)">
              <Input type="number" min="0" value={unitForm.carpetArea ?? ''} onChange={(e) => setUnitForm({ ...unitForm, carpetArea: e.target.value })} />
            </Field>
            <Field label="Built-up area (sq ft)">
              <Input type="number" min="0" value={unitForm.builtUpArea ?? ''} onChange={(e) => setUnitForm({ ...unitForm, builtUpArea: e.target.value })} />
            </Field>
            <Field label="Saleable area (sq ft)">
              <Input type="number" min="0" value={unitForm.saleableArea ?? ''} onChange={(e) => setUnitForm({ ...unitForm, saleableArea: e.target.value })} />
            </Field>

            <Field label="Price (₹)" hint="Left blank, this unit is left out of every value total.">
              <Input type="number" min="0" value={unitForm.price ?? ''} onChange={(e) => setUnitForm({ ...unitForm, price: e.target.value })} />
            </Field>
            <Field label="Price per sq ft (₹)">
              <Input type="number" min="0" value={unitForm.pricePerSqft ?? ''} onChange={(e) => setUnitForm({ ...unitForm, pricePerSqft: e.target.value })} />
            </Field>
            <Field label="Parking slots">
              <Input type="number" min="0" value={unitForm.parking ?? ''} onChange={(e) => setUnitForm({ ...unitForm, parking: e.target.value })} />
            </Field>

            <Field label="Status">
              <Select value={unitForm.status || 'Available'} onChange={(e) => setUnitForm({ ...unitForm, status: e.target.value })} options={UNIT_STATES} />
            </Field>
            <Field label="Held for">
              <Input value={unitForm.reservedFor || ''} onChange={(e) => setUnitForm({ ...unitForm, reservedFor: e.target.value })} placeholder="Customer name" />
            </Field>
            <Field label="Notes" className="nx-field--full">
              <Textarea rows={2} value={unitForm.notes || ''} onChange={(e) => setUnitForm({ ...unitForm, notes: e.target.value })} />
            </Field>
          </FormGrid>
        )}
      </Modal>

      {/* ---- bulk add ---- */}
      <Modal
        open={Boolean(bulkForm)}
        onClose={() => setBulkForm(null)}
        onSubmit={() => { if (!busy && bulkRows.length) saveBulk(); }}
        title="Add a floor plan"
        description="Generates one unit per position per floor. Anything unusual can be edited afterwards."
        size="lg"
        footer={(
          <>
            <Button variant="secondary" onClick={() => setBulkForm(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveBulk} disabled={busy || !bulkRows.length}>
              {busy ? 'Adding…' : `Add ${bulkRows.length} unit${bulkRows.length === 1 ? '' : 's'}`}
            </Button>
          </>
        )}
      >
        {bulkForm && (
          <>
            <FormGrid columns={3}>
              <Field label="Building">
                <Select
                  value={bulkForm.buildingId || ''}
                  onChange={(e) => setBulkForm({ ...bulkForm, buildingId: e.target.value })}
                  options={[{ value: '', label: 'No building (plots)' },
                    ...buildings.map((b) => ({ value: b.id, label: b.name }))]}
                />
              </Field>
              <Field label="Number prefix" hint="A- gives A-101, A-102…">
                <Input value={bulkForm.prefix || ''} onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value })} placeholder="A-" />
              </Field>
              <Field label="Units per floor">
                <Input type="number" min="1" max="50" value={bulkForm.perFloor ?? ''} onChange={(e) => setBulkForm({ ...bulkForm, perFloor: e.target.value })} />
              </Field>

              <Field label="From floor">
                <Input type="number" value={bulkForm.floorFrom ?? ''} onChange={(e) => setBulkForm({ ...bulkForm, floorFrom: e.target.value })} />
              </Field>
              <Field label="To floor">
                <Input type="number" value={bulkForm.floorTo ?? ''} onChange={(e) => setBulkForm({ ...bulkForm, floorTo: e.target.value })} />
              </Field>
              <Field label="Status">
                <Select value={bulkForm.status || 'Available'} onChange={(e) => setBulkForm({ ...bulkForm, status: e.target.value })} options={UNIT_STATES} />
              </Field>

              <Field label="Configuration">
                <Select value={bulkForm.bhk || ''} onChange={(e) => setBulkForm({ ...bulkForm, bhk: e.target.value })} options={BHKS} placeholder="Select" />
              </Field>
              <Field label="Facing">
                <Select value={bulkForm.facing || ''} onChange={(e) => setBulkForm({ ...bulkForm, facing: e.target.value })} options={FACINGS} placeholder="Select" />
              </Field>
              <Field label="Unit type">
                <Input value={bulkForm.unitType || ''} onChange={(e) => setBulkForm({ ...bulkForm, unitType: e.target.value })} placeholder="Apartment" />
              </Field>

              <Field label="Carpet area (sq ft)">
                <Input type="number" min="0" value={bulkForm.carpetArea ?? ''} onChange={(e) => setBulkForm({ ...bulkForm, carpetArea: e.target.value })} />
              </Field>
              <Field label="Saleable area (sq ft)">
                <Input type="number" min="0" value={bulkForm.saleableArea ?? ''} onChange={(e) => setBulkForm({ ...bulkForm, saleableArea: e.target.value })} />
              </Field>
              <Field label="Price each (₹)">
                <Input type="number" min="0" value={bulkForm.price ?? ''} onChange={(e) => setBulkForm({ ...bulkForm, price: e.target.value })} />
              </Field>
            </FormGrid>

            {/* Built by the same code that posts, so the preview cannot drift
                from what is actually created. */}
            <div className="nx-pi__preview">
              <p className="nx-pi__muted">
                {bulkRows.length
                  ? `${bulkRows.length} units: ${bulkRows.slice(0, 6).map((r) => r.unitNumber).join(', ')}${bulkRows.length > 6 ? ` … ${bulkRows[bulkRows.length - 1].unitNumber}` : ''}`
                  : 'Set a floor range and units per floor to see what will be created.'}
              </p>
              {bulkRows.length > 500 && (
                <p className="nx-pi__warn">That is more than 500 units — add them in two passes.</p>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
