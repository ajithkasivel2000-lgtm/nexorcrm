const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { isSystemTemplate } = require('../utils/emailTemplates');

exports.getTemplates = async (req, res) => {
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    res.status(200).json(templates);
  } catch (error) {
    sendError(res, error, 'Error fetching email templates', 500);
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { name, subject, templateKey, type, status, bodyContent } = req.body;
    
    
    const template = await prisma.emailTemplate.create({
      data: { name, subject, templateKey, type, status, bodyContent }
    });
    res.status(201).json(template);
  } catch (error) {
    sendError(res, error, 'Error creating email template', 400);
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { id: _id, createdAt, updatedAt, ...updateData } = req.body;
    
    const template = await prisma.emailTemplate.update({
      where: { id },
      data: updateData
    });
    res.status(200).json(template);
  } catch (error) {
    sendError(res, error, 'Error updating email template', 400);
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await prisma.emailTemplate.findUnique({ where: { id } });
    if (!template) return res.status(404).json({ message: 'Template not found' });

    // The app sends with this template by key. Deleting it would stop that
    // email for good, without anything failing visibly at the time.
    if (isSystemTemplate(template.templateKey)) {
      return res.status(409).json({
        message: `"${template.name}" is sent by the system and cannot be deleted. `
          + 'Switch it off instead if you want to stop these emails.',
      });
    }

    await prisma.emailTemplate.delete({ where: { id } });
    res.status(200).json({ message: 'Template deleted successfully' });
  } catch (error) {
    sendError(res, error, 'Error deleting email template', 400);
  }
};
