const FUB_API_KEY = process.env.FUB_API_KEY!;
const FUB_BASE_URL = 'https://api.followupboss.com/v1';

interface FubPerson {
  id: number;
  name: string;
  emails?: { value: string }[];
  assignedTo?: { id: number; name: string; email: string };
}

interface FubCall {
  id: number;
  personId: number;
  created: string;
  direction: string;
}

async function fubFetch(endpoint: string, options: RequestInit = {}) {
  const auth = Buffer.from(`${FUB_API_KEY}:`).toString('base64');
  const res = await fetch(`${FUB_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`FUB API error: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function getPondLeads(pondId: number): Promise<FubPerson[]> {
  const data = await fubFetch(`/people?pondId=${pondId}&limit=100`);
  return data.people || [];
}

export async function getPersonCalls(personId: number, since: Date): Promise<FubCall[]> {
  const sinceStr = since.toISOString();
  const data = await fubFetch(`/calls?personId=${personId}&created=${sinceStr}`);
  return data.calls || [];
}

export async function reassignLead(personId: number, newPondId: number): Promise<void> {
  // Move lead back to pond (unassign agent, put in pond)
  await fubFetch(`/people/${personId}`, {
    method: 'PUT',
    body: JSON.stringify({
      assignedTo: null,
      pondId: newPondId,
    }),
  });
}

export async function getAgentInfo(agentId: number): Promise<{ id: number; name: string; email: string } | null> {
  try {
    const data = await fubFetch(`/users/${agentId}`);
    return {
      id: data.id,
      name: data.name || data.email,
      email: data.email,
    };
  } catch {
    return null;
  }
}
