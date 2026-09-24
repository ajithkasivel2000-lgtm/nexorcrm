/**
 * The Project Status tiles: a figure, what it was last period, and a shape.
 *
 * WHAT THE NUMBERS MEAN — worth being exact, because two of them could each be
 * read two ways:
 *
 *   count     leads that are AT this status now and were created inside the
 *             selected window. Not "leads that entered this status during the
 *             window": nothing in this database records when a lead reached a
 *             status. Status changes are written to LeadLog as a sentence
 *             ("New Lead → Site Visit"), not as a field change, so there is no
 *             honest way to count transitions per day yet. See the note at the
 *             bottom of this file.
 *
 *   previous  the same count for the window immediately before this one, of
 *             equal length. That is what the percentage compares against.
 *
 *   series    the same population, bucketed by the day each lead was created,
 *             which is what the little bar chart draws.
 *
 * One database round trip per tile would be fourteen queries plus fourteen more
 * for the previous window. Instead the leads in range are fetched once and the
 * tiles are counted in memory — a dashboard is a handful of thousand rows at
 * most, and the alternative is thirty queries on every filter change.
 */

const prisma = require('../prismaClient');

/** The tiles, in the order they appear, and how each one is decided. */
const TILES = [
  { key: 'Today Leads', basis: 'vs yesterday', today: true },
  { key: 'New Lead', status: ['New Lead'] },
  { key: 'Attempted', status: ['Attempted'] },
  { key: 'Interested', status: ['Interested'] },
  { key: 'Allocate', status: ['Allocate'] },
  { key: 'Site Visit', status: ['Site Visit'] },
  { key: 'Rejected', status: ['Rejected'] },
  { key: 'Duplicate', status: ['Duplicate'] },
  { key: 'Opportunity', status: ['Opportunity'] },
  { key: 'Missed Follow Up', missedFollowUp: true },
  /* The site-visit stages live in their own column, and the values stored
     there are the short forms — 'Scheduled', not 'Site Visit Scheduled'. Both
     are matched so a tile keeps working whichever way a row was written. */
  { key: 'Site Visit Done', visit: ['Done', 'Site Visit Done'] },
  { key: 'Site Visit Confirmed', visit: ['Confirmed', 'Site Visit Confirmed'] },
  { key: 'Re Scheduled Visit', visit: ['Re Scheduled', 'Re Scheduled Visit', 'Rescheduled'] },
  { key: 'Site Visit Scheduled', visit: ['Scheduled', 'Site Visit Scheduled'] },
];

const DAY = 24 * 60 * 60 * 1000;

const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Whole days across the window, capped so the bar chart stays readable. */
function bucketsFor(from, to) {
  const days = Math.max(1, Math.min(14, Math.round((to - from) / DAY) || 1));
  const edges = [];
  for (let i = 0; i < days; i += 1) {
    edges.push(new Date(to.getTime() - (days - i) * DAY));
  }
  return edges;
}

/** Percentage change, and null when there is nothing to compare against. */
function changeOf(count, previous) {
  if (previous === 0) return count > 0 ? 100 : 0;
  return Math.round(((count - previous) / previous) * 1000) / 10;
}

/**
 * @param {object} leadFilter  the role/project scope the dashboard already built
 * @param {Date}   from        window start
 * @param {Date}   to          window end
 */
async function projectStatusStats(leadFilter, from, to) {
  const span = Math.max(DAY, to - from);
  const prevFrom = new Date(from.getTime() - span);

  /* Everything from the start of the previous window onwards, once. The
     previous window is included so both figures come from one read. */
  const leads = await prisma.lead.findMany({
    where: { ...leadFilter, createdAt: { gte: prevFrom, lte: to } },
    select: { id: true, status: true, siteVisitStatus: true, followUpDate: true, createdAt: true },
  });

  /* The opportunity rows themselves, not a bare count: the tile needs a date
     per row to bucket its bars, and a count would have left it showing a
     figure above an empty chart. */
  const opportunities = await prisma.opportunity.findMany({
    where: { createdAt: { gte: prevFrom, lte: to } },
    select: { id: true, createdAt: true },
  }).catch(() => []);

  const now = new Date();
  const today = startOfDay(now);
  const yesterday = new Date(today.getTime() - DAY);

  const inWindow = (l) => l.createdAt >= from && l.createdAt <= to;
  const inPrevious = (l) => l.createdAt >= prevFrom && l.createdAt < from;

  /** Does this lead belong on this tile? */
  const matches = (tile, lead) => {
    if (tile.status) return tile.status.includes(lead.status);
    if (tile.visit) return tile.visit.includes(lead.siteVisitStatus);
    if (tile.missedFollowUp) {
      return Boolean(lead.followUpDate)
        && lead.followUpDate < now
        && !['Rejected', 'Duplicate', 'Closed'].includes(lead.status);
    }
    return false;
  };

  const edges = bucketsFor(from, to);

  return TILES.map((tile) => {
    /* Today Leads is its own thing: a count of today against yesterday,
       regardless of the window chosen above it. */
    if (tile.today) {
      const count = leads.filter((l) => l.createdAt >= today).length;
      const previous = leads.filter((l) => l.createdAt >= yesterday && l.createdAt < today).length;
      const series = edges.map((edge) => leads.filter(
        (l) => l.createdAt >= edge && l.createdAt < new Date(edge.getTime() + DAY),
      ).length);
      return { key: tile.key, count, previous, change: changeOf(count, previous), basis: tile.basis, series };
    }

    /* Opportunities are their own table, so every figure on this tile comes
       from there — count, comparison and bars alike. Mixing the two sources
       (an opportunity-table count above a lead-status series) put a 1 over an
       empty chart, which reads as a bug rather than as a number. */
    if (tile.key === 'Opportunity') {
      const count = opportunities.filter(inWindow).length;
      const previous = opportunities.filter(inPrevious).length;
      const series = edges.map((edge) => opportunities.filter(
        (o) => o.createdAt >= edge && o.createdAt < new Date(edge.getTime() + DAY),
      ).length);
      return { key: tile.key, count, previous, change: changeOf(count, previous), basis: 'vs last week', series };
    }

    const mine = leads.filter((l) => matches(tile, l));
    const count = mine.filter(inWindow).length;
    const previous = mine.filter(inPrevious).length;
    const series = edges.map((edge) => mine.filter(
      (l) => l.createdAt >= edge && l.createdAt < new Date(edge.getTime() + DAY),
    ).length);

    return { key: tile.key, count, previous, change: changeOf(count, previous), basis: 'vs last week', series };
  });
}

/*
 * A note on making these truer.
 *
 * Every figure above is anchored to createdAt because that is the only date
 * this schema records for a lead's place in the pipeline. To answer "how many
 * leads reached Site Visit this week" the status change itself has to be
 * recorded as data — updateLeadStatus already writes a LeadLog row, and giving
 * it field/oldValue/newValue (the shape opportunityController already uses)
 * would be enough. The tiles could then count transitions per day, which is
 * what a pipeline dashboard usually means. Left alone here because it changes
 * what is written, not just what is read, and only helps from that day on.
 */

module.exports = { projectStatusStats, TILES };
