const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

/**
 * Designation, Branch and Location — three lists with identical behaviour.
 *
 * Written once and bound to a model rather than copied three times: the CRUD
 * is the same in every respect, and three near-identical files is three places
 * for a fix to be applied twice and forgotten once.
 *
 * Deleting is guarded. The user record stores the *name*, not an id, so
 * removing an entry does not orphan anything — but it does mean the people
 * already carrying that name keep it while it disappears from the list, and
 * quietly losing a value from a dropdown people still have set is worse than
 * being told. So a master in use is refused, with the count.
 */

/** The three lists this controller serves, and how a user refers to each. */
const MASTERS = {
  designation: { model: 'designation', userField: 'designation', label: 'Designation' },
  branch: { model: 'branch', userField: 'branch', label: 'Branch' },
  location: { model: 'location', userField: 'location', label: 'Location' },
};

/** Resolves :master from the URL, or null for anything not on the list. */
const masterFor = (key) => MASTERS[String(key || '').toLowerCase()] || null;

exports.list = async (req, res) => {
  const m = masterFor(req.params.master);
  if (!m) return res.status(404).json({ message: 'Unknown master list.' });
  try {
    const rows = await prisma[m.model].findMany({ orderBy: { name: 'asc' } });
    return res.status(200).json(rows);
  } catch (error) {
    return sendError(res, error, `Error fetching ${m.label.toLowerCase()}s`, 500);
  }
};

exports.create = async (req, res) => {
  const m = masterFor(req.params.master);
  if (!m) return res.status(404).json({ message: 'Unknown master list.' });

  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ message: `${m.label} name is required.` });
  if (name.length > 120) return res.status(400).json({ message: `${m.label} name is too long.` });

  try {
    const row = await prisma[m.model].create({ data: { name } });
    return res.status(201).json(row);
  } catch (error) {
    /* Unique violation. Returning the existing row rather than an error makes
       the inline "add" in a dropdown idempotent: two people adding the same
       branch at once both end up with it selected, which is what they meant. */
    if (error.code === 'P2002') {
      const existing = await prisma[m.model].findFirst({ where: { name } });
      if (existing) return res.status(200).json(existing);
      return res.status(409).json({ message: `That ${m.label.toLowerCase()} already exists.` });
    }
    return sendError(res, error, `Error creating ${m.label.toLowerCase()}`, 400);
  }
};

exports.update = async (req, res) => {
  const m = masterFor(req.params.master);
  if (!m) return res.status(404).json({ message: 'Unknown master list.' });

  const name = String(req.body?.name ?? '').trim();
  if (!name) return res.status(400).json({ message: `${m.label} name is required.` });

  try {
    const before = await prisma[m.model].findUnique({ where: { id: req.params.id } });
    if (!before) return res.status(404).json({ message: `${m.label} not found.` });

    const row = await prisma[m.model].update({ where: { id: req.params.id }, data: { name } });

    /* Users store the name, so a rename here has to follow through or every
       person on the old spelling silently falls off the list. Same reasoning
       as renaming a project carrying its round-robin queues along. */
    if (before.name !== name) {
      const moved = await prisma.user.updateMany({
        where: { [m.userField]: before.name },
        data: { [m.userField]: name },
      });
      if (moved.count > 0) {
        console.log(`[master] ${m.label} "${before.name}" → "${name}" on ${moved.count} user(s)`);
      }
    }

    return res.status(200).json(row);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: `That ${m.label.toLowerCase()} already exists.` });
    }
    return sendError(res, error, `Error updating ${m.label.toLowerCase()}`, 400);
  }
};

exports.remove = async (req, res) => {
  const m = masterFor(req.params.master);
  if (!m) return res.status(404).json({ message: 'Unknown master list.' });

  try {
    const row = await prisma[m.model].findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ message: `${m.label} not found.` });

    // In use: say so, with the number, instead of removing it from under them.
    const inUse = await prisma.user.count({ where: { [m.userField]: row.name } });
    if (inUse > 0) {
      return res.status(409).json({
        message: `"${row.name}" is set on ${inUse} user${inUse === 1 ? '' : 's'}. `
          + 'Change them first, or rename this entry instead of deleting it.',
        inUse,
      });
    }

    await prisma[m.model].delete({ where: { id: req.params.id } });
    return res.status(200).json({ message: 'Deleted successfully' });
  } catch (error) {
    return sendError(res, error, `Error deleting ${m.label.toLowerCase()}`, 500);
  }
};

/** How many users carry each entry — what an admin screen needs to show. */
exports.usage = async (req, res) => {
  const m = masterFor(req.params.master);
  if (!m) return res.status(404).json({ message: 'Unknown master list.' });
  try {
    const rows = await prisma[m.model].findMany({ orderBy: { name: 'asc' } });
    const counts = await prisma.user.groupBy({
      by: [m.userField],
      _count: { _all: true },
    }).catch(() => []);
    const byName = Object.fromEntries(counts.map((c) => [c[m.userField], c._count._all]));
    return res.status(200).json(rows.map((r) => ({ ...r, inUse: byName[r.name] || 0 })));
  } catch (error) {
    return sendError(res, error, `Error fetching ${m.label.toLowerCase()} usage`, 500);
  }
};

module.exports.MASTERS = MASTERS;
