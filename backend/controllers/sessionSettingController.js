const prisma = require('../prismaClient');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.sessionSetting.findFirst();
    if (!settings) {
      settings = await prisma.sessionSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching settings', error: error.message });
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
    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: 'Error updating settings', error: error.message });
  }
};