const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

/**
 * The reminder engine's settings. One row, like every other settings table
 * here, and every timing editable so none of them is a constant somebody has
 * to redeploy to change.
 */

/** Guard rails, not preferences. */
const LIMITS = {
  leadMinutes: [1, 60 * 24 * 14],          // a fortnight of notice at most
  repeatMinutes: [1, 60 * 24],             // no tighter than a minute
  maxReminders: [0, 500],                  // 0 = no cap
  overdueRepeatMinutes: [1, 60 * 24 * 7],
  escalateAfterMinutes: [0, 60 * 24 * 30], // 0 = never escalate
  maxOverdueReminders: [0, 500],           // 0 = no cap; 4 by default
};

const INTEGER_FIELDS = Object.keys(LIMITS);
const BOOLEAN_FIELDS = [
  'enabled', 'overdueEnabled', 'channelInApp', 'channelPush', 'channelEmail',
];

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.reminderSetting.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!settings) settings = await prisma.reminderSetting.create({ data: {} });
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error fetching reminder settings', 500);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const body = req.body || {};
    const updateData = {};

    for (const field of INTEGER_FIELDS) {
      if (body[field] === undefined) continue;
      const value = Number(body[field]);
      const [min, max] = LIMITS[field];
      if (!Number.isInteger(value) || value < min || value > max) {
        return res.status(400).json({
          message: `${field} must be a whole number between ${min} and ${max}.`,
        });
      }
      updateData[field] = value;
    }

    for (const field of BOOLEAN_FIELDS) {
      if (body[field] !== undefined) updateData[field] = Boolean(body[field]);
    }

    /* A series that repeats less often than it starts would send exactly one
       reminder and call it a series — almost certainly a typo, and silently
       doing nothing is worse than saying so. */
    const lead = updateData.leadMinutes ?? null;
    const repeat = updateData.repeatMinutes ?? null;
    if (lead !== null && repeat !== null && repeat > lead) {
      return res.status(400).json({
        message: 'The repeat interval cannot be longer than the reminder lead time — '
          + 'that would send one reminder and no more.',
      });
    }

    let settings = await prisma.reminderSetting.findFirst({ orderBy: { createdAt: 'asc' } });
    settings = settings
      ? await prisma.reminderSetting.update({ where: { id: settings.id }, data: updateData })
      : await prisma.reminderSetting.create({ data: updateData });

    /* Nothing to invalidate: the sweep reads this row on every tick, so a new
       timing applies from the next minute rather than the next restart. */
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error updating reminder settings', 400);
  }
};
