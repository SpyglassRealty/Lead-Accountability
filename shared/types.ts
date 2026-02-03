export interface Lead {
  id: number;
  fubLeadId: number;
  agentId: number;
  agentName: string;
  agentEmail: string;
  leadName: string;
  assignedAt: Date;
  timerExpiresAt: Date;
  status: 'pending' | 'called' | 'expired' | 'reassigned';
  callDetectedAt?: Date;
}

export interface FubLead {
  id: number;
  name: string;
  assignedTo?: {
    id: number;
    name: string;
    email: string;
  };
}
