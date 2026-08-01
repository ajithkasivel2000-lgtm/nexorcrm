const prisma = require('../prismaClient');

exports.getDashboardStats = async (req, res) => {
  try {
    const { project, username, viewAsRole, specificUser } = req.query;
    
    // Base filters
    const leadFilter = {};
    const oppFilter = {};
    
    if (project && project !== 'All Projects') {
      leadFilter.project = project;
      oppFilter.enquiryProject = project; 
    }

    // If a specific user is requested, filter directly by that user's ownership
    if (specificUser) {
      leadFilter.owner = specificUser;
      oppFilter.opportunityOwner = specificUser;
    } else {
      // Fetch the logged-in user's actual role from the database
      let actualUserStatus = null;
      if (username) {
        const dbUser = await prisma.user.findUnique({ where: { username } });
        if (dbUser) {
          actualUserStatus = dbUser.status;
        }
      }

      let activeView = 'Superadmin';
      if (viewAsRole) {
        activeView = viewAsRole;
      } else if (actualUserStatus) {
        activeView = actualUserStatus;
      }

      if (activeView === 'Admin') {
        const allUsers = await prisma.user.findMany({
          where: { status: { in: ['Admin', 'Manager', 'Employee'] } },
          select: { username: true }
        });
        const allowedUsernames = allUsers.map(u => u.username);
        leadFilter.owner = { in: allowedUsernames };
        oppFilter.opportunityOwner = { in: allowedUsernames };
      } else if (activeView === 'Manager') {
        const managerUsers = await prisma.user.findMany({
          where: { status: { in: ['Manager', 'Employee'] } },
          select: { username: true }
        });
        const allowedOwners = managerUsers.map(u => u.username);
        leadFilter.owner = { in: allowedOwners };
        oppFilter.opportunityOwner = { in: allowedOwners };
      } else if (activeView === 'Employee') {
        const isActualEmployee = actualUserStatus === 'Employee';
        if (isActualEmployee && username) {
          leadFilter.owner = username;
          oppFilter.opportunityOwner = username;
        } else {
          const employees = await prisma.user.findMany({
            where: { status: 'Employee' },
            select: { username: true }
          });
          const employeeUsernames = employees.map(u => u.username);
          if (employeeUsernames.length > 0) {
            leadFilter.owner = { in: employeeUsernames };
            oppFilter.opportunityOwner = { in: employeeUsernames };
          } else if (username) {
            leadFilter.owner = username;
            oppFilter.opportunityOwner = username;
          }
        }
      }
    }
    
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

    // 4. SiteVisits Insights Pie Chart
    const siteVisitsInsights = await prisma.lead.groupBy({
      by: ['primarySource'],
      _count: { id: true },
      where: {
        ...leadFilter,
        status: {
          contains: 'Site Visit'
        }
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
    
    const digitStatsMap = {
      'Outdoor Marketing-Event': {
        source: 'Outdoor Marketing',
        tertiary: 'Event',
        totalLead: 0,
        totalOpenLead: 0,
        totalRejectLead: 0
      },
      'Social Media-FB Ads': {
        source: 'Social Media',
        tertiary: 'FB Ads',
        totalLead: 0,
        totalOpenLead: 0,
        totalRejectLead: 0
      },
      'Website-Landing Page': {
        source: 'Website',
        tertiary: 'Landing Page',
        totalLead: 0,
        totalOpenLead: 0,
        totalRejectLead: 0
      }
    };
    
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

    const response = {
      todayLeads: todayLeadsCount,
      opportunities: opportunityCount,
      leadStats,
      leadInsights,
      siteVisitsInsights,
      digitLeadStats
    };


    res.status(200).json(response);

  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard stats', error: error.message });
  }
};
