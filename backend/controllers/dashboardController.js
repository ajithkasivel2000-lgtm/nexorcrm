const prisma = require('../prismaClient');
const { projectStatusStats } = require('../utils/projectStatusStats');
const { sendError } = require('../utils/apiError');
const { isSuperUser, isManagerUser } = require('../middleware/authMiddleware');

/**
 * A count that cannot take the dashboard down with it.
 *
 * Every figure on this screen was gathered in one Promise.all, so a single
 * rejection rejected the lot and the whole dashboard answered 500 — which the
 * screen drew as a full set of zeros. That is exactly what was happening: the
 * 'Leads' model (the renamed enquiry table) is declared in schema.prisma but
 * was never migrated into Postgres, so counting it threw P2021 and took
 * fourteen working tiles down with it for the sake of one number the screen
 * does not even display.
 *
 * A missing figure is now a zero and a line in the log, not a blank dashboard.
 */
const safeCount = (label, run) => Promise.resolve()
  .then(run)
  .catch((error) => {
    console.error(`Dashboard: could not count ${label} — ${String(error.message).split(String.fromCharCode(10))[0]}`);
    return 0;
  });

exports.getDashboardStats = async (req, res) => {
  try {
    const { project, viewAsRole, specificUser } = req.query;

    /* The Project Status tiles are filtered by date as well as by project.
       Both ends are optional: with neither, the window is the last 30 days,
       which is what the tiles showed before there was a picker. An unparseable
       date falls back rather than answering 400 — a dashboard that refuses to
       load because of a malformed query string helps nobody. */
    const parseDate = (value, fallback) => {
      if (!value) return fallback;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? fallback : d;
    };
    const rangeTo = parseDate(req.query.to, new Date());
    const rangeFrom = parseDate(req.query.from, new Date(rangeTo.getTime() - 30 * 24 * 60 * 60000));

    // Base filters
    const leadFilter = {};
    const oppFilter = {};

    if (project && project !== 'All Projects') {
      leadFilter.project = project;
      oppFilter.LeadsProject = project;
    }

    /* ------------------------------------------------------------------
       Who this dashboard is allowed to count.

       The identity is the verified session user (req.user, set by
       authMiddleware) — never the ?username= query parameter, which any
       caller could set to anyone, or omit entirely, to read another
       person's figures.

       ?viewAsRole= and ?specificUser= are preview features for staff:
       viewAsRole is honoured only for the superuser, and specificUser only
       for manager-and-above — and a manager can never aim it at an Admin.
       For everyone else both are ignored and the dashboard counts their own
       work. `lead.owner` holds a user id — USR-2026-004 — while older rows
       hold a username, and the two were never normalised; matching both
       forms is why an employee's dashboard used to read zero.
       ------------------------------------------------------------------ */
    const ownerWhere = (users) => {
      const keys = [...new Set(users.flatMap((u) => [u.id, u.username]))].filter(Boolean);
      return {
        lead: { OR: [{ ownerId: { in: keys } }, { owner: { in: keys } }] },
        opp: { opportunityOwner: { in: keys } },
      };
    };

    const staffWith = (statuses) => prisma.user.findMany({
      where: { status: { in: statuses } },
      select: { id: true, username: true },
    });

    /** One user by username or id, or null. */
    const findUser = (key) => prisma.user.findFirst({
      where: { OR: [{ username: key }, { id: key }] },
      select: { id: true, username: true, status: true },
    });

    const applyScope = (users) => {
      const w = ownerWhere(users);
      Object.assign(leadFilter, w.lead);
      Object.assign(oppFilter, w.opp);
    };

    const me = req.user;
    const superUser = isSuperUser(me);
    const manager = isManagerUser(me);

    // What the figures cover: one person, a team, or the whole company.
    let scope = 'all';

    // Which lens the dashboard is viewed through. Only the superuser may
    // choose one; everyone else sees the view their own role dictates, and
    // an unrecognised role counts only their own work (default-deny).
    let activeView;
    if (superUser) {
      activeView = ['Superadmin', 'Admin', 'Manager', 'Employee'].includes(viewAsRole)
        ? viewAsRole
        : 'Superadmin';
    } else if (me.status === 'Admin') {
      activeView = 'Admin';
    } else if (me.status === 'Manager') {
      activeView = 'Manager';
    } else if (me.status === 'Employee') {
      activeView = 'Employee';
    } else {
      activeView = 'Own';
    }

    if (specificUser && manager) {
      // A named person's figures — a staff preview feature. A manager cannot
      // aim it at an Admin; an unresolvable name falls back to the view
      // below rather than to an empty dashboard; a rejected request falls
      // back to the caller's own figures.
      const one = await findUser(specificUser);
      if (one && (superUser || one.status !== 'Admin')) {
        applyScope([one]);
        scope = 'own';
      } else if (!one) {
        // fall through to the view-based scope
      } else {
        applyScope([me]);
        scope = 'own';
      }
    }

    if (scope !== 'own') {
      if (activeView === 'Superadmin') {
        // no owner filter: everything
      } else if (activeView === 'Admin') {
        applyScope(await staffWith(['Admin', 'Manager', 'Employee']));
        scope = 'team';
      } else if (activeView === 'Manager') {
        applyScope(await staffWith(['Manager', 'Employee']));
        scope = 'team';
      } else if (activeView === 'Employee') {
        // A real employee sees their own work and nobody else's. An admin or
        // manager previewing the employee view sees what employees hold
        // between them.
        if (me.status === 'Employee') {
          applyScope([me]);
          scope = 'own';
        } else {
          applyScope(await staffWith(['Employee']));
          scope = 'team';
        }
      } else {
        // 'Own' or anything unrecognised: just the signed-in user's work.
        applyScope([me]);
        scope = 'own';
      }
    }

    /* Staff numbers are company information, not the signed-in person's work.
       Someone looking at their own figures has no business seeing the headcount
       — and the card links to a settings page they cannot open. */
    const showStaffCounts = scope !== 'own';

    // 1. Get status counts for leads
    const statusCounts = await prisma.lead.groupBy({
      by: ['status'],
      _count: {
        id: true
      },
      where: leadFilter
    });

    const leadStats = {};
    statusCounts.forEach(item => {
      leadStats[item.status] = item._count.id;
    });

    // "Today Leads"
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayLeadsCount = await prisma.lead.count({
      where: {
        ...leadFilter,
        createdAt: {
          gte: startOfToday
        }
      }
    });

    // 2. Count opportunities
    const opportunityCount = await prisma.opportunity.count({
      where: oppFilter
    });

    // 3. Lead Insights Pie Chart (Group by primarySource)
    const leadInsights = await prisma.lead.groupBy({
      by: ['primarySource'],
      _count: { id: true },
      where: leadFilter
    });

    // 4. SiteVisits Insights Pie Chart — group by siteVisitStatus
    const siteVisitsInsights = await prisma.lead.groupBy({
      by: ['siteVisitStatus'],
      _count: { id: true },
      where: {
        ...leadFilter,
        siteVisitStatus: { not: null }
      }
    });

    // 5. Digit Lead Stats Table
    const digitLeadStatsRaw = await prisma.lead.findMany({
      where: leadFilter,
      select: {
        primarySource: true,
        tertiarySource: true,
        status: true
      }
    });

    const digitStatsMap = {};

    digitLeadStatsRaw.forEach(lead => {
      const source = lead.primarySource || 'Unknown';
      const tertiary = lead.tertiarySource || '-';
      const key = `${source}-${tertiary}`;

      if (!digitStatsMap[key]) {
        digitStatsMap[key] = {
          source,
          tertiary,
          totalLead: 0,
          totalOpenLead: 0,
          totalRejectLead: 0
        };
      }

      digitStatsMap[key].totalLead++;
      if (lead.status === 'Rejected') {
        digitStatsMap[key].totalRejectLead++;
      } else {
        digitStatsMap[key].totalOpenLead++;
      }
    });

    const digitLeadStats = Object.values(digitStatsMap).map(stat => ({
      ...stat,
      top: stat.totalLead > 0 ? Math.round((stat.totalOpenLead / stat.totalLead) * 100) + '%' : '0%'
    }));

    /* ---- helpers -------------------------------------------------------- */

    // groupBy returns [{ <field>: value, _count: { <field>: n } }]; the charts
    // want [{ name, value }] sorted by size, with blanks named rather than lost.
    const tally = (rows, field, blank = 'Not set') => rows
      .map((r) => ({ name: (r[field] ?? '').toString().trim() || blank, value: r._count[field] }))
      .sort((a, b) => b.value - a.value);

    const startOfDay = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

    const today = startOfDay();
    const tomorrow = addDays(today, 1);
    const weekAhead = addDays(today, 7);
    const monthAgo = addDays(today, -30);

    /* ---- headline counts ------------------------------------------------- */
    // Leads and opportunities honour the role filter; the reference tables
    // (projects, users, properties) are the same for everyone who can see them.
    const [
      leadTotal, oppTotal, projectTotal, customerTotal, cpTotal,
      userTotal, LeadsTotal, groupTotal,
    ] = await Promise.all([
      safeCount('leads', () => prisma.lead.count({ where: leadFilter })),
      safeCount('opportunities', () => prisma.opportunity.count({ where: oppFilter })),
      safeCount('projects', () => prisma.project.count()),
      safeCount('customers', () => prisma.customer.count()),
      safeCount('channel partners', () => prisma.channelPartner.count()),
      safeCount('users', () => prisma.user.count()),
      safeCount('enquiries', () => prisma.leads.count()),
      safeCount('user groups', () => prisma.userGroup.count()),
    ]);

    // "New this month" gives each headline a trend rather than a bare number.
    const [leadsThisMonth, oppsThisMonth] = await Promise.all([
      prisma.lead.count({ where: { ...leadFilter, createdAt: { gte: monthAgo } } }),
      prisma.opportunity.count({ where: { ...oppFilter, createdAt: { gte: monthAgo } } }),
    ]);

    /* ---- breakdowns ------------------------------------------------------ */
    const [
      bySource, byOwner, byRating, byStage, byProjectStatus, byProjectType, byUserStatus,
    ] = await Promise.all([
      prisma.lead.groupBy({ by: ['primarySource'], _count: { primarySource: true }, where: leadFilter }),
      prisma.lead.groupBy({ by: ['owner'], _count: { owner: true }, where: leadFilter }),
      prisma.lead.groupBy({ by: ['rating'], _count: { rating: true }, where: leadFilter }),
      prisma.opportunity.groupBy({ by: ['stage'], _count: { stage: true }, where: oppFilter }),
      prisma.project.groupBy({ by: ['projectStatus'], _count: { projectStatus: true } }),
      prisma.project.groupBy({ by: ['projectType'], _count: { projectType: true } }),
      prisma.user.groupBy({ by: ['status'], _count: { status: true } }),
    ]);

    /* ---- twelve months of leads and opportunities ------------------------ */
    const since = new Date(today.getFullYear(), today.getMonth() - 11, 1);
    const [leadDates, oppDates] = await Promise.all([
      prisma.lead.findMany({ where: { ...leadFilter, createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.opportunity.findMany({ where: { ...oppFilter, createdAt: { gte: since } }, select: { createdAt: true } }),
    ]);

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const buckets = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, month: MONTHS[d.getMonth()], year: d.getFullYear(), leads: 0, opportunities: 0 });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    const place = (rows, field) => rows.forEach((r) => {
      const d = new Date(r.createdAt);
      const i = index.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (i !== undefined) buckets[i][field] += 1;
    });
    place(leadDates, 'leads');
    place(oppDates, 'opportunities');
    const trend = buckets.map(({ key, ...rest }) => rest);

    /* ---- work due -------------------------------------------------------- */
    const [followUpOverdue, followUpToday, followUpWeek, visitsUpcoming, visitsDone] = await Promise.all([
      prisma.lead.count({ where: { ...leadFilter, followUpDate: { lt: today } } }),
      prisma.lead.count({ where: { ...leadFilter, followUpDate: { gte: today, lt: tomorrow } } }),
      prisma.lead.count({ where: { ...leadFilter, followUpDate: { gte: tomorrow, lt: weekAhead } } }),
      prisma.lead.count({ where: { ...leadFilter, siteVisitDate: { gte: today } } }),
      prisma.lead.count({ where: { ...leadFilter, siteVisitDoneDate: { not: null } } }),
    ]);

    /* ---- recent activity ------------------------------------------------- */
    const [recentLeads, recentOpportunities, recentLogs] = await Promise.all([
      prisma.lead.findMany({
        where: leadFilter,
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, name: true, mobile: true, primarySource: true, status: true, owner: true, project: true, createdAt: true },
      }),
      prisma.opportunity.findMany({
        where: oppFilter,
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, oppId: true, opportunityName: true, stage: true, LeadsProject: true, opportunityOwner: true, bookingAmount: true, createdAt: true },
      }),
      prisma.leadLog.findMany({
        orderBy: { date: 'desc' },
        take: 12,
        select: { id: true, title: true, subtitle: true, date: true, leadId: true },
      }),
    ]);

    /* ---- revenue ---------------------------------------------------------
       bookingAmount is a free-text column, so anything unparseable is counted
       as "not recorded" rather than silently treated as zero. The response
       says how many of each there were, so the UI can be honest about it. */
    const amounts = await prisma.opportunity.findMany({ where: oppFilter, select: { bookingAmount: true } });
    let bookedTotal = 0;
    let bookedCount = 0;
    for (const row of amounts) {
      const n = Number(String(row.bookingAmount ?? '').replace(/[^0-9.]/g, ''));
      if (Number.isFinite(n) && n > 0) { bookedTotal += n; bookedCount += 1; }
    }

    /* ---- per-entity history, for the tile sparklines ---------------------
       One query per entity rather than twelve: pull the creation dates once
       and bucket them in memory. */
    const monthKeys = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${d.getMonth()}`);
    }
    const keyIndex = new Map(monthKeys.map((k, i) => [k, i]));

    const bucketDates = (rows) => {
      const out = new Array(12).fill(0);
      for (const r of rows) {
        if (!r.createdAt) continue;
        const d = new Date(r.createdAt);
        const i = keyIndex.get(`${d.getFullYear()}-${d.getMonth()}`);
        if (i !== undefined) out[i] += 1;
      }
      return out;
    };

    /**
     * A series plus its month-on-month change.
     *
     * The change is null rather than 0 when last month had nothing to compare
     * against — "+100%" off a base of zero says less than "no prior month".
     */
    const sparkFor = (rows) => {
      const series = bucketDates(rows);
      const thisMonth = series[11];
      const lastMonth = series[10];
      const change = lastMonth > 0
        ? Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10
        : null;
      return { series, thisMonth, change };
    };

    const [projectDates, userDates, cpDates, customerDates] = await Promise.all([
      prisma.project.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.channelPartner.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.customer.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    ]);

    const sparklines = {
      leads: sparkFor(leadDates),
      opportunities: sparkFor(oppDates),
      projects: sparkFor(projectDates),
      users: sparkFor(userDates),
      channelPartners: sparkFor(cpDates),
      customers: sparkFor(customerDates),
    };

    /* ---- assemble --------------------------------------------------------- */
    const counts = {
      leads: leadTotal,
      opportunities: oppTotal,
      projects: projectTotal,
      customers: customerTotal,
      channelPartners: cpTotal,
      users: showStaffCounts ? userTotal : null,
      enquiries: LeadsTotal,
      userGroups: showStaffCounts ? groupTotal : null,
    };

    /* Per-tile figures for the Project Status board: the count in range, the
       same count for the window before it, and a daily series for the bars.
       Wrapped like every other block here, so one bad tile cannot blank the
       screen the way prisma.leads.count() once did. */
    let projectStatus = [];
    try {
      projectStatus = await projectStatusStats(leadFilter, rangeFrom, rangeTo);
    } catch (error) {
      console.error('Dashboard: could not build the project status tiles —', error.message);
    }

    const overview = {
      counts,
      scope,
      newThisMonth: { leads: leadsThisMonth, opportunities: oppsThisMonth },
      sparklines,
      conversion: (() => {
        // Counting opportunities against leads gives nonsense (>100%) because
        // not every opportunity came from a lead in this filtered set. The
        // meaningful figure is how many of these leads reached Opportunity.
        const converted = leadStats.Opportunity || 0;
        return {
          leads: leadTotal,
          converted,
          opportunities: oppTotal,
          rate: leadTotal > 0 ? Math.round((converted / leadTotal) * 1000) / 10 : 0,
        };
      })(),
      leadsByStatus: Object.entries(leadStats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
      leadsBySource: tally(bySource, 'primarySource', 'Unknown source'),
      leadsByOwner: tally(byOwner, 'owner', 'Unassigned'),
      leadsByRating: tally(byRating, 'rating', 'Unrated'),
      opportunitiesByStage: tally(byStage, 'stage'),
      projectsByStatus: tally(byProjectStatus, 'projectStatus'),
      projectsByType: tally(byProjectType, 'projectType', 'Untyped'),
      usersByStatus: tally(byUserStatus, 'status'),
      trend,
      workload: {
        followUpsOverdue: followUpOverdue,
        followUpsToday: followUpToday,
        followUpsThisWeek: followUpWeek,
        siteVisitsUpcoming: visitsUpcoming,
        siteVisitsCompleted: visitsDone,
      },
      revenue: {
        // Only opportunities that actually carry a number are summed.
        booked: bookedTotal,
        recordedOn: bookedCount,
        outOf: amounts.length,
      },
      recentLeads,
      recentOpportunities,
      recentActivity: recentLogs,
    };

    const response = {
      // The original shape, so anything already reading these keeps working.
      todayLeads: todayLeadsCount,
      opportunities: opportunityCount,
      leadStats,
      /* The tiles, each with its own comparison and series. Sent alongside
         leadStats rather than replacing it: leadStats is an all-time count and
         the conversion figure above is derived from it, so changing its meaning
         to "within the selected window" would quietly move a number nobody
         asked to move. */
      projectStatus,
      range: { from: rangeFrom, to: rangeTo },
      leadInsights,
      siteVisitsInsights,
      digitLeadStats,
      // Everything the wider dashboard needs.
      overview,
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    sendError(res, error, 'Failed to fetch dashboard stats', 500);
  }
};
