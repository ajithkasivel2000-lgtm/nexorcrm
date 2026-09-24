const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { invalidateSettings } = require('../utils/settings');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.globalUserSetting.findFirst();
    if (!settings) {
      settings = await prisma.globalUserSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error fetching settings', 500);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await prisma.globalUserSetting.findFirst();
    if (!settings) {
      settings = await prisma.globalUserSetting.create({ data: req.body });
    } else {
      settings = await prisma.globalUserSetting.update({ where: { id: settings.id }, data: req.body });
    }
    // Login redirects by these — pick up the change immediately.
    invalidateSettings('globalUserSetting');
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error updating settings', 400);
  }
};