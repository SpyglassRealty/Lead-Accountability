import { db, schema } from '../db/index.js';
import { eq, and, lt } from 'drizzle-orm';
import { getPondLeads, getPersonCalls, reassignLead } from './fub.js';
import { sendTimerExpiredNotification } from './email.js';

const POND_ID = parseInt(process.env.POND_ID || '18');
const POND_NAME = process.env.POND_NAME || 'Money Time Pond';
const TIMER_MINUTES = 30;

// Track leads we've seen to detect new assignments
const seenLeads = new Map<number, number>(); // fubLeadId -> agentId

export async function checkForNewLeads() {
  console.log(`[Monitor] Checking pond ${POND_ID} for new leads...`);
  
  try {
    const leads = await getPondLeads(POND_ID);
    
    for (const lead of leads) {
      if (!lead.assignedTo) continue; // Not assigned yet
      
      const previousAgent = seenLeads.get(lead.id);
      
      // New assignment detected
      if (previousAgent !== lead.assignedTo.id) {
        console.log(`[Monitor] New assignment: ${lead.name} -> ${lead.assignedTo.name}`);
        
        // Check if we already have an active timer for this lead
        const existing = await db.query.leadAssignments.findFirst({
          where: and(
            eq(schema.leadAssignments.fubLeadId, lead.id),
            eq(schema.leadAssignments.status, 'pending')
          ),
        });
        
        if (!existing) {
          // Start new timer
          const now = new Date();
          const expiresAt = new Date(now.getTime() + TIMER_MINUTES * 60 * 1000);
          
          await db.insert(schema.leadAssignments).values({
            fubLeadId: lead.id,
            agentId: lead.assignedTo.id,
            agentName: lead.assignedTo.name,
            agentEmail: lead.assignedTo.email || '',
            leadName: lead.name,
            assignedAt: now,
            timerExpiresAt: expiresAt,
            status: 'pending',
          });
          
          console.log(`[Monitor] Timer started for ${lead.name}, expires at ${expiresAt.toISOString()}`);
        }
        
        seenLeads.set(lead.id, lead.assignedTo.id);
      }
    }
  } catch (error) {
    console.error('[Monitor] Error checking for new leads:', error);
  }
}

export async function checkExpiredTimers() {
  console.log('[Monitor] Checking for expired timers...');
  
  try {
    const now = new Date();
    const expiredAssignments = await db.query.leadAssignments.findMany({
      where: and(
        eq(schema.leadAssignments.status, 'pending'),
        lt(schema.leadAssignments.timerExpiresAt, now)
      ),
    });
    
    for (const assignment of expiredAssignments) {
      console.log(`[Monitor] Timer expired for lead ${assignment.leadName}`);
      
      // Check if a call was made
      const calls = await getPersonCalls(assignment.fubLeadId, assignment.assignedAt);
      
      if (calls.length > 0) {
        // Call was made, mark as success
        await db.update(schema.leadAssignments)
          .set({ 
            status: 'called',
            callDetectedAt: new Date(calls[0].created),
          })
          .where(eq(schema.leadAssignments.id, assignment.id));
        
        console.log(`[Monitor] Call detected for ${assignment.leadName}, marking as called`);
      } else {
        // No call, send notification and reassign
        await sendTimerExpiredNotification({
          leadName: assignment.leadName,
          agentName: assignment.agentName,
          agentEmail: assignment.agentEmail,
          assignedAt: assignment.assignedAt,
        });
        
        // Reassign lead back to pond
        try {
          await reassignLead(assignment.fubLeadId, POND_ID);
          console.log(`[Monitor] Lead ${assignment.leadName} reassigned to ${POND_NAME}`);
        } catch (error) {
          console.error(`[Monitor] Failed to reassign lead ${assignment.fubLeadId}:`, error);
        }
        
        await db.update(schema.leadAssignments)
          .set({ 
            status: 'reassigned',
            notifiedAt: now,
            reassignedAt: now,
          })
          .where(eq(schema.leadAssignments.id, assignment.id));
      }
    }
  } catch (error) {
    console.error('[Monitor] Error checking expired timers:', error);
  }
}

export function startMonitoring() {
  console.log(`[Monitor] Starting lead monitoring for pond ${POND_ID} (${POND_NAME})`);
  
  // Check for new leads every 30 seconds
  setInterval(checkForNewLeads, 30 * 1000);
  
  // Check for expired timers every minute
  setInterval(checkExpiredTimers, 60 * 1000);
  
  // Run immediately
  checkForNewLeads();
  checkExpiredTimers();
}
