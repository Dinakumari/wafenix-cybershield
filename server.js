require('dotenv').config();
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DB_PATH = path.resolve(process.env.DB_PATH || './data/wafenix.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!ADMIN_PASSWORD) console.warn('WARNING: ADMIN_PASSWORD is not set. Admin login will be disabled.');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT NOT NULL,
  phone TEXT,
  booking_date TEXT NOT NULL,
  booking_time TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'requested',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));
app.use(compression());
app.use(express.json({ limit: '25kb' }));
app.use(express.urlencoded({ extended: false, limit: '25kb' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: 'draft-8', legacyHeaders: false });
const formLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, message: { ok: false, error: 'Too many requests. Please try again later.' }, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api/', publicLimiter);

function clean(v, max = 1000) { return String(v ?? '').trim().slice(0, max); }
function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
function validDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(v); }
function validTime(v) { return /^\d{2}:\d{2}$/.test(v); }
function tokenForPassword() { return crypto.createHmac('sha256', SESSION_SECRET).update(ADMIN_PASSWORD).digest('hex'); }
function auth(req) {
  if (!ADMIN_PASSWORD) return false;
  const cookie = req.headers.cookie || '';
  const m = cookie.match(/(?:^|;\s*)wafenix_admin=([^;]+)/);
  if (!m) return false;
  const token = decodeURIComponent(m[1]);
  const expected = tokenForPassword();
  return token.length === expected.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
function requireAdmin(req, res, next) {
  if (!auth(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
  next();
}

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'wafenix-cybershield', time: new Date().toISOString() }));

app.post('/api/leads', formLimiter, (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 180).toLowerCase();
  const company = clean(req.body.company, 160);
  const message = clean(req.body.message, 2000);
  if (!name || !validEmail(email) || !company || !message) return res.status(400).json({ ok: false, error: 'Please complete all enquiry fields with a valid email.' });
  const stmt = db.prepare('INSERT INTO leads (name,email,company,message) VALUES (?,?,?,?)');
  const result = stmt.run(name, email, company, message);
  res.status(201).json({ ok: true, id: result.lastInsertRowid, message: 'Enquiry received. We will get back to you shortly.' });
});

app.post('/api/bookings', formLimiter, (req, res) => {
  const name = clean(req.body.name, 100);
  const email = clean(req.body.email, 180).toLowerCase();
  const company = clean(req.body.company, 160);
  const phone = clean(req.body.phone, 40);
  const booking_date = clean(req.body.booking_date, 10);
  const booking_time = clean(req.body.booking_time, 5);
  const message = clean(req.body.message, 1500);
  if (!name || !validEmail(email) || !company || !validDate(booking_date) || !validTime(booking_time)) return res.status(400).json({ ok: false, error: 'Please complete the booking details.' });
  const requested = new Date(`${booking_date}T${booking_time}:00`);
  if (Number.isNaN(requested.getTime()) || requested.getTime() < Date.now()) return res.status(400).json({ ok: false, error: 'Please choose a future date and time.' });
  const stmt = db.prepare('INSERT INTO bookings (name,email,company,phone,booking_date,booking_time,message) VALUES (?,?,?,?,?,?,?)');
  const result = stmt.run(name, email, company, phone, booking_date, booking_time, message);
  res.status(201).json({ ok: true, id: result.lastInsertRowid, message: 'Booking request received. We will confirm the time shortly.' });
});

app.post('/api/admin/login', formLimiter, (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ ok: false, error: 'Admin password is not configured.' });
  const password = String(req.body.password || '');
  const a = Buffer.from(password); const b = Buffer.from(ADMIN_PASSWORD);
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) return res.status(401).json({ ok: false, error: 'Invalid password.' });
  res.setHeader('Set-Cookie', `wafenix_admin=${encodeURIComponent(tokenForPassword())}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => { res.setHeader('Set-Cookie', 'wafenix_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); res.json({ ok: true }); });
app.get('/api/admin/me', requireAdmin, (req, res) => res.json({ ok: true }));
app.get('/api/admin/leads', requireAdmin, (req, res) => res.json({ ok: true, leads: db.prepare('SELECT * FROM leads ORDER BY id DESC').all() }));
app.get('/api/admin/bookings', requireAdmin, (req, res) => res.json({ ok: true, bookings: db.prepare('SELECT * FROM bookings ORDER BY booking_date ASC, booking_time ASC, id DESC').all() }));
app.patch('/api/admin/leads/:id', requireAdmin, (req, res) => {
  const status = clean(req.body.status, 30);
  if (!['new','contacted','qualified','closed','spam'].includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
  const r = db.prepare("UPDATE leads SET status=?, updated_at=datetime('now') WHERE id=?").run(status, Number(req.params.id));
  res.json({ ok: r.changes === 1 });
});
app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const status = clean(req.body.status, 30);
  if (!['requested','confirmed','completed','cancelled','no-show'].includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status.' });
  const r = db.prepare("UPDATE bookings SET status=?, updated_at=datetime('now') WHERE id=?").run(status, Number(req.params.id));
  res.json({ ok: r.changes === 1 });
});

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/robots.txt', (req, res) => { res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${SITE_URL}/sitemap.xml\n`); });
app.get('/sitemap.xml', (req, res) => { res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE_URL}/</loc></url><url><loc>${SITE_URL}/privacy</loc></url></urlset>`); });
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Wafenix CyberShield running on ${SITE_URL}`));
