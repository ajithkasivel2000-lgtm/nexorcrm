/**
 * Buildings and units — a project's inventory.
 *
 * Everything the overview reports about units is counted here, from rows. No
 * figure is stored on the project and none is typed twice: "available" is a
 * count of units whose status says so, and it cannot be wrong.
 */
const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { coerceDates } = require('../utils/coerceDates');

/** The states a unit moves through, in order. */
const UNIT_STATES = ['Available', 'Hold', 'Reserved', 'Booked', 'Sold', 'Blocked', 'Cancelled'];

/** States that mean the unit is spoken for. */
const COMMITTED = ['Booked', 'Sold'];

const who = (req) => req.user?.username || null; // authMiddleware sets req.user

/** Columns a client may set on a building. */
const BUILDING_FIELDS = [
  'name', 'code', 'towerNumber', 'floors', 'status',
  'constructionProgress', 'expectedCompletion', 'description',
];

/** Columns a client may set on a unit. */
const UNIT_FIELDS = [
  'buildingId', 'unitNumber', 'floor', 'unitType', 'bhk', 'facing',
  'carpetArea', 'builtUpArea', 'saleableArea', 'balconyArea',
  'price', 'pricePerSqft', 'parking', 'status', 'reservedFor', 'notes',
];

const NUMERIC = new Set([
  'floors', 'constructionProgress', 'floor', 'parking',
  'carpetArea', 'builtUpArea', 'saleableArea', 'balconyArea', 'price', 'pricePerSqft',
]);

const INTEGERS = new Set(['floors', 'constructionProgress', 'floor', 'parking']);

/**
 * Keeps only writable columns, coercing numbers and refusing nonsense.
 *
 * A price that will not parse is an error, not a silent null: a unit quietly
 * stored without its price disappears from every total.
 */
function clean(fields, body) {
  const data = {};
  for (const key of fields) {
    if (!(key in body)) continue;
    let value = body[key];

    if (NUMERIC.has(key)) {
      if (value === '' || value === null) { data[key] = null; continue; }
      const n = Number(value);
      if (!Number.isFinite(n)) return { error: `${key} must be a number` };
      if (n < 0) return { error: `${key} cannot be negative` };
      data[key] = INTEGERS.has(key) ? Math.round(n) : n;
      continue;
    }

    if (typeof value === 'string') value = value.trim();
    data[key] = value === '' ? null : value;
  }
  return { data };
}

/** Confirms the project exists before anything is hung off it. */
async function projectExists(id) {
  if (!id) return false;
  return Boolean(await prisma.project.findUnique({ where: { id } }));
}

/* ===========================================================================
   Buildings
   =========================================================================== */

/** Every building, each with what its own units come to. */
exports.listBuildings = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!(await projectExists(projectId))) return res.status(404).json({ message: 'Project not found' });

    const buildings = await prisma.projectBuilding.findMany({
      where: { projectId },
      orderBy: { name: 'asc' },
    });

    /* Counted per building rather than stored on it: a unit sold changes the
       building's figures, and nobody should have to remember to update them. */
    const grouped = await prisma.projectUnit.groupBy({
      by: ['buildingId', 'status'],
      where: { projectId },
      _count: { id: true },
    });

    const tally = {};
    for (const row of grouped) {
      const key = row.buildingId || '(none)';
      tally[key] = tally[key] || { total: 0 };
      tally[key][row.status] = row._count.id;
      tally[key].total += row._count.id;
    }

    res.status(200).json(buildings.map((b) => ({
      ...b,
      units: tally[b.id] || { total: 0 },
    })));
  } catch (error) {
    sendError(res, error, 'Could not load the buildings', 500);
  }
};

exports.createBuilding = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!(await projectExists(projectId))) return res.status(404).json({ message: 'Project not found' });

    const { data, error } = clean(BUILDING_FIELDS, req.body);
    if (error) return res.status(400).json({ message: error });
    if (!data.name) return res.status(400).json({ message: 'A building name is required' });

    const badDate = coerceDates(data, ['expectedCompletion']);
    if (badDate) return res.status(400).json({ message: badDate });

    const building = await prisma.projectBuilding.create({
      data: { ...data, projectId, createdBy: who(req) },
    });
    res.status(201).json(building);
  } catch (error) {
    sendError(res, error, 'Could not add that building', 400);
  }
};

