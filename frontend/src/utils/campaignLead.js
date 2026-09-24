/**
 * Identifying campaign leads.
 *
 * Campaign leads arrive through the public endpoint
 * GET /api/public/campaign-leads, which stamps each one with a
 * "Campaign Lead Created" log entry and puts the campaign name in otherNotes
 * as "[Campaign: NAME] message" (or "Campaign: NAME" when there is no message).
 *
 * There is no campaign column on the Lead model, so the log entry is the
 * reliable marker and otherNotes is the fallback for rows whose log was pruned.
 */
const CAMPAIGN_LOG_TITLE = 'Campaign Lead Created';

const hasCampaignLog = (lead) =>
  Array.isArray(lead.logs) && lead.logs.some((l) => l.title === CAMPAIGN_LOG_TITLE);

const campaignFromNotes = (notes) => {
  if (!notes) return '';
  // "[Campaign: Spring Promo] interested"
  const bracketed = notes.match(/^\[Campaign:\s*([^\]]+)\]/i);
  if (bracketed) return bracketed[1].trim();
  // "Campaign: Spring Promo"
  const bare = notes.match(/^Campaign:\s*(.+)$/i);
  return bare ? bare[1].trim() : '';
};

export function isCampaignLead(lead) {
  return hasCampaignLog(lead) || Boolean(campaignFromNotes(lead.otherNotes));
}

/** The campaign name, or '' for a campaign lead submitted without one. */
export function campaignOf(lead) {
  const log = lead.logs?.find((l) => l.title === CAMPAIGN_LOG_TITLE);
  const viaName = log?.subtitle?.match(/via campaign:\s*(.+)$/i);
  if (viaName) return viaName[1].trim();
  return campaignFromNotes(lead.otherNotes);
}

/** The Leads text, with the "[Campaign: X]" prefix stripped back off. */
export function messageOf(lead) {
  const notes = lead.otherNotes || '';
  return notes
    .replace(/^\[Campaign:[^\]]*\]\s*/i, '')
    .replace(/^Campaign:\s*.+$/i, '')
    .trim();
}
