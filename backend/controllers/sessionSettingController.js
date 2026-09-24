const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { invalidateSettings } = require('../utils/settings');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.sessionSetting.findFirst();
    if (!settings) {
      settings = await prisma.sessionSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error fetching settings', 500);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { id, createdAt, updatedAt, ...updateData } = req.body;
    let settings = await prisma.sessionSetting.findFirst();
    if (!settings) {
      settings = await prisma.sessionSetting.create({ data: updateData });
    } else {
      settings = await prisma.sessionSetting.update({ where: { id: settings.id }, data: updateData });
    }
    // The login path and session sweep read these every few seconds — drop the
    // cache so a change takes effect without waiting for it to age out.
    invalidateSettings('sessionSetting');
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error updating settings', 400);
  }
};