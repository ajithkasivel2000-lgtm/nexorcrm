const prisma = require('../prismaClient');
const nodemailer = require('nodemailer');

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.mailSetting.findFirst();
    if (!settings) {
      settings = await prisma.mailSetting.create({ data: {} });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching mail settings', error: error.message });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { id, createdAt, updatedAt, ...updateData } = req.body;
    let settings = await prisma.mailSetting.findFirst();
    if (!settings) {
      settings = await prisma.mailSetting.create({ data: updateData });
    } else {
      settings = await prisma.mailSetting.update({ where: { id: settings.id }, data: updateData });
    }
    res.status(200).json(settings);
  } catch (error) {
    res.status(400).json({ message: 'Error updating mail settings', error: error.message });
  }
};

exports.sendTestEmail = async (req, res) => {
  try {
    const { recipientEmail } = req.body;
    
    if (!recipientEmail) {
      return res.status(400).json({ message: 'Recipient email address is required' });
    }

    // Fetch current mail settings
    const settings = await prisma.mailSetting.findFirst();
    if (!settings || !settings.smtpHost) {
      return res.status(400).json({ message: 'SMTP settings not configured. Please save your SMTP settings first.' });
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: settings.smtpAuth === 'True' ? {
        user: settings.smtpUsername,
        pass: settings.smtpPassword
      } : undefined,
      tls: settings.starttls === 'True' ? { rejectUnauthorized: false } : undefined
    });

    // Verify connection
    await transporter.verify();

    // Send test email
    const info = await transporter.sendMail({
      from: `"${settings.fromName || 'PropCRM'}" <${settings.fromEmail}>`,
      to: recipientEmail,
      subject: 'Test Email from PropCRM',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test Email</h2>
          <p>This is a test email from PropCRM to verify your SMTP configuration.</p>
          <p>If you received this email, your SMTP settings are configured correctly!</p>
          <hr />
          <p style="color: #666; font-size: 12px;">Sent via PropCRM - Email System</p>
        </div>
      `
    });

    res.status(200).json({ 
      message: 'Test email sent successfully!', 
      messageId: info.messageId 
    });
  } catch (error) {
    res.status(400).json({ 
      message: 'Failed to send test email', 
      error: error.message 
    });
  }
};
