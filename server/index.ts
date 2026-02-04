import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import cors from 'cors';
import { join } from 'path';
import { db, schema } from './db/index.js';
import { eq, desc } from 'drizzle-orm';
import { startMonitoring } from './services/monitor.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Render (needed for secure cookies behind reverse proxy)
app.set('trust proxy', 1);

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Admin emails allowed to access
const ADMIN_EMAILS = [
  'ryan@spyglassrealty.com',
  'john@spyglassrealty.com',
  'kaleigh@spyglassrealty.com',
  'kyle@spyglassrealty.com',
];

// Google OAuth setup
const BASE_URL = process.env.BASE_URL || 'https://lead-accountability-v2.onrender.com';
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/auth/google/callback`,
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      console.log('[Auth] OAuth callback for email:', email);
      
      if (!email || !ADMIN_EMAILS.includes(email)) {
        console.log('[Auth] Email not in allowed list:', email, ADMIN_EMAILS);
        return done(null, false, { message: 'Not authorized' });
      }
      
      // Upsert user
      console.log('[Auth] Looking up user in database...');
      let user = await db.query.users.findFirst({
        where: eq(schema.users.email, email),
      });
      
      if (!user) {
        console.log('[Auth] Creating new user...');
        const [newUser] = await db.insert(schema.users).values({
          email,
          name: profile.displayName,
          isAdmin: 1,
        }).returning();
        user = newUser;
      }
      
      console.log('[Auth] User authenticated:', user?.email);
      return done(null, user);
    } catch (err) {
      console.error('[Auth] Error in verify callback:', err);
      return done(err as Error);
    }
  }));
  
  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await db.query.users.findFirst({
      where: eq(schema.users.id, id),
    });
    done(null, user);
  });
}

// Auth routes
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/')
);
app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});
app.get('/api/me', (req, res) => {
  res.json({ user: req.user || null });
});

// Auth middleware
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// API routes
app.get('/api/assignments', requireAuth, async (req, res) => {
  const assignments = await db.query.leadAssignments.findMany({
    orderBy: [desc(schema.leadAssignments.assignedAt)],
    limit: 100,
  });
  res.json(assignments);
});

app.get('/api/stats', requireAuth, async (req, res) => {
  const assignments = await db.query.leadAssignments.findMany();
  const stats = {
    total: assignments.length,
    pending: assignments.filter(a => a.status === 'pending').length,
    called: assignments.filter(a => a.status === 'called').length,
    reassigned: assignments.filter(a => a.status === 'reassigned').length,
  };
  res.json(stats);
});

// Source Management API
app.get('/api/sources/available', requireAuth, async (req, res) => {
  try {
    const { getSources } = await import('./services/fub.js');
    const sources = await getSources();
    res.json({ sources });
  } catch (error) {
    console.error('[API] Error fetching available sources:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

app.get('/api/sources/monitored', requireAuth, async (req, res) => {
  const sources = await db.query.monitoredSources.findMany({
    orderBy: [desc(schema.monitoredSources.createdAt)],
  });
  res.json({ sources });
});

app.post('/api/sources/monitored', requireAuth, async (req, res) => {
  const { sourceName, timerMinutes = 30 } = req.body;
  if (!sourceName) {
    return res.status(400).json({ error: 'sourceName is required' });
  }
  
  try {
    const user = req.user as any;
    const [source] = await db.insert(schema.monitoredSources).values({
      sourceName,
      timerMinutes,
      createdBy: user?.email,
    }).returning();
    res.json({ source });
  } catch (error: any) {
    if (error.code === '23505') { // unique violation
      return res.status(400).json({ error: 'Source already being monitored' });
    }
    console.error('[API] Error adding monitored source:', error);
    res.status(500).json({ error: 'Failed to add source' });
  }
});

app.delete('/api/sources/monitored/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  await db.delete(schema.monitoredSources).where(eq(schema.monitoredSources.id, parseInt(id)));
  res.json({ success: true });
});

app.patch('/api/sources/monitored/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { enabled, timerMinutes } = req.body;
  
  const updates: any = {};
  if (enabled !== undefined) updates.enabled = enabled ? 1 : 0;
  if (timerMinutes !== undefined) updates.timerMinutes = timerMinutes;
  
  const [source] = await db.update(schema.monitoredSources)
    .set(updates)
    .where(eq(schema.monitoredSources.id, parseInt(id)))
    .returning();
  res.json({ source });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const clientPath = join(process.cwd(), 'dist/client');
  app.use(express.static(clientPath));
  app.get('*', (req, res) => {
    res.sendFile(join(clientPath, 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startMonitoring();
});
