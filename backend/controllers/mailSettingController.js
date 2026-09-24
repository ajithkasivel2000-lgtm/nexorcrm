const prisma = require('../prismaClient');
const { sendError } = require('../utils/apiError');
const { coerceEmails } = require('../utils/email');
const { getTransport } = require('../utils/mailer');

/* The SMTP password never goes back to the browser: whoever can open the page
   could otherwise lift the mailbox's credentials. The form shows a blank box
   that says "leave blank to keep existing", and that is what the update does. */
const withoutSecret = ({ smtpPassword, ...rest }) => ({ ...rest, smtpPassword: '', smtpPasswordSet: Boolean(smtpPassword) });

exports.getSettings = async (req, res) => {
  try {
    let settings = await prisma.mailSetting.findFirst();
    if (!settings) {
      settings = await prisma.mailSetting.create({ data: {} });
    }
    res.status(200).json(withoutSecret(settings));
  } catch (error) {
    sendError(res, error, 'Error fetching mail settings', 500);
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { id, createdAt, updatedAt, smtpPasswordSet, ...updateData } = req.body;
    if (!updateData.smtpPassword) delete updateData.smtpPassword;

    const badEmail = coerceEmails(updateData, [['fromEmail', 'From email address']]);
    if (badEmail) return res.status(400).json({ message: badEmail });
    let settings = await prisma.mailSetting.findFirst();
    if (!settings) {
      settings = await prisma.mailSetting.create({ data: updateData });
    } else {
      settings = await prisma.mailSetting.update({ where: { id: settings.id }, data: updateData });
    }
    res.status(200).json(withoutSecret(settings));
  } catch (error) {
    sendError(res, error, 'Error updating mail settings', 400);
  }
};

exports.sendTestEmail = async (req, res) => {
  try {
    const { recipientEmail } = req.body;

    if (!recipientEmail) {
      return res.status(400).json({ message: 'Recipient email address is required' });
    }

    // The same transport every other email uses, from the saved settings.
    const mail = await getTransport();
    if (!mail) {
      return res.status(400).json({ message: 'SMTP settings not configured (or mail is switched off). Please save your SMTP settings first.' });
    }
    const { settings, transporter } = mail;

    // Verify connection
    await transporter.verify();

    // Send test email
    const info = await transporter.sendMail({
      from: `"${settings.fromName || 'NexorCRM'}" <${settings.fromEmail}>`,
      to: recipientEmail,
      subject: 'Test Email from NexorCRM',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Test Email</h2>
          <p>This is a test email from NexorCRM to verify your SMTP configuration.</p>
          <p>If you received this email, your SMTP settings are configured correctly!</p>
          <hr />
          <p style="color: #666; font-size: 12px;">Sent via NexorCRM - Email System</p>
        </div>
      `
    });

    res.status(200).json({
      message: 'Test email sent successfully!',
      messageId: info.messageId
    });
  } catch (error) {
    sendError(res, error, 'Failed to send test email', 400);
  }
};
