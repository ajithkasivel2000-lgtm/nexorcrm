# Deploying NexorCRM to os.nexorcrm.com

One Node process on port 7003 serves the web app, the API and live updates
(Socket.IO). nginx sits in front of it for the domain and HTTPS.

Server requirements: Node 20+, PostgreSQL 14+, nginx, PM2 (`npm i -g pm2`),
and `pg_dump` for backups.

## 1. Upload the code

Copy the project to the server, for example `/var/www/nexorcrm`, without `node_modules`.

## 2. Environment

```bash
cd /var/www/nexorcrm/backend
cp .env.production .env
```

`.env.production` already contains:

| Setting | What it's for |
|---|---|
| `PORT=7003`, `HOST=127.0.0.1` | The app listens on localhost only, so nginx is the only way in |
| `DATABASE_URL` | The `os_nexorcrm` database |
| `APP_URL=https://os.nexorcrm.com` | Reset, activation, webhook and calendar links. Without it, production sends no links |
| `ACTIVATION_SECRET`, `WEBHOOK_SECRET` | Sign activation links, 2FA login steps and Exotel callbacks. Keep them secret and don't change them once in use |
| `PLATFORM_ADMINS=admin` | Who manages companies (Platform → Companies) |
| `NODE_ENV=production` | |

Optional settings are listed in `.env.example`: Razorpay billing (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`), trial length, Sentry (`SENTRY_DSN`), S3 storage, a shared Meta app, and the AI assistant.

**Razorpay webhook:** in the Razorpay dashboard, add `https://os.nexorcrm.com/api/webhooks/razorpay` with the events `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted` and `subscription.cancelled`. Use the same secret as `RAZORPAY_WEBHOOK_SECRET`.

**Sentry for the web app:** build with `VITE_SENTRY_DSN=... npm run build`.

## 3. Install, build, create the database

```bash
cd /var/www/nexorcrm/backend
npm ci
npm run build              # prisma generate
npm run db:migrate         # creates every table; also creates the first company
npm test                   # unit tests, no database needed

cd ../frontend
npm ci
npm run build              # frontend/dist, served by the backend
```

## 4. First sign-in (new database only)

```bash
cd /var/www/nexorcrm/backend
ADMIN_PASSWORD='choose-a-strong-one' npm run seed:admin   # user "admin" in the first company
npm run seed:defaults      # lead statuses, sources, departments, RRQ types…
```

Sign in as `admin`. Then:
- Rename "Default Company" to your company's name under **Companies**.
- Turn on two-factor sign-in under **My Profile → Security**.

Until the database has at least one user, `admin` / `password123` works once as a bootstrap login,
so run `seed:admin` straight away.

New users (created in User Admin or through sign-up) start as **Registered** and cannot sign in
until they are activated, either with the Activate button in User Admin or through the emailed link.

## 5. Start and keep running

```bash
cd /var/www/nexorcrm
pm2 start deploy/ecosystem.config.cjs
pm2 save && pm2 startup
curl -s localhost:7003/api/health     # {"ok":true,"db":"up",...}
```

## 6. Domain and HTTPS

```bash
sudo cp deploy/nginx-os.nexorcrm.com.conf /etc/nginx/sites-available/os.nexorcrm.com
sudo ln -s /etc/nginx/sites-available/os.nexorcrm.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d os.nexorcrm.com
```

The config already includes the websocket headers Socket.IO needs.
The DNS A record for `os.nexorcrm.com` must point at this server.

## 7. Backups

```bash
chmod +x /var/www/nexorcrm/deploy/backup.sh
sudo mkdir -p /var/backups/nexorcrm
crontab -e
# 15 2 * * * /var/www/nexorcrm/deploy/backup.sh >> /var/log/nexorcrm-backup.log 2>&1
```

This keeps 14 days of database dumps and uploaded files. Copy `/var/backups/nexorcrm` off the
server as well. Restore commands are at the bottom of `backup.sh`.

## 8. Monitoring

- Point an uptime monitor (UptimeRobot, Better Stack…) at `https://os.nexorcrm.com/api/health`.
- `pm2 logs nexorcrm` shows errors. Run `pm2 install pm2-logrotate` so logs don't fill the disk.

## Updating later

```bash
cd /var/www/nexorcrm
# upload the new code or git pull
cd backend && npm ci && npm run build && npm run db:migrate
cd ../frontend && npm ci && npm run build
pm2 restart nexorcrm
```

`db:migrate` only applies migrations that haven't run yet. Never use `prisma db push` in production.

## Developer machines (an existing local database)

A database created before migrations existed must be marked as already having the first migration,
then brought up to date. **Back it up first.**

```bash
cd backend
npx prisma migrate resolve --applied 0_init
npx prisma migrate deploy
```

## Mobile app

Release builds use `https://os.nexorcrm.com/api` (`mobile/.../app.json → extra.apiUrl`).

```bash
cd mobile/roofanwals-mobile-main
npm install
npx eas build -p android      # or -p ios
```

## Tests

```bash
cd backend
npm test                                         # unit tests
TEST_DATABASE_URL=postgresql://…/nexorcrm_test npm test     # + database isolation tests
npm run test:e2e     # HTTP suites (tenant, features, billing, reports): running server + THROWAWAY database only; see the header of each file in tests/e2e
```
