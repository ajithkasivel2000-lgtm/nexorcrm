/**
 * The project, as a customer may see it.
 *
 * WHY THIS IS A WHITELIST AND NOT A REDACTION
 * The Project model carries the sales plan next to the sales brochure:
 * salesTarget, monthlyTarget, expectedRevenue, marketingBudget, targetAudience,
 * campaignName, the default lead owner, the internal marketing note. None of
 * that belongs in a customer's inbox, and a redaction list would leak every one
 * of them the day somebody adds a column and forgets. So this names what may go
 * out, the same way siteVisitNotify's customerFields already does for the visit
 * — anything not listed here simply cannot reach a customer template.
 *
 * WHAT IS DELIBERATELY EXCLUDED, and why it is not an oversight:
 *   salesTarget, monthlyTarget, expectedRevenue, salesStatus, salesStartDate,
 *   salesOwner, salesTeam, marketingBudget, marketingNote, targetAudience,
 *   campaignName, projectManager, salesManager, defaultLeadOwner,
 *   defaultOpportunityOwner, locationNote, createdBy, metaTitle,
 *   metaDescription, keywords, archivedAt, internal ids.
 *
 * Everything below is brochure material: what is being built, where, what it
 * costs, and the RERA number a buyer is entitled to see.
 */

/** Indian formatting, because the CRM's phone and currency defaults are +91/INR. */
const inr = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(2).replace(/\.00$/, '')} Lakh`;
  return `₹${n.toLocaleString('en-IN')}`;
};

/** A real number, or null. Zero counts as "not set" for a count or a charge. */
const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

const text = (value) => {
  const s = String(value ?? '').trim();
  return s === '' ? null : s;
};

const date = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
};

/**
 * Amenities and features are stored as free text. They are written with commas,
 * newlines or bullets depending on who typed them, so all three are accepted
 * and the result is a clean list rather than one long run-on line.
 */
const list = (value) => {
  const s = text(value);
  if (!s) return [];
  /* When the author used line breaks, those ARE the list — split on them and
     nothing else. Splitting on commas as well tore sentences in half:
     "Clear titles and legal approvals, with RERA filing underway." became two
     entries. Commas only separate items when the whole field is one line,
     which is how short amenity lists are usually typed. */
  const separator = /\n/.test(s) ? /[\n•|]+/ : /[,;•|]+/;
  return s
    .split(separator)
    .map((part) => part
      .replace(/^[-*\s]+/, '')          // bullet characters
      .replace(/^\d+[.)]\s*/, '')       // "1." and "2)" numbering
      .trim())
    .filter(Boolean)
    /* Headings, not items. These fields are typed by hand and often arrive as
       a formatted block — "Amenities :" on its own line above the list, or
       "Key Features:" partway down. Rendered as chips those read as amenities
       in their own right, so a line that is only a label is dropped. */
    .filter((part) => !/:$/.test(part))
    .slice(0, 40);
};

/** The full postal address from its parts, skipping whatever is not set. */
const addressOf = (p) => [
  text(p.addressLine1), text(p.addressLine2), text(p.landmark),
  text(p.area), text(p.locality), text(p.city), text(p.district),
  text(p.state), text(p.pincode),
].filter(Boolean).join(', ') || null;

/** A price band reads better than two separate numbers. */
const priceBand = (p) => {
  const min = inr(p.minPrice) || inr(p.startingPrice);
  const max = inr(p.maxPrice);
  if (min && max && min !== max) return `${min} – ${max}`;
  return min || max || null;
};

const areaBand = (p) => {
  const min = num(p.minArea);
  const max = num(p.maxArea);
  if (min && max && min !== max) return `${min} – ${max} sq.ft`;
  if (min) return `${min} sq.ft`;
  if (max) return `${max} sq.ft`;
  return null;
};

/**
 * Everything a customer may be shown about a project.
 *
 * Returns null when there is no project, so a caller can fall back to the plain
 * visit message rather than rendering an empty brochure.
 */
function customerProject(project) {
  if (!project) return null;

  const parking = [
    num(project.coveredParking) ? `${num(project.coveredParking)} covered` : null,
    num(project.openParking) ? `${num(project.openParking)} open` : null,
    num(project.visitorParking) ? `${num(project.visitorParking)} visitor` : null,
  ].filter(Boolean).join(', ') || (num(project.parkingCapacity) ? `${num(project.parkingCapacity)} spaces` : null);

  /* The cost sheet. A site visit is exactly when these come up, so they are
     included — but they are the published charges, never the margin behind
     them. Remove any line here and it stops going out; nothing else changes. */
  const charges = [
    ['Booking amount', inr(project.bookingAmount)],
    ['Maintenance', inr(project.maintenanceCharges)],
    ['Parking charges', inr(project.parkingCharges)],
    ['Club house', inr(project.clubHouseCharges)],
    ['Floor rise', inr(project.floorRiseCharges)],
    ['Corpus fund', inr(project.corpusFund)],
    ['Other charges', inr(project.otherCharges)],
    ['GST', num(project.gstPercent) ? `${num(project.gstPercent)}%` : null],
    ['Stamp duty', num(project.stampDutyPercent) ? `${num(project.stampDutyPercent)}%` : null],
    ['Registration', num(project.registrationPercent) ? `${num(project.registrationPercent)}%` : null],
  ].filter(([, v]) => v);

  const configuration = [
    ['Property type', text(project.propertyType) || text(project.projectType)],
    ['Land area', num(project.landArea) ? `${num(project.landArea)} ${text(project.landAreaUnit) || 'acre'}` : null],
    ['Buildings', num(project.totalBuildings)],
    ['Floors', num(project.totalFloors)],
    ['Total units', num(project.totalUnitsPlanned)],
    ['Unit sizes', areaBand(project)],
    ['Parking', parking],
    ['Facing', text(project.facing)],
  ].filter(([, v]) => v !== null && v !== undefined);

  const status = [
    ['Status', text(project.projectStatus)],
    ['Current phase', text(project.currentPhase)],
    ['Possession', date(project.expectedCompletion)],
    ['Launched', date(project.launchDate)],
    ['Construction progress', num(project.constructionProgress) ? `${num(project.constructionProgress)}%` : null],
  ].filter(([, v]) => v);

  return {
    name: text(project.projectName),
    tagline: text(project.tagline),
    summary: text(project.shortDescription) || text(project.description),
    usp: text(project.usp),

    highlights: list(project.keyHighlights),
    amenities: list(project.projectAmenities),
    features: list(project.features),

    priceBand: priceBand(project),
    pricePerSqft: inr(project.pricePerSqft),
    charges,

    configuration,
    status,

    builder: text(project.builder) || text(project.developers) || text(project.promoter),
    rera: text(project.reraNumber),
    reraDate: date(project.reraDate),

    address: addressOf(project) || text(project.projectLocation),
    mapLink: text(project.mapLink),
    website: text(project.website) || text(project.landingPageUrl),
    contact: text(project.projectContact),
    email: text(project.projectEmail),
  };
}

module.exports = { customerProject, inr };
