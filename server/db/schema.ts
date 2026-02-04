import { pgTable, serial, integer, text, timestamp, varchar } from 'drizzle-orm/pg-core';

export const leadAssignments = pgTable('lead_assignments', {
  id: serial('id').primaryKey(),
  fubLeadId: integer('fub_lead_id').notNull(),
  agentId: integer('agent_id').notNull(),
  agentName: varchar('agent_name', { length: 255 }).notNull(),
  agentEmail: varchar('agent_email', { length: 255 }).notNull(),
  leadName: varchar('lead_name', { length: 255 }).notNull(),
  assignedAt: timestamp('assigned_at').notNull().defaultNow(),
  timerExpiresAt: timestamp('timer_expires_at').notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  callDetectedAt: timestamp('call_detected_at'),
  notifiedAt: timestamp('notified_at'),
  reassignedAt: timestamp('reassigned_at'),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  isAdmin: integer('is_admin').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Monitored sources - leads from these sources will be tracked
export const monitoredSources = pgTable('monitored_sources', {
  id: serial('id').primaryKey(),
  sourceName: varchar('source_name', { length: 255 }).notNull().unique(),
  timerMinutes: integer('timer_minutes').notNull().default(30),
  enabled: integer('enabled').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow(),
  createdBy: varchar('created_by', { length: 255 }),
});
