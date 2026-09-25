# NexorCRM: setting up the new features

This guide is for company administrators. Each section says where the feature lives and what to
set up.

## Companies (platform administrators)
**Platform → Companies** in the sidebar, visible only to the platform owner: usernames listed in
`PLATFORM_ADMINS` that belong to the owner's own company. Your own company's row says **Your company**;
manage its users from User Admin.

- **New company** creates a separate CRM with its own users, leads, settings and lists. It comes with
  default lead statuses, sources, departments and email templates, plus a first administrator who
  must change their password on first sign-in. Afterwards a **Login details to send** box shows the
  sign-in link, username and temporary password, with **Copy** and **Send on WhatsApp**. The password
  is shown only then.
- **👁 View** shows the company's details, counts, subscription, sign-in address and its
  administrators' logins (username, email, last sign-in, whether the password is still temporary).
  Passwords are never shown.
- **✏️ Edit** changes company and billing details, and the administrator's username, name, email and
  phone. **Set a new temporary password** (type one or click **Generate**) replaces a lost password:
  they are signed out and must choose their own at next sign-in.
- **Clicking a row** opens the plan, trial and **Own domain** settings.
- **Suspend** signs a company's users out and blocks them until you reactivate it. Nothing is deleted.
- **Delete Selected** permanently removes the ticked companies and all of their data (users, leads,
  bookings, payments, documents). Only suspended companies can be deleted, never your own.
- Each company's data is invisible to every other company, and the database layer enforces this.

## Signing in to a company
Each client company signs in on its own sign-in page, which only lets that company's people in:
- its own domain, such as `https://crm.roofonwalls.com` (see *Client companies on their own domain*
  in DEPLOY.md), or
- its link, `https://os.nexorcrm.com/?company=<company code>`, or
- the **Company Code** box on the general sign-in page.

On those pages the company's name, logo and colour are shown. Someone from another company, including
the platform owner, is refused like a wrong password. Left blank, the Company Code box signs in as
usual. The company code is the "slug" shown under Platform → Companies.

## Plans, trials and billing
- **New companies** start a 14-day free trial, either through **Start a free trial** on the sign-in page or when you create them under **Platform**.
- **Billing & Plan** (Settings, company admins) shows the plan, trial days left and users used of the limit. They pick a plan and pay through Razorpay; invoices include 18% GST and download as PDFs.
- **Plans** are managed under **Platform → Plans**. Starting plans: Starter ₹999/month for 5 users, Growth ₹2,999 for 20, Enterprise ₹7,999 unlimited. Prices are before GST.
- **When a trial ends or a renewal fails:** a failed renewal keeps full access for 7 days. After that, users can still sign in, but only Billing opens until a plan is paid. Nothing is deleted.
- **Offline payments:** as the platform admin, open a company under **Platform** to record a bank-transfer payment, extend a trial, change the plan or expire a subscription.
- **User limits:** activating a user beyond the plan's limit is refused with a clear message.

## Branding
**Settings → Integrations → Company & lead forms → Branding:** upload a logo and pick a brand colour.
They're used in the app and on the company's own sign-in page (`https://os.nexorcrm.com/?company=<slug>`).
Emails are sent in the company's name unless Mail Settings has a From name.

## Report builder
**Report Builder** in the sidebar (Managers and above). Pick leads, opportunities, bookings, payments,
site visits or calls; choose columns and filters or group and count/total; see a chart and table.
Save and share reports, export CSV/PDF, or **Email on a schedule**.

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
- **Documents** on a booking (agreement, allotment letter) are also shown to the buyer in their portal.

## Buyer portal, online payments and payment reminders
Set up in **Settings → Integrations → Buyer payments** (administrators).
- **Online payments:** enter your company's own Razorpay **Key ID** and **Key secret**, so buyers'
  money goes straight to you. In Razorpay → Settings → Webhooks, add the webhook URL shown on that
  tab, type a secret (enter the same secret in the CRM), and tick `payment_link.paid`,
  `payment_link.expired` and `payment_link.cancelled`. Try it with test keys first.
- **Payment links:** on a booking, **Create payment link** makes a Razorpay link for the next due
  milestone (or one you pick), which you can copy or send on WhatsApp. When the buyer pays, the payment
  is recorded on the booking automatically, the salesperson is notified and the buyer is emailed a
  receipt. The same payment can never be recorded twice.
- **Buyer portal:** buyers open `https://<your address>/portal?company=<your company code>` (the
  link is on the settings tab) and sign in with the email on their booking. There is no password:
  they get a one-time link by email, valid for 30 minutes. From a booking, staff can also
  **Copy portal link** or **Send on WhatsApp** (valid for 7 days). Buyers see their unit, payment
  plan, balance and overdue amount, and can pay online and download receipts and shared documents.
- **Payment reminders:** when switched on, buyers are emailed (and optionally sent an approved
  WhatsApp template) before each milestone is due (default 7 days and 1 day before) and every 7 days
  while it is overdue (up to 4 times). Reminders go out between 9am and 8pm, each one only once,
  and include a pay-online link and a portal link. **Recent reminders** on the same tab shows what
  was sent.

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

## Mobile app
The mobile app includes Bookings & Payments (list, collections, recording payments). On a lead, it has WhatsApp, Call via CRM, call history and documents. Channel partners get a partner screen, and two-factor sign-in is supported.

## Error monitoring
Set `SENTRY_DSN` (server) and `VITE_SENTRY_DSN` (web build) to see errors in Sentry, tagged with company and user. No passwords, tokens or form data are sent. Without them, errors are only logged. A crash in any screen shows a Reload message instead of a blank page.

## Live updates
Changes appear on colleagues' screens without refreshing: new leads, status changes, chat messages
and notifications.
