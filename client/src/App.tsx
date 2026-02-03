import React, { useEffect, useState } from 'react';

interface User {
  id: number;
  email: string;
  name: string;
}

interface Assignment {
  id: number;
  leadName: string;
  agentName: string;
  agentEmail: string;
  assignedAt: string;
  timerExpiresAt: string;
  status: string;
}

interface Stats {
  total: number;
  pending: number;
  called: number;
  reassigned: number;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setUser(data.user);
        setLoading(false);
        if (data.user) {
          loadData();
        }
      });
  }, []);

  const loadData = async () => {
    const [assignmentsRes, statsRes] = await Promise.all([
      fetch('/api/assignments', { credentials: 'include' }),
      fetch('/api/stats', { credentials: 'include' }),
    ]);
    setAssignments(await assignmentsRes.json());
    setStats(await statsRes.json());
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center">
          <h1 className="text-2xl font-bold mb-4">Lead Accountability</h1>
          <p className="text-gray-600 mb-6">Sign in to access the dashboard</p>
          <a 
            href="/auth/google"
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Sign in with Google
          </a>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    called: 'bg-green-100 text-green-800',
    reassigned: 'bg-red-100 text-red-800',
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Lead Accountability</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{user.email}</span>
            <a href="/auth/logout" className="text-red-600 hover:underline">Logout</a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {stats && (
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-gray-500">Total Leads</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
              <div className="text-gray-500">Pending</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-green-600">{stats.called}</div>
              <div className="text-gray-500">Called</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-red-600">{stats.reassigned}</div>
              <div className="text-gray-500">Reassigned</div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <h2 className="font-semibold">Recent Assignments</h2>
            <button 
              onClick={loadData}
              className="text-blue-600 hover:underline text-sm"
            >
              Refresh
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Lead</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Agent</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Assigned</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Timer</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {assignments.map(a => (
                <tr key={a.id}>
                  <td className="px-4 py-3">{a.leadName}</td>
                  <td className="px-4 py-3">
                    <div>{a.agentName}</div>
                    <div className="text-sm text-gray-500">{a.agentEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {new Date(a.assignedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {new Date(a.timerExpiresAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-sm ${statusColors[a.status] || 'bg-gray-100'}`}>
                      {a.status}
                    </span>
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No assignments yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