exports.updateBuilding = async (req, res) => {
  try {
    // Matched on both ids: a building id alone would let one project's
    // building be edited through another's URL.
    const existing = await prisma.projectBuilding.findFirst({
      where: { id: req.params.buildingId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ message: 'Building not found on this project' });

    const { data, error } = clean(BUILDING_FIELDS, req.body);
    if (error) return res.status(400).json({ message: error });

    const badDate = coerceDates(data, ['expectedCompletion']);
    if (badDate) return res.status(400).json({ message: badDate });

    res.status(200).json(await prisma.projectBuilding.update({ where: { id: existing.id }, data }));
  } catch (error) {
    sendError(res, error, 'Could not save that building', 400);
  }
};

/**
 * Removes a building.
 *
 * Refused while it still holds units. Deleting it would set their buildingId
 * to null and quietly move every one of them into "no building", which reads
 * like the units are fine when their tower has gone.
 */
exports.deleteBuilding = async (req, res) => {
  try {
    const existing = await prisma.projectBuilding.findFirst({
      where: { id: req.params.buildingId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ message: 'Building not found on this project' });

    const held = await prisma.projectUnit.count({ where: { buildingId: existing.id } });
    if (held > 0) {
      return res.status(409).json({
        message: `This building still has ${held} unit${held === 1 ? '' : 's'}. Move or delete them first.`,
      });
    }

    await prisma.projectBuilding.delete({ where: { id: existing.id } });
    res.status(200).json({ message: 'Deleted' });
  } catch (error) {
    sendError(res, error, 'Could not delete that building', 500);
  }
};

/* ===========================================================================
   Units
   =========================================================================== */

/** The inventory, filtered. */
exports.listUnits = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!(await projectExists(projectId))) return res.status(404).json({ message: 'Project not found' });

    const q = req.query;
    const where = { projectId };
    if (q.buildingId) where.buildingId = q.buildingId === 'none' ? null : q.buildingId;
    if (q.status) where.status = q.status;
    if (q.bhk) where.bhk = q.bhk;
    if (q.unitType) where.unitType = q.unitType;
    if (q.facing) where.facing = q.facing;
    if (q.floor !== undefined && q.floor !== '') where.floor = Number(q.floor);

    // Ranges, applied only when they parse — a typo in a filter should narrow
    // nothing rather than silently return an empty inventory.
    const range = (field, min, max) => {
      const lo = Number(min);
      const hi = Number(max);
      const cond = {};
      if (min !== undefined && min !== '' && Number.isFinite(lo)) cond.gte = lo;
      if (max !== undefined && max !== '' && Number.isFinite(hi)) cond.lte = hi;
      if (Object.keys(cond).length) where[field] = cond;
    };
    range('price', q.minPrice, q.maxPrice);
    range('saleableArea', q.minArea, q.maxArea);

    const units = await prisma.projectUnit.findMany({
      where,
      orderBy: [{ buildingId: 'asc' }, { floor: 'asc' }, { unitNumber: 'asc' }],
      take: 1000,
      include: { building: { select: { id: true, name: true } } },
    });

    res.status(200).json(units);
  } catch (error) {
    sendError(res, error, 'Could not load the units', 500);
  }
};

/** Checks a unit number is free, since the database cannot when there is no building. */
async function numberTaken(projectId, buildingId, unitNumber, exceptId) {
  const clash = await prisma.projectUnit.findFirst({
    where: {
      projectId,
      buildingId: buildingId || null,
      unitNumber,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
  });
  return Boolean(clash);
}

exports.createUnit = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!(await projectExists(projectId))) return res.status(404).json({ message: 'Project not found' });

    const { data, error } = clean(UNIT_FIELDS, req.body);
    if (error) return res.status(400).json({ message: error });
    if (!data.unitNumber) return res.status(400).json({ message: 'A unit number is required' });

    if (data.status && !UNIT_STATES.includes(data.status)) {
      return res.status(400).json({ message: `Status must be one of: ${UNIT_STATES.join(', ')}` });
    }

    // The building has to belong to this project, or the unit ends up in
    // somebody else's tower.
    if (data.buildingId) {
      const ok = await prisma.projectBuilding.findFirst({
        where: { id: data.buildingId, projectId },
      });
      if (!ok) return res.status(400).json({ message: 'That building is not part of this project' });
    }

    if (await numberTaken(projectId, data.buildingId, data.unitNumber)) {
      return res.status(409).json({ message: `Unit ${data.unitNumber} already exists here` });
    }

    const unit = await prisma.projectUnit.create({
      data: { ...data, projectId, createdBy: who(req) },
    });
    res.status(201).json(unit);
  } catch (error) {
    sendError(res, error, 'Could not add that unit', 400);
  }
};

