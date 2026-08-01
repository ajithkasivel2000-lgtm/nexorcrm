const prisma = require('../prismaClient');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.securitySetting.findFirst();
    if (!settings) {
      settings = await prisma.securitySetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
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
    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: 'Error updating settings', error: error.message });
  }
};