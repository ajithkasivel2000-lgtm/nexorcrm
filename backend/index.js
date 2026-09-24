const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const cors = require('cors');
require('dotenv').config();

const leadRoutes = require('./routes/leadRoutes');
const opportunityRoutes = require('./routes/opportunityRoutes');
const customerRoutes = require('./routes/customerRoutes');
const channelPartnerRoutes = require('./routes/channelPartnerRoutes');
const rrqRoutes = require('./routes/rrqRoutes');
const rrqTypeRoutes = require('./routes/rrqTypeRoutes');
const pushRoutes = require('./routes/pushRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const projectRoutes = require('./routes/projectRoutes');
const projectStatusRoutes = require('./routes/projectStatusRoutes');
const projectTypeRoutes = require('./routes/projectTypeRoutes');
const primarySourceRoutes = require('./routes/primarySourceRoutes');
const secondarySourceRoutes = require('./routes/secondarySourceRoutes');
const tertiarySourceRoutes = require('./routes/tertiarySourceRoutes');
const leadStatusRoutes = require('./routes/leadStatusRoutes');
const openReasonRoutes = require('./routes/openReasonRoutes');
const callStatusRoutes = require('./routes/callStatusRoutes');
const leadTypeRoutes = require('./routes/leadTypeRoutes');
const userRoutes = require('./routes/userRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const userGroupRoutes = require('./routes/userGroupRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const registrationSettingRoutes = require('./routes/registrationSettingRoutes');
const sessionSettingRoutes = require('./routes/sessionSettingRoutes');
const globalUserSettingRoutes = require('./routes/globalUserSettingRoutes');
const securitySettingRoutes = require('./routes/securitySettingRoutes');
const leadAssignmentSettingRoutes = require('./routes/leadAssignmentSettingRoutes');
const reminderSettingRoutes = require('./routes/reminderSettingRoutes');
const siteVisitRoutes = require('./routes/siteVisitRoutes');
const staffMasterRoutes = require('./routes/staffMasterRoutes');
const userPermissionRoutes = require('./routes/userPermissionRoutes');
const { startLeadReassignmentJob } = require('./jobs/leadReassignmentJob');
const { initRealtime, broadcastChanges } = require('./utils/realtime');
const storage = require('./utils/storage');
const authRoutes = require('./routes/authRoutes');
const LeadsRoutes = require('./routes/LeadsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const logRoutes = require('./routes/logRoutes');
const mailSettingRoutes = require('./routes/mailSettingRoutes');
const emailTemplateRoutes = require('./routes/emailTemplateRoutes');
const websiteRoutes = require('./routes/websiteRoutes');
const aiRoutes = require('./routes/aiRoutes');
const chatRoutes = require('./routes/chatRoutes');
const chatRoomRoutes = require('./routes/chatRoomRoutes');
const entityRecordRoutes = require('./routes/entityRecordRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const platformRoutes = require('./routes/platformRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const partnerRoutes = require('./routes/partnerRoutes');
const billingRoutes = require('./routes/billingRoutes');
const app = express();

/* In production nginx terminates HTTPS and forwards here, so req.protocol and
   req.ip would otherwise be the proxy's — links in emails would say http:// and
   every session would log 127.0.0.1. */
app.set('trust proxy', 1);

// Middleware
app.use(cors());

/* Team-chat photos arrive as base64 inside a JSON body. express.json()'s
   default cap is 100kb, so every photo request died with a 413 before the
   controller ever saw it — the controller's own 5MB allowance was unreachable.
   10mb covers a 4MB file (the client's limit) plus base64's 4/3 overhead with
   room to spare. Photos are then written to disk (uploads/teamchat/) and the
   message row stores the URL, not the base64 — a large text column in
   Postgres on every read of the room was the alternative. */
/* The raw bytes are kept alongside the parsed body: Meta signs its webhooks
   over the exact body it sent, and re-serialising the JSON would not match. */
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => { if (req.originalUrl.startsWith('/api/webhooks/')) req.rawBody = buf; },
}));

/* Team-chat photos, from disk or S3 (utils/storage.js). Served without auth on
   purpose: the names are unguessable random ids, never user-controlled paths,
   and the chat UI renders them through <img>, which cannot send the
   Authorization header. */
app.get('/uploads/teamchat/:name', (req, res) => {
  const name = String(req.params.name);
  if (!/^[0-9a-f-]{36}\.(png|jpg|gif|webp|bmp)$/.test(name)) return res.sendStatus(404);
  return storage.send(res, `teamchat/${name}`, { maxAge: 30 * 86400 }).catch(() => res.sendStatus(500));
});

/* For uptime monitors and the deploy check: is the process up, and can it
   reach the database? Says nothing about any company's data. */
app.get('/api/health', async (req, res) => {
  try {
    await require('./utils/tenant').runAsSystem(() => require('./prismaClient').company.count());
    res.status(200).json({ ok: true, db: 'up', uptimeSec: Math.round(process.uptime()) });
  } catch (error) {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

// Tell the rest of the company when something is saved (Socket.IO).
app.use(broadcastChanges);

// Routes
app.use('/api/leads', integrationRoutes.leadComms);
app.use('/api/leads', leadRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/channel-partners', channelPartnerRoutes);
app.use('/api/rrq', rrqRoutes);
app.use('/api/rrq-types', rrqTypeRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/project-statuses', projectStatusRoutes);
app.use('/api/project-types', projectTypeRoutes);
app.use('/api/primary-sources', primarySourceRoutes);
app.use('/api/secondary-sources', secondarySourceRoutes);
app.use('/api/tertiary-sources', tertiarySourceRoutes);
app.use('/api/lead-statuses', leadStatusRoutes);
app.use('/api/open-reasons', openReasonRoutes);
app.use('/api/call-statuses', callStatusRoutes);
app.use('/api/lead-types', leadTypeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/user-groups', userGroupRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/settings/registration', registrationSettingRoutes);
app.use('/api/settings/session', sessionSettingRoutes);
app.use('/api/settings/user', globalUserSettingRoutes);
app.use('/api/settings/security', securitySettingRoutes);
app.use('/api/settings/lead-assignment', leadAssignmentSettingRoutes);
app.use('/api/settings/reminders', reminderSettingRoutes);
app.use('/api/site-visits', siteVisitRoutes);
app.use('/api/staff-masters', staffMasterRoutes);
app.use('/api/user-permissions', userPermissionRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/enquiries', LeadsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/settings/mail', mailSettingRoutes);
app.use('/api/settings/email-templates', emailTemplateRoutes);

// AI features (Claude). /status is open; the rest need a signed-in user.
app.use('/api/ai', aiRoutes);
app.use('/api/assistant', chatRoutes);
app.use('/api/team-chat', chatRoomRoutes);
app.use('/api/records', entityRecordRoutes);
app.get('/api/documents/:id/download', require('./middleware/authMiddleware').authMiddleware, require('./controllers/entityRecordController').downloadDocument);
app.use('/api/bookings', bookingRoutes);
app.use('/api/platform', platformRoutes.platform);
app.use('/api/company', platformRoutes.company);
app.use('/api/integrations', integrationRoutes.settings);
app.use('/api/webhooks', integrationRoutes.hooks);
app.use('/api/calendar', calendarRoutes);
app.use('/api/partner', partnerRoutes.portal);
app.use('/api/partner-accounts', partnerRoutes.accounts);
app.use('/api/billing', billingRoutes);
app.get('/api/branding', require('./middleware/authMiddleware').authMiddleware, require('./controllers/brandingController').current);

// Public website API (no auth required)
app.use('/api/public', websiteRoutes);

/* 7012 is what the dev proxy in frontend/vite.config.js points /api at, so
   the two defaults agree and `npm run dev` works with no .env at all. */
const PORT = process.env.PORT || 7012;

/* Production serves the built frontend from the same process, so one port
   carries the whole app. In development frontend/dist does not exist and Vite
   serves the UI on its own port instead. */
const FRONTEND_DIST = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(path.join(FRONTEND_DIST, 'index.html'))) {
  app.use(express.static(FRONTEND_DIST, { index: false, maxAge: '1h' }));
  // Client-side routes (/leads/123, /settings/…) all load the SPA shell.
  app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('NexorCRM Backend is running!');
  });
}

// Start the server
/* HOST=127.0.0.1 in production keeps the port off the public interface, so
   nginx is the only way in and the X-Forwarded-For it sets can be trusted. */
const HOST = process.env.HOST || undefined;
/* One HTTP server carries the REST API and the Socket.IO live updates. */
const server = http.createServer(app);
initRealtime(server);

server.on('error', (error) => {
  console.error(`Could not start on port ${PORT}: ${error.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Server is running on ${HOST || 'all interfaces'}, port ${PORT}`);

  /* The background sweep: lead follow-ups, reminders, mail retries and
     scheduled reports, once a minute per company. Started with the server
     rather than an external scheduler; it keeps no state of its own, so a
     restart resumes every pending deadline from the database. */
  startLeadReassignmentJob();
});
