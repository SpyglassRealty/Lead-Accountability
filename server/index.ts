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

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
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
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value;
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return done(null, false, { message: 'Not authorized' });
    }
    
    // Upsert user
    let user = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });
    
    if (!user) {
      const [newUser] = await db.insert(schema.users).values({
        email,
        name: profile.displayName,
        isAdmin: 1,
      }).returning();
      user = newUser;
    }
    
    return done(null, user);
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
