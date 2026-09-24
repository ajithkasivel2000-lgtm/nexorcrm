const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { invalidateSettings } = require('../utils/settings');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.registrationSetting.findFirst();
    if (!settings) {
      settings = await prisma.registrationSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error fetching settings', 500);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    let settings = await prisma.registrationSetting.findFirst();
    if (!settings) {
      settings = await prisma.registrationSetting.create({ data: req.body });
    } else {
      settings = await prisma.registrationSetting.update({ where: { id: settings.id }, data: req.body });
    }
    // The signup endpoint enforces these — pick up the change immediately.
    invalidateSettings('registrationSetting');
    res.status(200).json(settings);
  } catch (error) {
    sendError(res, error, 'Error updating settings', 400);
  }
};