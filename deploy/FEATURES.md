# NexorCRM: setting up the new features

This guide is for company administrators. Each section says where the feature lives and what to
set up.

## Companies (platform administrators)
**Companies** in the sidebar, visible only to usernames listed in `PLATFORM_ADMINS`.

- **New company** creates a separate CRM with its own users, leads, settings and lists. It comes with
  default lead statuses, sources, departments and email templates, plus a first administrator who
  must change their password on first sign-in.
- **Suspend** signs a company's users out and blocks them until you reactivate it. Nothing is deleted.
- Each company's data is invisible to every other company, and the database layer enforces this.

## Company key and website forms
**Settings → Integrations → Company & lead forms**
- **Website form:** `POST /api/public/leads` with the header `X-Company-Key: <key>` and JSON
  `{ name, mobile, email?, project?, message? }`.
- **Campaign link:** `GET /api/public/campaign-leads?key=<key>&name=…&mobile=…`
- **Staff sign-up link:** `https://os.nexorcrm.com/?company=<slug>`

Leads from every channel get the same treatment: assignment by the project's rota, a duplicate
check, and the follow-up clock.

## WhatsApp (Meta Cloud API)
**Settings → Integrations → WhatsApp**
1. In Meta for Developers, create an app with the **WhatsApp** product and add your business number.
2. Enter the **phone number ID**, a **permanent access token** (from a system user) and the **app secret**,
   then click **Test connection**.
3. In Meta → WhatsApp → Configuration, set the callback URL and verify token shown on the page, and
   subscribe to **messages**.

On a lead: **Conversations** tab → type a message, or send an approved template. Replies from the
customer appear on the lead, and the owner gets a notification.

Meta only allows free-text messages within 24 hours of the customer's last message. Outside that
window, send an approved template.

## Facebook / Instagram Lead Ads and Google Ads lead forms
**Settings → Integrations → Facebook & Google leads**
- **Facebook:** add the page ID and a page access token with `leads_retrieval`. In the Meta app,
  subscribe the Page's **leadgen** field to the callback URL shown.
- **Google:** **Google Ads lead form** creates a webhook URL and key. Paste both into the lead form
  under **Lead delivery → Webhook**.

Choose the project the leads belong to, so the right rota picks them up.

## Click-to-call (Exotel)
**Settings → Integrations → Calling**: enter the Account SID, API key and token, API subdomain,
and your ExoPhone.

Every salesperson must have their **own mobile number on their profile**. The **Call lead** button
rings them first, then connects the lead. Calls are recorded, and status, duration and recording
appear on the lead.

## Bookings & payments
**Bookings & Payments** in the sidebar.
- **New booking:** pick the project and an available unit, then the buyer, agreement value and a
  payment plan (a ready-made one, or edit the milestones and due dates yourself). The unit is marked
  Booked immediately, and two people can't book the same unit.
- **Record payments** against the booking. They are applied to milestones in plan order, and overdue
  is worked out automatically. You can download a **receipt PDF** and a **cost sheet PDF**; the cost
  sheet uses the project's GST, stamp duty, registration and other charges.
- The **Collections** tab lists everything overdue or due soon.
- **Channel partner commission** is calculated at booking and moves from Pending to Approved to Paid.

## Channel partner portal
On a channel partner's page, **Partner portal access** creates a login for them. Partners sign in at
the normal address and see only their portal: the leads they submitted and their progress, a form to
submit new leads, and their commissions. They see nothing else in the CRM.

## Two-factor sign-in
**My Profile → Security → Set up two-factor sign-in.** Scan the QR code with Google Authenticator,
Microsoft Authenticator or Authy, then save the 10 recovery codes.

If someone loses their phone, an admin can use **User Admin → user → Security → Reset two-factor**.

## Calendar sync
**My Profile → Security → Calendar sync**: copy the link into Google Calendar (Other calendars →
From URL) or Outlook (Subscribe from web). It shows your site visits, follow-ups, tasks and
opportunity follow-ups, and refreshes by itself. Keep the link private; **New link** stops the old one.

## Scheduled reports
**Settings → Integrations → Scheduled reports**: pipeline, collections or team activity, emailed daily,
weekly or monthly at 7am to the addresses you choose. **Send now** (the paper-plane button) tests a report.

## Email log and retries
**Settings → Integrations → Email log** shows every email sent. If the mail server is unreachable,
the email is queued and retried after 1, 5 and 30 minutes, then after 2 and 6 hours.

## Documents
The **Documents** tab on a lead: upload agreements, KYC, brochures and similar (PDF, images, Word,
Excel; up to 10MB). Files are private to people who can open the record. They are stored on the
server's disk, or in S3 when it is configured.

## Live updates
Changes appear on colleagues' screens without refreshing: new leads, status changes, chat messages
and notifications.
