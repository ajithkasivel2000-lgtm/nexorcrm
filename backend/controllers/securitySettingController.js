const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { invalidateSettings } = require('../utils/settings');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.securitySetting.findFirst();
    if (!settings) {
      settings = await prisma.securitySetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error fetching settings', 500);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await prisma.securitySetting.findFirst();
    if (!settings) {
      settings = await prisma.securitySetting.create({ data: req.body });
    } else {
      settings = await prisma.securitySetting.update({ where: { id: settings.id }, data: req.body });
    }
    // Login checks the banned list — pick it up immediately.
    invalidateSettings('securitySetting');
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error updating settings', 400);
  }
};