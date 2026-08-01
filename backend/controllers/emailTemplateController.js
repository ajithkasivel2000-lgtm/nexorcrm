const prisma = require('../prismaClient');

exports.getTemplates = async (req, res) => {
  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { updatedAt: 'desc' }
    });
    res.status(200).json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching email templates', error: error.message });
  }
};

exports.createTemplate = async (req, res) => {
  try {
    const { name, subject, templateKey, type, status, bodyContent } = req.body;
    
    // Generate custom template ID in format ET-YYYY-NNN
    const currentYear = new Date().getFullYear();
    const prefix = `ET-${currentYear}-`;
    
    const lastTemplateThisYear = await prisma.emailTemplate.findFirst({
      where: { templateId: { startsWith: prefix } },
      orderBy: { templateId: 'desc' }
    });

    let nextNumber = 1;
    if (lastTemplateThisYear && lastTemplateThisYear.templateId) {
      const lastNumberStr = lastTemplateThisYear.templateId.split('-').pop();
      const lastNumber = parseInt(lastNumberStr, 10);
      if (!isNaN(lastNumber)) {
        nextNumber = lastNumber + 1;
      }
    }
    
    const templateId = `${prefix}${String(nextNumber).padStart(3, '0')}`;
    
    const template = await prisma.emailTemplate.create({
      data: { templateId, name, subject, templateKey, type, status, bodyContent }
    });
    res.status(201).json(template);
  } catch (error) {
    res.status(400).json({ message: 'Error creating email template', error: error.message });
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
    res.status(400).json({ message: 'Error updating email template', error: error.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.emailTemplate.delete({
      where: { id }
    });
    res.status(200).json({ message: 'Template deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: 'Error deleting email template', error: error.message });
  }
};