exports.updateUnit = async (req, res) => {
  try {
    const existing = await prisma.projectUnit.findFirst({
      where: { id: req.params.unitId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ message: 'Unit not found on this project' });

    const { data, error } = clean(UNIT_FIELDS, req.body);
    if (error) return res.status(400).json({ message: error });

    if (data.status && !UNIT_STATES.includes(data.status)) {
      return res.status(400).json({ message: `Status must be one of: ${UNIT_STATES.join(', ')}` });
    }
    if (data.buildingId) {
      const ok = await prisma.projectBuilding.findFirst({
        where: { id: data.buildingId, projectId: req.params.id },
      });
      if (!ok) return res.status(400).json({ message: 'That building is not part of this project' });
    }

    const number = data.unitNumber ?? existing.unitNumber;
    const building = 'buildingId' in data ? data.buildingId : existing.buildingId;
    if (await numberTaken(req.params.id, building, number, existing.id)) {
      return res.status(409).json({ message: `Unit ${number} already exists here` });
    }

    res.status(200).json(await prisma.projectUnit.update({ where: { id: existing.id }, data }));
  } catch (error) {
    sendError(res, error, 'Could not save that unit', 400);
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const existing = await prisma.projectUnit.findFirst({
      where: { id: req.params.unitId, projectId: req.params.id },
    });
    if (!existing) return res.status(404).json({ message: 'Unit not found on this project' });

    /* A sold unit is a record of a sale. Deleting it would take the sale with
       it and leave the totals wrong; cancelling says what happened. */
    if (COMMITTED.includes(existing.status)) {
      return res.status(409).json({
        message: `This unit is ${existing.status.toLowerCase()}. Set it to Cancelled instead of deleting it.`,
      });
    }

    await prisma.projectUnit.delete({ where: { id: existing.id } });
    res.status(200).json({ message: 'Deleted' });
  } catch (error) {
    sendError(res, error, 'Could not delete that unit', 500);
  }
};

/**
 * Adds a floor's worth of units at once.
 *
 * Typing 180 units one at a time is why inventory never gets entered. Anything
 * that would clash is reported rather than skipped silently.
 */
exports.bulkCreateUnits = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!(await projectExists(projectId))) return res.status(404).json({ message: 'Project not found' });

    const rows = Array.isArray(req.body?.units) ? req.body.units : [];
    if (rows.length === 0) return res.status(400).json({ message: 'No units given' });
    if (rows.length > 500) return res.status(400).json({ message: 'Add at most 500 units at a time' });

    const prepared = [];
    const problems = [];

    for (const [i, row] of rows.entries()) {
      const { data, error } = clean(UNIT_FIELDS, row);
      if (error) { problems.push(`Row ${i + 1}: ${error}`); continue; }
      if (!data.unitNumber) { problems.push(`Row ${i + 1}: a unit number is required`); continue; }
      if (data.status && !UNIT_STATES.includes(data.status)) {
        problems.push(`Row ${i + 1}: unknown status "${data.status}"`); continue;
      }
      prepared.push({ ...data, projectId, createdBy: who(req) });
    }

    // Duplicates within the batch, before the database sees them.
    const seen = new Set();
    for (const [i, u] of prepared.entries()) {
      const key = `${u.buildingId || ''}::${u.unitNumber}`;
      if (seen.has(key)) problems.push(`Row ${i + 1}: unit ${u.unitNumber} is listed twice`);
      seen.add(key);
    }

    if (problems.length) return res.status(400).json({ message: problems.join('; ') });

    /* All or nothing: half a floor is worse than none, because nobody can tell
       which half arrived. */
    const created = await prisma.$transaction(
      prepared.map((data) => prisma.projectUnit.create({ data })),
    );

    res.status(201).json({ created: created.length, units: created });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'One of those unit numbers already exists in that building' });
    }
    sendError(res, error, 'Could not add those units', 400);
  }
};

/** The inventory dashboard: counts and value by state. */
exports.inventory = async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!(await projectExists(projectId))) return res.status(404).json({ message: 'Project not found' });
    res.status(200).json(await inventoryFor(projectId));
  } catch (error) {
    sendError(res, error, 'Could not summarise the inventory', 500);
  }
};

/**
 * Counts and sums the units of a project.
 *
 * Returns null when there are none, so the page can say "no inventory
 * recorded" rather than showing zeros that read as "everything is gone".
 */
async function inventoryFor(projectId) {
  const [byStatus, totals, buildings] = await Promise.all([
    prisma.projectUnit.groupBy({
      by: ['status'],
      where: { projectId },
      _count: { id: true },
      _sum: { price: true },
    }),
    prisma.projectUnit.aggregate({
      where: { projectId },
      _count: { id: true },
      _sum: { price: true, saleableArea: true },
    }),
    prisma.projectBuilding.count({ where: { projectId } }),
  ]);

  const total = totals._count.id;
  if (total === 0) return null;

  const counts = {};
  const value = {};
  for (const state of UNIT_STATES) { counts[state] = 0; value[state] = 0; }
  for (const row of byStatus) {
    counts[row.status] = row._count.id;
    value[row.status] = Number(row._sum.price || 0);
  }

  const sold = counts.Sold + counts.Booked;
  // Cancelled units are not for sale and not sold, so they are out of the
  // denominator — counting them would understate progress forever.
  const sellable = total - counts.Cancelled;

  return {
    total,
    buildings,
    counts,
    value,
    totalValue: Number(totals._sum.price || 0),
    soldValue: value.Sold + value.Booked,
    availableValue: value.Available,
    totalArea: Number(totals._sum.saleableArea || 0),
    available: counts.Available,
    sold,
    salesProgress: sellable > 0 ? Math.round((sold / sellable) * 100) : null,
  };
}

module.exports.inventoryFor = inventoryFor;
module.exports.UNIT_STATES = UNIT_STATES;
