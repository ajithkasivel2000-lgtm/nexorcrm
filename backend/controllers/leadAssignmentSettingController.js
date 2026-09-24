const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');

/**
 * "Lead Auto Reassignment Timeout", and nothing else reads a number but this.
 *
 * One row, like every other settings table here. The window is stored in
 * minutes so 15, 30, 45 or 60 is a value an administrator types rather than a
 * constant somebody has to redeploy.
 */

/** Guard rails, not preferences: a zero-minute window would reassign on sight. */
const MIN_MINUTES = 1;
const MAX_MINUTES = 60 * 24 * 7;   // a week

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.leadAssignmentSetting.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!settings) settings = await prisma.leadAssignmentSetting.create({ data: {} });
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error fetching lead assignment settings', 500);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { id, createdAt, updatedAt, ...body } = req.body;

    const updateData = {};

    if (body.timeoutMinutes !== undefined) {
      const minutes = Number(body.timeoutMinutes);
      if (!Number.isInteger(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
        return res.status(400).json({
          message: `Timeout must be a whole number of minutes between ${MIN_MINUTES} and ${MAX_MINUTES}.`,
        });
      }
      updateData.timeoutMinutes = minutes;
    }

    if (body.enabled !== undefined) updateData.enabled = Boolean(body.enabled);

    if (body.maxCycles !== undefined) {
      const cycles = Number(body.maxCycles);
      if (!Number.isInteger(cycles) || cycles < 0) {
        return res.status(400).json({ message: 'Max cycles must be 0 (no limit) or a positive whole number.' });
      }
      updateData.maxCycles = cycles;
    }

    let settings = await prisma.leadAssignmentSetting.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!settings) {
      settings = await prisma.leadAssignmentSetting.create({ data: updateData });
    } else {
      settings = await prisma.leadAssignmentSetting.update({ where: { id: settings.id }, data: updateData });
    }

    /* Switching it off stops the clocks that are already running.
       Leaving them would show a countdown in every open lead promising a
       handover that the sweep has just been told never to make, and each would
       sit at "overdue" indefinitely. The setting says "leave every lead with
       its current owner", so this makes that true of the leads already in
       flight and not only of the next ones. */
    let standDown = 0;
    if (updateData.enabled === false) {
      const stopped = await prisma.leadAssignment.updateMany({
        where: { state: 'waiting' },
        data: {
          state: 'cancelled',
          settledAt: new Date(),
          reason: 'automatic reassignment was switched off',
        },
      });
      standDown = stopped.count;
    }

    /* Nothing to invalidate: the sweep reads this row on every run, so the new
       window applies from the next minute rather than the next restart. */
    return res.status(200).json({ ...settings, pendingCancelled: standDown });
  } catch (error) {
    return sendError(res, error, 'Error updating lead assignment settings', 400);
  }
};
