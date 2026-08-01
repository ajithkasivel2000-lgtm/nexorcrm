const express = require('express');
// trigger restart 8 - reloaded opportunity controller with project ID-to-Name resolution

const cors = require('cors');
require('dotenv').config();

const leadRoutes = require('./routes/leadRoutes');
const opportunityRoutes = require('./routes/opportunityRoutes');
const customerRoutes = require('./routes/customerRoutes');
const channelPartnerRoutes = require('./routes/channelPartnerRoutes');
const rrqRoutes = require('./routes/rrqRoutes');
const projectRoutes = require('./routes/projectRoutes');
const projectStatusRoutes = require('./routes/projectStatusRoutes');
const projectTypeRoutes = require('./routes/projectTypeRoutes');
const primarySourceRoutes = require('./routes/primarySourceRoutes');
const secondarySourceRoutes = require('./routes/secondarySourceRoutes');
const tertiarySourceRoutes = require('./routes/tertiarySourceRoutes');
const leadStatusRoutes = require('./routes/leadStatusRoutes');
const leadTypeRoutes = require('./routes/leadTypeRoutes');
const userRoutes = require('./routes/userRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const userGroupRoutes = require('./routes/userGroupRoutes');
const registrationSettingRoutes = require('./routes/registrationSettingRoutes');
const sessionSettingRoutes = require('./routes/sessionSettingRoutes');
const globalUserSettingRoutes = require('./routes/globalUserSettingRoutes');
const securitySettingRoutes = require('./routes/securitySettingRoutes');
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const serviceRoutes = require('./routes/serviceRoutes');
const enquiryRoutes = require('./routes/enquiryRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const logRoutes = require('./routes/logRoutes');
const mailSettingRoutes = require('./routes/mailSettingRoutes');
const emailTemplateRoutes = require('./routes/emailTemplateRoutes');
const pageAccessRoutes = require('./routes/pageAccessRoutes');
const websiteRoutes = require('./routes/websiteRoutes');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/leads', leadRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/channel-partners', channelPartnerRoutes);
app.use('/api/rrq', rrqRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/project-statuses', projectStatusRoutes);
app.use('/api/project-types', projectTypeRoutes);
app.use('/api/primary-sources', primarySourceRoutes);
app.use('/api/secondary-sources', secondarySourceRoutes);
app.use('/api/tertiary-sources', tertiarySourceRoutes);
app.use('/api/lead-statuses', leadStatusRoutes);
app.use('/api/lead-types', leadTypeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/user-groups', userGroupRoutes);
app.use('/api/settings/registration', registrationSettingRoutes);
app.use('/api/settings/session', sessionSettingRoutes);
app.use('/api/settings/user', globalUserSettingRoutes);
app.use('/api/settings/security', securitySettingRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/enquiries', enquiryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/settings/mail', mailSettingRoutes);
app.use('/api/settings/email-templates', emailTemplateRoutes);
app.use('/api/page-access', pageAccessRoutes);

// Public website API (no auth required)
app.use('/api/public', websiteRoutes);

const PORT = process.env.PORT || 5000;

// Basic test route
app.get('/', (req, res) => {
  res.send('PropCRM Backend is running!');
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
