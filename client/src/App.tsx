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

interface MonitoredSource {
  id: number;
  sourceName: string;
  timerMinutes: number;
  enabled: number;
  createdAt: string;
  createdBy: string | null;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<'leads' | 'sources'>('leads');
  const [monitoredSources, setMonitoredSources] = useState<MonitoredSource[]>([]);
  const [newSourceName, setNewSourceName] = useState('');
  const [newTimerMinutes, setNewTimerMinutes] = useState(30);
  const [addingSource, setAddingSource] = useState(false);

  useEffect(() => {
    fetch('/api/me', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setUser(data.user);
        setLoading(false);
        if (data.user) {
          loadData();
          loadSources();
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

  const loadSources = async () => {
    const res = await fetch('/api/sources/monitored', { credentials: 'include' });
    const data = await res.json();
    setMonitoredSources(data.sources || []);
  };

  const addSource = async () => {
    if (!newSourceName.trim()) return;
    setAddingSource(true);
    
    try {
      const res = await fetch('/api/sources/monitored', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          sourceName: newSourceName.trim(),
          timerMinutes: newTimerMinutes 
        }),
      });
      
      if (res.ok) {
        setNewSourceName('');
        setNewTimerMinutes(30);
        loadSources();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add source');
      }
    } finally {
      setAddingSource(false);
    }
  };

  const deleteSource = async (id: number) => {
    if (!confirm('Remove this source from monitoring?')) return;
    await fetch(`/api/sources/monitored/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    loadSources();
  };

  const toggleSource = async (source: MonitoredSource) => {
    await fetch(`/api/sources/monitored/${source.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ enabled: source.enabled ? 0 : 1 }),
    });
    loadSources();
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
      <div className="min-h-screen flex">
        {/* Left Panel - Branding */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-orange-50 via-rose-50 to-orange-100 flex-col items-center justify-center p-12">
          <img 
            src="https://www.spyglassrealty.com/wp-content/uploads/2024/08/Spyglass-logo-rect.png" 
            alt="Spyglass Realty" 
            className="w-64 mb-8"
          />
          <h1 className="text-4xl font-serif font-bold text-gray-900 mb-6 text-center">
            Lead Accountability System
          </h1>
          <p className="text-gray-600 text-center text-lg max-w-md">
            Monitor leads in real-time and ensure agents contact them within 30 minutes. 
            Automated reassignment keeps your pipeline moving.
          </p>
        </div>

        {/* Right Panel - Login */}
        <div className="w-full lg:w-1/2 flex items-center justify-center bg-gray-50 p-8">
          <div className="bg-white p-10 rounded-xl shadow-lg max-w-md w-full">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-6">
              <img 
                src="https://www.spyglassrealty.com/wp-content/uploads/2024/08/Spyglass-logo-rect.png" 
                alt="Spyglass Realty" 
                className="w-48"
              />
            </div>
            
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-2">
              Welcome Back
            </h2>
            <p className="text-gray-500 text-center mb-8">
              Sign in with your Google account to access the dashboard
            </p>
            
            <a 
              href="/auth/google"
              className="flex items-center justify-center gap-3 w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-4 px-6 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M13.8 12H3"/>
              </svg>
              Sign in with Google
            </a>
            
            <p className="text-gray-400 text-sm text-center mt-6">
              Access is restricted to authorized Spyglass Realty team members only.
            </p>
          </div>
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
          <div className="flex items-center gap-4">
            <img 
              src="https://www.spyglassrealty.com/wp-content/uploads/2024/08/Spyglass-logo-rect.png" 
              alt="Spyglass Realty" 
              className="h-8"
            />
            <h1 className="text-xl font-bold">Lead Accountability</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{user.email}</span>
            <a href="/auth/logout" className="text-red-600 hover:underline">Logout</a>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div className="border-b border-gray-200">
          <nav className="flex gap-8">
            <button
              onClick={() => setActiveTab('leads')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'leads'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Lead Assignments
            </button>
            <button
              onClick={() => setActiveTab('sources')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'sources'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Monitored Sources
            </button>
          </nav>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'leads' && (
          <>
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
                  className="text-orange-600 hover:underline text-sm"
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
          </>
        )}

        {activeTab === 'sources' && (
          <div className="space-y-6">
            {/* Add Source Form */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="font-semibold mb-4">Add Source to Monitor</h2>
              <p className="text-gray-600 text-sm mb-4">
                Leads from monitored sources will be tracked. If the assigned agent doesn't call within the timer period, 
                the lead will be tagged with "Reassigned" in Follow Up Boss.
              </p>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Name (exact match from FUB)
                  </label>
                  <input
                    type="text"
                    value={newSourceName}
                    onChange={e => setNewSourceName(e.target.value)}
                    placeholder="e.g., Ylopo, Zillow, Realtor.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div className="w-32">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Timer (min)
                  </label>
                  <input
                    type="number"
                    value={newTimerMinutes}
                    onChange={e => setNewTimerMinutes(parseInt(e.target.value) || 30)}
                    min={1}
                    max={120}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <button
                  onClick={addSource}
                  disabled={addingSource || !newSourceName.trim()}
                  className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700 disabled:opacity-50"
                >
                  {addingSource ? 'Adding...' : 'Add Source'}
                </button>
              </div>
            </div>

            {/* Monitored Sources List */}
            <div className="bg-white rounded-lg shadow">
              <div className="px-4 py-3 border-b flex justify-between items-center">
                <h2 className="font-semibold">Monitored Sources ({monitoredSources.length})</h2>
                <button 
                  onClick={loadSources}
                  className="text-orange-600 hover:underline text-sm"
                >
                  Refresh
                </button>
              </div>
              
              {monitoredSources.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No sources being monitored. Add a source above to get started.
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Source Name</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Timer</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Added</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {monitoredSources.map(source => (
                      <tr key={source.id}>
                        <td className="px-4 py-3 font-medium">{source.sourceName}</td>
                        <td className="px-4 py-3">{source.timerMinutes} min</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => toggleSource(source)}
                            className={`px-2 py-1 rounded text-sm ${
                              source.enabled 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {source.enabled ? 'Active' : 'Paused'}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {source.createdAt ? new Date(source.createdAt).toLocaleDateString() : '-'}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => deleteSource(source.id)}
                            className="text-red-600 hover:underline text-sm"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
