# Wafenix CyberShield — Production Website

A full-stack security-services website preserving the original dark Wafenix visual structure, with a Node.js/Express backend and SQLite lead/booking storage.

## Included

- Original frontend structure and responsive navigation
- Node.js + Express backend
- SQLite database for enquiries and booking requests
- Working enquiry form: `POST /api/leads`
- Working booking request modal with date + time: `POST /api/bookings`
- Admin dashboard: `/admin`
- Lead statuses: new, contacted, qualified, closed, spam
- Booking statuses: requested, confirmed, completed, cancelled, no-show
- WhatsApp floating side button: +91 87003 23463
- SEO title/description, Open Graph tags and JSON-LD structured data
- `robots.txt` and `sitemap.xml`
- Privacy Policy at `/privacy`
- Helmet security headers
- API rate limiting
- `.env` configuration
- Dockerfile + Docker Compose
- Render deployment blueprint with a persistent SQLite disk
- Removed the unverifiable `200+` and `6+ years` claims from the public-facing copy

## Local setup

1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. Set a strong `ADMIN_PASSWORD` and `SESSION_SECRET`.
4. Set `SITE_URL=http://localhost:3000`.
5. Run:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Admin: `http://localhost:3000/admin`

## Docker

```bash
cp .env.example .env
# edit .env and set ADMIN_PASSWORD + SESSION_SECRET

docker compose up -d --build
```

The SQLite database is persisted in the `wafenix_data` Docker volume.

## Public deployment — Render

The included `render.yaml` is configured for a Docker web service and a persistent disk for SQLite.

1. Put this project into a GitHub repository.
2. In Render, create a new Blueprint/Project from that repository.
3. Use the included `render.yaml`.
4. Set the secret environment values when prompted:
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `SITE_URL` (the HTTPS URL Render gives the service)
5. Deploy.
6. Render will provide a public `https://...onrender.com` URL.
7. Open `/admin` on that URL and sign in with your `ADMIN_PASSWORD`.

### Important SQLite note

SQLite needs persistent storage. The Render blueprint therefore includes a persistent disk. Do not remove the disk if you want leads and bookings to survive container restarts/redeploys.

## Domain

After the service works on its generated public URL, attach your own domain in your hosting provider's custom-domain settings and update `SITE_URL` to the final HTTPS domain. Then redeploy so the canonical URL, sitemap and robots file use the correct address.

## Security checklist before launch

- Use a long random `ADMIN_PASSWORD`.
- Use a long random `SESSION_SECRET`.
- Keep `.env` out of GitHub.
- Enable HTTPS at the hosting provider.
- Keep dependencies updated.
- Back up the SQLite database regularly.
- Replace any remaining placeholder business/contact copy before publishing.
- If you need multiple admin users, audit logs, email notifications, or high-volume traffic, move authentication and storage to a dedicated production database/service.
