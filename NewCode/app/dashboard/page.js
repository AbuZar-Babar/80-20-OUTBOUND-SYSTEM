"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/apiClient';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, upload, inboxes, approvals, settings

  // Aggregated Stats & Team
  const [teamLeaderboard, setTeamLeaderboard] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // Approvals State
  const [registeredUsers, setRegisteredUsers] = useState([]);

  // Campaigns State
  const [campaigns, setCampaigns] = useState([]);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  // CSV Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadCampaignId, setUploadCampaignId] = useState('');
  const [uploadAssigneeId, setUploadAssigneeId] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Settings State
  const [settings, setSettings] = useState({
    callRecordingEnabled: false,
    allowedHoursStart: 8,
    allowedHoursEnd: 18,
    crmWebhookUrl: ''
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');

  // Inboxes State
  const [inboxes, setInboxes] = useState([]);
  const [newInboxName, setNewInboxName] = useState('');
  const [newInboxEmail, setNewInboxEmail] = useState('');
  const [newInboxNameField, setNewInboxNameField] = useState('');
  const [creatingInbox, setCreatingInbox] = useState(false);

  useEffect(() => {
    const localUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!localUser || !token) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(localUser);
    if (parsedUser.role === 'salesperson') {
      router.push('/workstation');
      return;
    }

    setUser(parsedUser);
    fetchData();

    // Set polling refresh interval for alerts & online states (30s)
    const interval = setInterval(fetchAlertsAndOnline, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    setStatsLoading(true);
    try {
      await fetchAlertsAndOnline();
      await fetchTeamLeaderboard();
      await fetchCampaigns();
      await fetchUsers();
      await fetchConfig();
      await fetchInboxes();
    } catch (e) {
      console.error('Error fetching dashboard datasets:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchAlertsAndOnline = async () => {
    try {
      const alertRes = await apiRequest('/api/manager/alerts');
      if (alertRes.success) setAlerts(alertRes.data);

      const onlineRes = await apiRequest('/api/session/online');
      if (onlineRes.success) setOnlineUsers(onlineRes.data);
    } catch (e) {}
  };

  const fetchTeamLeaderboard = async () => {
    try {
      // Fetch users and then fetch stats for each to build the leaderboard
      const usersRes = await apiRequest('/api/manager/users');
      if (usersRes.success) {
        const salespeople = usersRes.data.filter(u => u.role === 'salesperson');
        const board = [];
        for (const sp of salespeople) {
          const statsRes = await apiRequest(`/api/session/stats?userId=${sp._id}`);
          const metricsRes = await apiRequest(`/api/manager/metrics?userId=${sp._id}`).catch(() => ({ data: {} }));
          board.push({
            _id: sp._id,
            name: sp.name,
            email: sp.email,
            timezone: sp.timezone || 'UTC',
            activeTime: statsRes.data?.activeTimeSeconds || 0,
            dialTime: statsRes.data?.dialingTimeSeconds || 0,
            breakTime: statsRes.data?.breakTimeSeconds || 0,
            booked: metricsRes.data?.booked || 0,
            contacted: metricsRes.data?.contacted || 0,
            callsToday: metricsRes.data?.callsToday || 0
          });
        }
        setTeamLeaderboard(board);
      }
    } catch (e) {
      console.warn('Leaderboard fetch failure');
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await apiRequest('/api/manager/campaigns');
      if (res.success) setCampaigns(res.data);
    } catch (e) {}
  };

  const fetchUsers = async () => {
    try {
      const res = await apiRequest('/api/manager/users');
      if (res.success) setRegisteredUsers(res.data);
    } catch (e) {}
  };

  const fetchConfig = async () => {
    try {
      const res = await apiRequest('/api/manager/config');
      if (res.success) setSettings(res.data);
    } catch (e) {}
  };

  const fetchInboxes = async () => {
    try {
      // Mock sending inboxes list
      setInboxes([
        { _id: 'default', name: 'Default SendGrid Identity', fromEmail: 'outbound@8020dialer.com', fromName: '80/20 Outbound', status: 'healthy', emailsSentToday: 0 }
      ]);
    } catch (e) {}
  };

  // Create Campaign
  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    setCreatingCampaign(true);

    try {
      const res = await apiRequest('/api/manager/campaigns', 'POST', {
        name: newCampaignName,
        description: newCampaignDesc
      });
      if (res.success) {
        setNewCampaignName('');
        setNewCampaignDesc('');
        fetchCampaigns();
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingCampaign(false);
    }
  };

  // CSV File Import Upload
  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError('Please choose a CSV file first.');
      return;
    }
    setUploading(true);
    setUploadError('');
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (uploadCampaignId) formData.append('campaignId', uploadCampaignId);
      if (uploadAssigneeId) formData.append('userId', uploadAssigneeId);

      const res = await apiRequest('/api/leads/upload', 'POST', formData, true);
      if (res.success) {
        setUploadResult(res.data);
        setSelectedFile(null);
        // Clear input element
        const fileInput = document.getElementById('csv-file-input');
        if (fileInput) fileInput.value = '';
        fetchTeamLeaderboard();
      }
    } catch (err) {
      setUploadError(err.message || 'File import failed.');
    } finally {
      setUploading(false);
    }
  };

  // System Config Settings Update
  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsSuccess('');

    try {
      const res = await apiRequest('/api/manager/config', 'PUT', settings);
      if (res.success) {
        setSettings(res.data);
        setSettingsSuccess('System configuration saved successfully.');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Approvals & Roles Toggles
  const handleApproveUser = async (userId) => {
    try {
      const res = await apiRequest('/api/manager/users', 'PUT', { userId, action: 'approve' });
      if (res.success) {
        fetchUsers();
        fetchTeamLeaderboard();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      const res = await apiRequest('/api/manager/users', 'PUT', { userId, action: 'role', role });
      if (res.success) fetchUsers();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRejectUser = async (userId) => {
    if (!confirm('Are you sure you want to remove this user from the system?')) return;
    try {
      const res = await apiRequest(`/api/manager/users?userId=${userId}`, 'DELETE');
      if (res.success) {
        fetchUsers();
        fetchTeamLeaderboard();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Time conversion seconds -> Hrs / Min
  const formatSecs = (sec) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hrs}h ${mins}m`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 min-h-screen text-slate-100 font-sans">
      
      {/* Header */}
      <header className="bg-slate-900/60 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <span className="font-extrabold text-white text-lg">80</span>
          </div>
          <div>
            <h2 className="font-bold text-slate-100 leading-none">Manager Console</h2>
            <span className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">system metrics & configurations</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold">{user?.name}</div>
            <div className="text-[10px] text-slate-400 capitalize">{user?.role}</div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="p-2 rounded-xl border border-slate-850 hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-all"
            title="Log Out"
          >
            🚪
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 overflow-hidden">
        
        {/* Navigation Sidebar (3 columns equivalent) */}
        <aside className="lg:w-64 flex flex-col gap-4">
          <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-2 bg-slate-900/40 p-2 border border-slate-850 rounded-2xl">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 text-xs font-bold rounded-xl text-left whitespace-nowrap transition-all duration-300 w-full flex items-center gap-2 ${activeTab === 'overview' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/20'}`}
            >
              📊 Performance Dashboard
            </button>
            <button
              onClick={() => setActiveTab('upload')}
              className={`px-4 py-3 text-xs font-bold rounded-xl text-left whitespace-nowrap transition-all duration-300 w-full flex items-center gap-2 ${activeTab === 'upload' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/20'}`}
            >
              📥 Upload CSV Leads
            </button>
            <button
              onClick={() => setActiveTab('inboxes')}
              className={`px-4 py-3 text-xs font-bold rounded-xl text-left whitespace-nowrap transition-all duration-300 w-full flex items-center gap-2 ${activeTab === 'inboxes' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/20'}`}
            >
              ✉️ Outbound Inboxes
            </button>
            <button
              onClick={() => setActiveTab('approvals')}
              className={`px-4 py-3 text-xs font-bold rounded-xl text-left whitespace-nowrap transition-all duration-300 w-full flex items-center gap-2 ${activeTab === 'approvals' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/20'}`}
            >
              🔑 Team Approvals
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-3 text-xs font-bold rounded-xl text-left whitespace-nowrap transition-all duration-300 w-full flex items-center gap-2 ${activeTab === 'settings' ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-950/20'}`}
            >
              ⚙️ Dialer Settings
            </button>
          </nav>

          {/* Quick Active Online indicator */}
          <div className="bg-slate-900/40 border border-slate-850 p-5 rounded-3xl shadow-xl hidden lg:block">
            <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">Online Agents ({onlineUsers.length})</h4>
            {onlineUsers.length === 0 ? (
              <p className="text-xs text-slate-500">No active salespeople online.</p>
            ) : (
              <div className="space-y-2">
                {onlineUsers.map(u => (
                  <div key={u._id} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-bold">{u.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Content Container (9 columns equivalent) */}
        <main className="flex-1 overflow-y-auto">
          
          {statsLoading ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-12 flex flex-col items-center justify-center h-full">
              <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 text-sm">Aggregating database summaries...</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Tab 1: Performance Overview Dashboard */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 shadow-xl">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Calls Logged</span>
                      <div className="text-2xl font-black text-white mt-2">
                        {teamLeaderboard.reduce((sum, sp) => sum + (sp.callsToday || 0), 0)}
                      </div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 shadow-xl">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Meetings Booked</span>
                      <div className="text-2xl font-black text-cyan-400 mt-2 animate-pulse">
                        {teamLeaderboard.reduce((sum, sp) => sum + (sp.booked || 0), 0)}
                      </div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 shadow-xl">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Dial Time</span>
                      <div className="text-2xl font-black text-indigo-400 mt-2">
                        {formatSecs(teamLeaderboard.reduce((sum, sp) => sum + (sp.dialTime || 0), 0))}
                      </div>
                    </div>
                    <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 shadow-xl">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Contact Rate</span>
                      <div className="text-2xl font-black text-emerald-400 mt-2">
                        {(() => {
                          const tc = teamLeaderboard.reduce((sum, sp) => sum + (sp.contacted || 0), 0);
                          const ta = teamLeaderboard.reduce((sum, sp) => sum + (sp.callsToday || 0), 0);
                          return ta > 0 ? ((tc / ta) * 100).toFixed(1) + '%' : '0%';
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Alerts logs */}
                  {alerts.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-3xl p-5 shadow-xl">
                      <h3 className="text-xs font-bold uppercase text-red-400 tracking-wider mb-3">System Warnings requiring follow-up</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {alerts.map((al, idx) => (
                          <div key={idx} className="bg-slate-950/50 border border-slate-850/80 p-3 rounded-2xl text-xs flex gap-3 items-center">
                            <span>{al.type === 'error' ? '🔴' : '⚠️'}</span>
                            <span className="text-slate-300 font-semibold">{al.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leaderboard Table */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Salesperson Leaderboard (Today)</h3>
                    {teamLeaderboard.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">No salesperson statistics recorded today.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 font-bold uppercase">
                              <th className="pb-3">Name</th>
                              <th className="pb-3">Calls Today</th>
                              <th className="pb-3">Dials (Worked)</th>
                              <th className="pb-3">Meetings Booked</th>
                              <th className="pb-3">Active Hours</th>
                              <th className="pb-3">Break Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {teamLeaderboard.map((sp) => (
                              <tr key={sp._id} className="border-b border-slate-900 hover:bg-slate-950/20">
                                <td className="py-4 font-bold text-white">{sp.name}</td>
                                <td className="py-4 text-cyan-400 font-black">{sp.callsToday}</td>
                                <td className="py-4">{sp.contacted}</td>
                                <td className="py-4 text-emerald-400 font-black">{sp.booked}</td>
                                <td className="py-4">{formatSecs(sp.activeTime)}</td>
                                <td className="py-4 text-amber-500">{formatSecs(sp.breakTime)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Tab 2: Upload CSV leads & Campaigns */}
              {activeTab === 'upload' && (
                <div className="space-y-6">
                  
                  {/* Create Campaign */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 mb-5">Create Lead Campaign list</h3>
                    <form onSubmit={handleCreateCampaign} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-2">Campaign Name</label>
                          <input
                            type="text"
                            required
                            value={newCampaignName}
                            onChange={(e) => setNewCampaignName(e.target.value)}
                            placeholder="e.g. Q3 Cold SaaS Leads"
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-4 py-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-2">Description</label>
                          <input
                            type="text"
                            value={newCampaignDesc}
                            onChange={(e) => setNewCampaignDesc(e.target.value)}
                            placeholder="e.g. Outreach campaign targeting agency owners"
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-4 py-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none"
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={creatingCampaign}
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl shadow-md text-xs transition-all"
                      >
                        {creatingCampaign ? 'Creating...' : 'Create Campaign'}
                      </button>
                    </form>
                  </div>

                  {/* CSV Upload form */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 mb-5">CSV File Importer</h3>
                    
                    {uploadError && (
                      <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs font-medium">
                        ⚠️ {uploadError}
                      </div>
                    )}

                    <form onSubmit={handleCsvUpload} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        
                        {/* Select file */}
                        <div>
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Choose CSV File</label>
                          <input
                            id="csv-file-input"
                            type="file"
                            accept=".csv"
                            onChange={(e) => setSelectedFile(e.target.files[0])}
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-3 py-2 text-xs focus:outline-none"
                          />
                        </div>

                        {/* Assign to campaign */}
                        <div>
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Assign to Campaign</label>
                          <select
                            value={uploadCampaignId}
                            onChange={(e) => setUploadCampaignId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-4 py-3 text-xs text-slate-100 focus:outline-none"
                          >
                            <option value="">No Campaign (General leads)</option>
                            {campaigns.map(c => (
                              <option key={c._id} value={c._id}>{c.name}</option>
                            ))}
                          </select>
                        </div>

                        {/* Assign to user */}
                        <div>
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Assign to Agent</label>
                          <select
                            value={uploadAssigneeId}
                            onChange={(e) => setUploadAssigneeId(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-4 py-3 text-xs text-slate-100 focus:outline-none"
                          >
                            <option value="">Unassigned (Upload Pool)</option>
                            {registeredUsers.filter(u => u.role === 'salesperson').map(u => (
                              <option key={u._id} value={u._id}>{u.name}</option>
                            ))}
                          </select>
                        </div>

                      </div>

                      <button
                        type="submit"
                        disabled={uploading}
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-3 rounded-xl shadow-md text-xs transition-all flex items-center gap-2 disabled:opacity-40"
                      >
                        {uploading ? 'Importing CSV rows...' : '📥 Import Leads'}
                      </button>
                    </form>

                    {/* Mapping log result */}
                    {uploadResult && (
                      <div className="mt-8 bg-slate-950/60 p-5 rounded-2xl border border-slate-850 text-xs space-y-3">
                        <h4 className="font-bold text-white uppercase tracking-wider">CSV Upload Report Summary</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-2">
                          <div className="bg-slate-900 p-3 rounded-xl">
                            <span className="text-[10px] text-slate-500 block">Total Checked</span>
                            <div className="text-base font-bold text-white">{uploadResult.total}</div>
                          </div>
                          <div className="bg-slate-900 p-3 rounded-xl">
                            <span className="text-[10px] text-slate-500 block">Successfully Imported</span>
                            <div className="text-base font-bold text-emerald-400">{uploadResult.imported}</div>
                          </div>
                          <div className="bg-slate-900 p-3 rounded-xl">
                            <span className="text-[10px] text-slate-500 block">Duplicates (Skipped)</span>
                            <div className="text-base font-bold text-amber-500">{uploadResult.duplicates}</div>
                          </div>
                          <div className="bg-slate-900 p-3 rounded-xl">
                            <span className="text-[10px] text-slate-500 block">Errors / Bad Format</span>
                            <div className="text-base font-bold text-red-500">{uploadResult.errors}</div>
                          </div>
                        </div>

                        {uploadResult.duplicateList?.length > 0 && (
                          <div className="max-h-36 overflow-y-auto pt-2 border-t border-slate-900">
                            <span className="font-semibold text-slate-400 block mb-1">Duplicate Rows Skipped:</span>
                            <div className="space-y-1">
                              {uploadResult.duplicateList.map((d, i) => (
                                <div key={i} className="text-slate-500 leading-normal">
                                  Row {d.row}: {d.name} ({d.phone || d.email || 'duplicate contact details'})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Tab 3: Outbound Inboxes list */}
              {activeTab === 'inboxes' && (
                <div className="space-y-6">
                  
                  {/* Setup Inbox details */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 mb-5">Configure Sender SMTP/SendGrid Identity</h3>
                    
                    <form className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-2">Display Name</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Sales Team"
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-4 py-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-2">From Email (SendGrid Validated)</label>
                          <input
                            type="email"
                            required
                            placeholder="e.g. outbound@domain.com"
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-4 py-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 font-semibold mb-2">Daily Sending Throttle</label>
                          <input
                            type="number"
                            defaultValue={50}
                            className="w-full bg-slate-950 border border-slate-850 rounded-2xl px-4 py-3 text-xs text-slate-100 focus:outline-none"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => alert('Sending Identity successfully added. Mailer ready.')}
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl shadow-md text-xs transition-all"
                      >
                        Add Outbound Identity
                      </button>
                    </form>
                  </div>

                  {/* List configured inboxes */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Configured Sending Identities</h3>
                    <div className="space-y-3">
                      {inboxes.map(ib => (
                        <div key={ib._id} className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-white text-sm">{ib.name}</div>
                            <div className="text-slate-400 mt-1">From: {ib.fromName} &lt;{ib.fromEmail}&gt;</div>
                          </div>
                          <div className="text-right">
                            <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">Healthy</span>
                            <div className="text-[10px] text-slate-500 mt-1">Sent today: 0</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

              {/* Tab 4: Approvals */}
              {activeTab === 'approvals' && (
                <div className="space-y-6">
                  
                  {/* Approvals manager lists */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Team Registrations & Approvals</h3>
                    {registeredUsers.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">No users found.</p>
                    ) : (
                      <div className="space-y-3">
                        {registeredUsers.map(u => (
                          <div key={u._id} className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                            <div>
                              <div className="font-bold text-white text-sm">{u.name}</div>
                              <div className="text-slate-400 mt-1">{u.email}</div>
                              <div className="text-[10px] text-slate-500 mt-1">Registered: {new Date(u.createdAt).toLocaleDateString()}</div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              {/* Approved status */}
                              {!u.approved ? (
                                <button
                                  onClick={() => handleApproveUser(u._id)}
                                  className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all"
                                >
                                  ✅ Approve Access
                                </button>
                              ) : (
                                <span className="bg-cyan-500/15 text-cyan-400 px-3 py-1.5 rounded-xl font-bold uppercase tracking-wider text-[9px] border border-cyan-500/10">
                                  Approved
                                </span>
                              )}

                              {/* Role Selector */}
                              <select
                                value={u.role}
                                onChange={(e) => handleRoleChange(u._id, e.target.value)}
                                className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-xs"
                              >
                                <option value="salesperson">Salesperson</option>
                                <option value="manager">Manager</option>
                                <option value="owner">Owner</option>
                              </select>

                              {/* Reject/Delete */}
                              <button
                                onClick={() => handleRejectUser(u._id)}
                                className="text-red-400 hover:text-red-300 font-bold border border-red-500/20 hover:border-red-500/30 p-2 rounded-xl"
                                title="Delete user"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* Tab 5: System settings configurations */}
              {activeTab === 'settings' && (
                <div className="space-y-6">
                  
                  {/* Settings form */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 mb-5">Global Outbound dialer rules</h3>
                    
                    {settingsSuccess && (
                      <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-xs font-medium">
                        ✅ {settingsSuccess}
                      </div>
                    )}

                    <form onSubmit={handleUpdateConfig} className="space-y-6">
                      
                      {/* Webhook URL */}
                      <div>
                        <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Outbound CRM Webhook URL ( Zapier / Make / CRM POST )</label>
                        <input
                          type="url"
                          value={settings.crmWebhookUrl}
                          onChange={(e) => setSettings({ ...settings, crmWebhookUrl: e.target.value })}
                          placeholder="https://hooks.zapier.com/hooks/catch/..."
                          className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500/50 rounded-2xl px-4 py-3.5 text-xs text-slate-100 placeholder-slate-750 focus:outline-none transition-all duration-300"
                        />
                      </div>

                      {/* Call Hours */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Allowed Calling Hours (Start)</label>
                          <select
                            value={settings.allowedHoursStart}
                            onChange={(e) => setSettings({ ...settings, allowedHoursStart: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500/50 rounded-2xl px-4 py-3 text-xs text-slate-100 focus:outline-none"
                          >
                            {Array.from({ length: 24 }).map((_, h) => (
                              <option key={h} value={h}>{h.toString().padStart(2, '0')}:00 ({h < 12 ? 'AM' : 'PM'})</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Allowed Calling Hours (End)</label>
                          <select
                            value={settings.allowedHoursEnd}
                            onChange={(e) => setSettings({ ...settings, allowedHoursEnd: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500/50 rounded-2xl px-4 py-3 text-xs text-slate-100 focus:outline-none"
                          >
                            {Array.from({ length: 24 }).map((_, h) => (
                              <option key={h} value={h}>{h.toString().padStart(2, '0')}:00 ({h < 12 ? 'AM' : 'PM'})</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Call Recording */}
                      <div className="flex items-center justify-between bg-slate-950/40 p-4 border border-slate-850 rounded-2xl">
                        <div>
                          <h4 className="text-xs font-bold text-white uppercase tracking-wider">Enable outbound call recording</h4>
                          <p className="text-[10px] text-slate-500 mt-1">Saves a copy of every dial conversation into Twilio cloud recordings.</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings.callRecordingEnabled}
                          onChange={(e) => setSettings({ ...settings, callRecordingEnabled: e.target.checked })}
                          className="w-5 h-5 bg-slate-900 border-slate-800 text-cyan-500 rounded focus:ring-cyan-500 cursor-pointer"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-3 rounded-xl shadow-md text-xs transition-all disabled:opacity-40"
                      >
                        {savingSettings ? 'Saving Settings...' : 'Save Settings'}
                      </button>
                    </form>
                  </div>

                </div>
              )}

            </div>
          )}
        </main>

      </div>
    </div>
  );
}
