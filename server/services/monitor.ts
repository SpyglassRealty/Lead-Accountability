import { db, schema } from '../db/index.js';
import { eq, and, lt } from 'drizzle-orm';
import { getPondLeads, getPersonCalls, reassignLead, getLeadsBySource, addTagToPerson } from './fub.js';
import { sendTimerExpiredNotification } from './email.js';

const POND_ID = parseInt(process.env.POND_ID || '18');
const POND_NAME = process.env.POND_NAME || 'Money Time Pond';
const TIMER_MINUTES = 30;
const REASSIGNED_TAG = 'Reassigned';

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

// Check leads from monitored sources
export async function checkSourceLeads() {
  try {
    // Get all enabled monitored sources
    const monitoredSources = await db.query.monitoredSources.findMany({
      where: eq(schema.monitoredSources.enabled, 1),
    });
    
    if (monitoredSources.length === 0) return;
    
    console.log(`[Monitor] Checking ${monitoredSources.length} monitored sources...`);
    
    for (const source of monitoredSources) {
      const leads = await getLeadsBySource(source.sourceName);
      
      for (const lead of leads) {
        if (!lead.assignedTo) continue; // Not assigned yet
        
        const previousAgent = seenLeads.get(lead.id);
        
        // New assignment detected
        if (previousAgent !== lead.assignedTo.id) {
          console.log(`[Monitor] New lead from source "${source.sourceName}": ${lead.name} -> ${lead.assignedTo.name}`);
          
          // Check if we already have an active timer for this lead
          const existing = await db.query.leadAssignments.findFirst({
            where: and(
              eq(schema.leadAssignments.fubLeadId, lead.id),
              eq(schema.leadAssignments.status, 'pending')
            ),
          });
          
          if (!existing) {
            const now = new Date();
            const timerMinutes = source.timerMinutes || TIMER_MINUTES;
            const expiresAt = new Date(now.getTime() + timerMinutes * 60 * 1000);
            
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
            
            console.log(`[Monitor] Timer started for ${lead.name} (${timerMinutes} min), expires at ${expiresAt.toISOString()}`);
          }
          
          seenLeads.set(lead.id, lead.assignedTo.id);
        }
      }
    }
  } catch (error) {
    console.error('[Monitor] Error checking source leads:', error);
  }
}

// Updated expired timer handler - adds tag instead of reassigning
export async function checkExpiredTimersAndTag() {
  console.log('[Monitor] Checking for expired timers (tag mode)...');
  
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
        // No call - add "Reassigned" tag to lead in FUB
        try {
          await addTagToPerson(assignment.fubLeadId, REASSIGNED_TAG);
          console.log(`[Monitor] Added "${REASSIGNED_TAG}" tag to lead ${assignment.leadName}`);
        } catch (error) {
          console.error(`[Monitor] Failed to add tag to lead ${assignment.fubLeadId}:`, error);
        }
        
        // Send notification
        await sendTimerExpiredNotification({
          leadName: assignment.leadName,
          agentName: assignment.agentName,
          agentEmail: assignment.agentEmail,
          assignedAt: assignment.assignedAt,
        });
        
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
  console.log(`[Monitor] Starting lead monitoring`);
  console.log(`[Monitor] - Pond monitoring: pond ${POND_ID} (${POND_NAME})`);
  console.log(`[Monitor] - Source monitoring: enabled (checking database for sources)`);
  
  // Check for new leads every 30 seconds (pond-based)
  setInterval(checkForNewLeads, 30 * 1000);
  
  // Check source-based leads every 30 seconds
  setInterval(checkSourceLeads, 30 * 1000);
  
  // Check for expired timers every minute (uses tag mode)
  setInterval(checkExpiredTimersAndTag, 60 * 1000);
  
  // Run immediately
  checkForNewLeads();
  checkSourceLeads();
  checkExpiredTimersAndTag();
}
