/* Public lead endpoints (website forms, campaign links) — see utils/leadIntake.js. */
const { intakeLead, IntakeError } = require('../../utils/leadIntake');

/** POST /api/public/leads — a website form. */
exports.websiteLead = async (req, res) => {
  try {
    const { name, mobile, mobileCountryCode, email, project, message, source } = req.body || {};
    const lead = await intakeLead({
      name, mobile, mobileCountryCode, email, project,
      primarySource: source || 'Website',
      notes: message,
      creator: 'Website',
      logSubtitle: 'via website form',
    });
    res.status(201).json({
      success: true,
      message: 'Thank you — your enquiry has been received. We will get back to you shortly.',
      leadId: lead.id,
    });
  } catch (error) {
    if (error instanceof IntakeError) return res.status(400).json({ message: error.message });
    console.error('Website lead creation failed:', error);
    res.status(500).json({ message: 'Failed to submit your enquiry. Please try again later.' });
  }
};

/**
 * GET /api/public/campaign-leads?key=&name=&mobile=&email=&project=&source=&campaign=
 * For ad platforms and form tools that can only call a URL.
 */
exports.campaignLead = async (req, res) => {
  try {
    const { name, mobile, mobileCountryCode, email, project, source, secondarySource, message, campaign } = req.query;
    let notes = message || '';
    if (campaign) notes = notes ? `[Campaign: ${campaign}] ${notes}` : `Campaign: ${campaign}`;
    const lead = await intakeLead({
      name, mobile, mobileCountryCode, email, project,
      primarySource: source || 'Campaign',
      secondarySource,
      notes: notes || null,
      creator: 'Campaign',
      logSubtitle: campaign ? `via campaign: ${campaign}` : 'via campaign form',
    });
    res.status(201).json({ success: true, message: 'Campaign lead submitted successfully.', leadId: lead.id });
  } catch (error) {
    if (error instanceof IntakeError) return res.status(400).json({ message: error.message });
    console.error('Campaign lead creation failed:', error);
    res.status(500).json({ message: 'Failed to submit campaign lead. Please try again later.' });
  }
};
