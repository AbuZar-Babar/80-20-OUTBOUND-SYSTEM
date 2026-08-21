"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/apiClient';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const [teamLeaderboard, setTeamLeaderboard] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);

  const [registeredUsers, setRegisteredUsers] = useState([]);

  const [campaigns, setCampaigns] = useState([]);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadCampaignId, setUploadCampaignId] = useState('');
  const [uploadAssigneeId, setUploadAssigneeId] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const [settings, setSettings] = useState({
    callRecordingEnabled: false,
    allowedHoursStart: 8,
    allowedHoursEnd: 18,
    crmWebhookUrl: ''
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState('');

  const [inboxes, setInboxes] = useState([]);

  useEffect(() => {
    const localUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (!localUser || !token) { router.push('/login'); return; }
    const parsedUser = JSON.parse(localUser);
    if (parsedUser.role === 'salesperson') { router.push('/workstation'); return; }
    setUser(parsedUser);
    fetchData();
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
      console.error('Dashboard fetch error:', e);
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
    } catch (e) {}
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
    setInboxes([
      { _id: 'default', name: 'Default Resend Identity', fromEmail: 'onboarding@resend.dev', fromName: '80/20 Outbound' }
    ]);
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    setCreatingCampaign(true);
    try {
      const res = await apiRequest('/api/manager/campaigns', 'POST', { name: newCampaignName, description: newCampaignDesc });
      if (res.success) { setNewCampaignName(''); setNewCampaignDesc(''); fetchCampaigns(); }
    } catch (err) { alert(err.message); }
    finally { setCreatingCampaign(false); }
  };

  const handleCsvUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) { setUploadError('Please choose a CSV file first.'); return; }
    setUploading(true); setUploadError(''); setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      if (uploadCampaignId) formData.append('campaignId', uploadCampaignId);
      if (uploadAssigneeId) formData.append('userId', uploadAssigneeId);
      const res = await apiRequest('/api/leads/upload', 'POST', formData, true);
      if (res.success) {
        setUploadResult(res.data); setSelectedFile(null);
        const fi = document.getElementById('csv-file-input');
        if (fi) fi.value = '';
        fetchTeamLeaderboard();
      }
    } catch (err) { setUploadError(err.message || 'Import failed.'); }
    finally { setUploading(false); }
  };

  const handleUpdateConfig = async (e) => {
    e.preventDefault();
    setSavingSettings(true); setSettingsSuccess('');
    try {
      const res = await apiRequest('/api/manager/config', 'PUT', settings);
      if (res.success) { setSettings(res.data); setSettingsSuccess('Configuration saved successfully.'); }
    } catch (err) { alert(err.message); }
    finally { setSavingSettings(false); }
  };

  const handleApproveUser = async (userId) => {
    try {
      const res = await apiRequest('/api/manager/users', 'PUT', { userId, action: 'approve' });
      if (res.success) { fetchUsers(); fetchTeamLeaderboard(); }
    } catch (err) { alert(err.message); }
  };

  const handleRoleChange = async (userId, role) => {
    try {
      const res = await apiRequest('/api/manager/users', 'PUT', { userId, action: 'role', role });
      if (res.success) fetchUsers();
    } catch (err) { alert(err.message); }
  };

  const handleRejectUser = async (userId) => {
    if (!confirm('Remove this user from the system?')) return;
    try {
      const res = await apiRequest(`/api/manager/users?userId=${userId}`, 'DELETE');
      if (res.success) { fetchUsers(); fetchTeamLeaderboard(); }
    } catch (err) { alert(err.message); }
  };

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

  // Sidebar nav config (icons defined as components to avoid JSX-in-array issues)
  const NavChartIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
  const NavUploadIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
  const NavEmailIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
  const NavTeamIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
  const NavSettingsIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const navItems = [
    { id: 'overview',  label: 'Performance',    Icon: NavChartIcon },
    { id: 'upload',    label: 'Upload Leads',   Icon: NavUploadIcon },
    { id: 'inboxes',   label: 'Outbound Email', Icon: NavEmailIcon },
    { id: 'approvals', label: 'Team Access',    Icon: NavTeamIcon },
    { id: 'settings',  label: 'Dialer Config',  Icon: NavSettingsIcon },
  ];

  return (
    <div className="flex flex-col bg-[#0a0c12] min-h-screen text-slate-100" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>

      {/* ── Navbar ── */}
      <header className="bg-[#0d0f18]/90 backdrop-blur-md border-b border-white/5 px-6 h-14 flex items-center justify-between z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <span className="font-black text-white text-xs tracking-tight">80</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-white">Manager Console</span>
            <span className="hidden sm:block text-[10px] text-slate-500 font-medium bg-white/5 px-2 py-0.5 rounded-full uppercase tracking-wider">Admin</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-[11px] font-bold text-slate-200">
              {user?.name?.[0]?.toUpperCase() || 'M'}
            </div>
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-slate-200 leading-none">{user?.name}</div>
              <div className="text-[10px] text-slate-500 capitalize mt-0.5">{user?.role}</div>
            </div>
          </div>
          <div className="w-px h-5 bg-white/10" />
          <button onClick={handleLogout} title="Log Out" className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-white/5 bg-[#0d0f18]/60 flex-col gap-1 p-3 hidden lg:flex">
          {navItems.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-left transition-all duration-150 ${
                activeTab === id
                  ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-white/5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-2 px-1">Online Now</p>
            {onlineUsers.length === 0 ? (
              <p className="text-[10px] text-slate-700 px-1">No agents online</p>
            ) : (
              <div className="space-y-1">
                {onlineUsers.map(u => (
                  <div key={u._id} className="flex items-center gap-2 px-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                    <span className="text-xs text-slate-400 font-medium truncate">{u.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#1e293b transparent' }}>
          {statsLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-xs text-slate-500">Loading dashboard data...</p>
            </div>
          ) : (
            <div className="space-y-5 max-w-6xl mx-auto">

              {/* ─── OVERVIEW ─── */}
              {activeTab === 'overview' && (
                <div className="space-y-5">

                  {/* KPI cards */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-4">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Calls Today</span>
                      <div className="text-2xl font-black tabular-nums mt-2 text-cyan-400">
                        {teamLeaderboard.reduce((s, sp) => s + (sp.callsToday || 0), 0)}
                      </div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-4">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Meetings Booked</span>
                      <div className="text-2xl font-black tabular-nums mt-2 text-emerald-400">
                        {teamLeaderboard.reduce((s, sp) => s + (sp.booked || 0), 0)}
                      </div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-4">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Total Dial Time</span>
                      <div className="text-2xl font-black tabular-nums mt-2 text-indigo-400">
                        {formatSecs(teamLeaderboard.reduce((s, sp) => s + (sp.dialTime || 0), 0))}
                      </div>
                    </div>
                    <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-4">
                      <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Contact Rate</span>
                      <div className="text-2xl font-black tabular-nums mt-2 text-amber-400">
                        {(() => {
                          const tc = teamLeaderboard.reduce((s, sp) => s + (sp.contacted || 0), 0);
                          const ta = teamLeaderboard.reduce((s, sp) => s + (sp.callsToday || 0), 0);
                          return ta > 0 ? ((tc / ta) * 100).toFixed(1) + '%' : '0%';
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/15 rounded-2xl p-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-red-400 mb-3">System Alerts</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {alerts.map((al, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-300 bg-white/[0.02] border border-white/5 rounded-xl p-2.5">
                            <svg className={`w-3 h-3 mt-0.5 shrink-0 ${al.type === 'error' ? 'text-red-400' : 'text-amber-400'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {al.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leaderboard */}
                  <div className="bg-white/[0.03] border border-white/7 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Agent Leaderboard — Today</p>
                      <span className="text-[10px] text-slate-600">{teamLeaderboard.length} agents</span>
                    </div>
                    {teamLeaderboard.length === 0 ? (
                      <div className="py-12 flex flex-col items-center gap-2">
                        <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        <p className="text-xs text-slate-600">No agent data today</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/5 text-[10px] text-slate-600 font-semibold uppercase tracking-wider">
                              <th className="px-5 py-3 text-left">#</th>
                              <th className="px-5 py-3 text-left">Agent</th>
                              <th className="px-5 py-3 text-right">Calls</th>
                              <th className="px-5 py-3 text-right">Contacted</th>
                              <th className="px-5 py-3 text-right">Booked</th>
                              <th className="px-5 py-3 text-right">Active</th>
                              <th className="px-5 py-3 text-right">Break</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[...teamLeaderboard].sort((a, b) => (b.booked || 0) - (a.booked || 0)).map((sp, i) => (
                              <tr key={sp._id} className="border-b border-white/4 last:border-0 hover:bg-white/[0.02] transition-colors">
                                <td className="px-5 py-3.5 text-slate-600 font-bold">{i + 1}</td>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
                                      {sp.name?.[0]?.toUpperCase()}
                                    </div>
                                    <div>
                                      <div className="font-semibold text-slate-200">{sp.name}</div>
                                      <div className="text-[10px] text-slate-600">{sp.timezone}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-right font-bold text-cyan-400 tabular-nums">{sp.callsToday}</td>
                                <td className="px-5 py-3.5 text-right text-slate-400 tabular-nums">{sp.contacted}</td>
                                <td className="px-5 py-3.5 text-right">
                                  <span className={`font-black tabular-nums text-sm ${sp.booked > 0 ? 'text-emerald-400' : 'text-slate-600'}`}>{sp.booked}</span>
                                </td>
                                <td className="px-5 py-3.5 text-right text-slate-400 tabular-nums">{formatSecs(sp.activeTime)}</td>
                                <td className="px-5 py-3.5 text-right text-amber-500 tabular-nums">{formatSecs(sp.breakTime)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── UPLOAD ─── */}
              {activeTab === 'upload' && (
                <div className="space-y-5">

                  {/* Create Campaign */}
                  <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                      <div className="w-5 h-5 rounded-md bg-cyan-500/15 flex items-center justify-center">
                        <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Create Campaign</h3>
                    </div>
                    <form onSubmit={handleCreateCampaign} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Campaign Name</label>
                          <input type="text" required value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} placeholder="e.g. Q3 Cold SaaS Leads" className="w-full bg-[#0a0c12] border border-white/8 focus:border-cyan-500/40 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-all" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Description</label>
                          <input type="text" value={newCampaignDesc} onChange={e => setNewCampaignDesc(e.target.value)} placeholder="e.g. Agency owners Q3 outreach" className="w-full bg-[#0a0c12] border border-white/8 focus:border-cyan-500/40 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-all" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button type="submit" disabled={creatingCampaign} className="flex items-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition-all disabled:opacity-40">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          {creatingCampaign ? 'Creating...' : 'Create Campaign'}
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* CSV Upload */}
                  <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                      <div className="w-5 h-5 rounded-md bg-indigo-500/15 flex items-center justify-center">
                        <svg className="w-3 h-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      </div>
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">CSV Lead Importer</h3>
                    </div>

                    {uploadError && (
                      <div className="mb-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs">
                        <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        {uploadError}
                      </div>
                    )}

                    <form onSubmit={handleCsvUpload} className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">CSV File</label>
                          <input id="csv-file-input" type="file" accept=".csv" onChange={e => setSelectedFile(e.target.files[0])} className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2 text-xs text-slate-400 focus:outline-none file:mr-2 file:text-xs file:font-semibold file:text-cyan-400 file:bg-cyan-500/10 file:border-0 file:rounded-lg file:px-2 file:py-1 cursor-pointer" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Campaign</label>
                          <select value={uploadCampaignId} onChange={e => setUploadCampaignId(e.target.value)} className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none cursor-pointer">
                            <option value="">No Campaign</option>
                            {campaigns.map(c => (
                              <option key={c._id} value={c._id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Assign to Agent</label>
                          <select value={uploadAssigneeId} onChange={e => setUploadAssigneeId(e.target.value)} className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none cursor-pointer">
                            <option value="">Unassigned Pool</option>
                            {registeredUsers.filter(u => u.role === 'salesperson').map(u => (
                              <option key={u._id} value={u._id}>{u.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button type="submit" disabled={uploading} className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 text-indigo-400 font-semibold px-4 py-2 rounded-xl text-xs transition-all disabled:opacity-40">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          {uploading ? 'Importing...' : 'Import Leads'}
                        </button>
                      </div>
                    </form>

                    {uploadResult && (
                      <div className="mt-5 bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Import Report</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {[
                            { label: 'Checked', value: uploadResult.total, color: 'text-slate-300' },
                            { label: 'Imported', value: uploadResult.imported, color: 'text-emerald-400' },
                            { label: 'Duplicates', value: uploadResult.duplicates, color: 'text-amber-400' },
                            { label: 'Errors', value: uploadResult.errors, color: 'text-red-400' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-white/[0.03] border border-white/5 rounded-xl p-3">
                              <div className="text-[10px] text-slate-600">{label}</div>
                              <div className={`text-lg font-black mt-0.5 ${color}`}>{value}</div>
                            </div>
                          ))}
                        </div>
                        {uploadResult.duplicateList?.length > 0 && (
                          <div className="max-h-28 overflow-y-auto text-[10px] text-slate-600 space-y-0.5 border-t border-white/5 pt-2">
                            {uploadResult.duplicateList.map((d, i) => (
                              <div key={i}>Row {d.row}: {d.name} — {d.phone || d.email || 'duplicate'}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── INBOXES ─── */}
              {activeTab === 'inboxes' && (
                <div className="space-y-5">
                  <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                      <div className="w-5 h-5 rounded-md bg-emerald-500/15 flex items-center justify-center">
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Add Sending Identity</h3>
                    </div>
                    <form className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Display Name</label>
                          <input type="text" placeholder="e.g. Sales Team" className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">From Email (Verified)</label>
                          <input type="email" placeholder="outbound@yourdomain.com" className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Daily Limit</label>
                          <input type="number" defaultValue={50} className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none" />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => alert('Identity added.')} className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 font-semibold px-4 py-2 rounded-xl text-xs transition-all">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add Identity
                        </button>
                      </div>
                    </form>
                  </div>

                  <div className="bg-white/[0.03] border border-white/7 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-white/5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Configured Identities</p>
                    </div>
                    <div className="divide-y divide-white/4">
                      {inboxes.map(ib => (
                        <div key={ib._id} className="px-5 py-4 flex items-center justify-between">
                          <div>
                            <div className="text-xs font-semibold text-slate-200">{ib.name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{ib.fromName} &lt;{ib.fromEmail}&gt;</div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase">Healthy</span>
                            <div className="text-[10px] text-slate-600 mt-1">Sent today: 0</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ─── APPROVALS ─── */}
              {activeTab === 'approvals' && (
                <div className="bg-white/[0.03] border border-white/7 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Team Registrations</p>
                    <span className="text-[10px] text-slate-600">{registeredUsers.length} users</span>
                  </div>
                  {registeredUsers.length === 0 ? (
                    <div className="py-12 flex flex-col items-center gap-2">
                      <svg className="w-8 h-8 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <p className="text-xs text-slate-600">No users registered</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/4">
                      {registeredUsers.map(u => (
                        <div key={u._id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-700 to-slate-600 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
                              {u.name?.[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-slate-200">{u.name}</div>
                              <div className="text-[10px] text-slate-500">{u.email}</div>
                              <div className="text-[10px] text-slate-700 mt-0.5">Joined {new Date(u.createdAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2.5">
                            {!u.approved ? (
                              <button onClick={() => handleApproveUser(u._id)} className="flex items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-400 font-semibold px-3 py-1.5 rounded-xl text-xs transition-all">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                                Approve
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 rounded-full uppercase">Approved</span>
                            )}
                            <select value={u.role} onChange={e => handleRoleChange(u._id, e.target.value)} className="bg-[#0a0c12] border border-white/8 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer">
                              <option value="salesperson">Salesperson</option>
                              <option value="manager">Manager</option>
                              <option value="owner">Owner</option>
                            </select>
                            <button onClick={() => handleRejectUser(u._id)} title="Delete" className="p-1.5 rounded-xl text-red-500/50 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ─── SETTINGS ─── */}
              {activeTab === 'settings' && (
                <div className="bg-white/[0.03] border border-white/7 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
                    <div className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center">
                      <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Dialer Configuration</h3>
                  </div>

                  {settingsSuccess && (
                    <div className="mb-4 flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      {settingsSuccess}
                    </div>
                  )}

                  <form onSubmit={handleUpdateConfig} className="space-y-5">
                    <div>
                      <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">CRM Webhook URL</label>
                      <input type="url" value={settings.crmWebhookUrl} onChange={e => setSettings({ ...settings, crmWebhookUrl: e.target.value })} placeholder="https://hooks.zapier.com/..." className="w-full bg-[#0a0c12] border border-white/8 focus:border-cyan-500/40 rounded-xl px-3 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-all" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Calling Hours Start</label>
                        <select value={settings.allowedHoursStart} onChange={e => setSettings({ ...settings, allowedHoursStart: e.target.value })} className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none cursor-pointer">
                          {Array.from({ length: 24 }).map((_, h) => (
                            <option key={h} value={h}>{String(h).padStart(2, '0')}:00 ({h < 12 ? 'AM' : 'PM'})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">Calling Hours End</label>
                        <select value={settings.allowedHoursEnd} onChange={e => setSettings({ ...settings, allowedHoursEnd: e.target.value })} className="w-full bg-[#0a0c12] border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none cursor-pointer">
                          {Array.from({ length: 24 }).map((_, h) => (
                            <option key={h} value={h}>{String(h).padStart(2, '0')}:00 ({h < 12 ? 'AM' : 'PM'})</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3.5">
                      <div>
                        <div className="text-xs font-semibold text-slate-200">Enable Call Recording</div>
                        <p className="text-[10px] text-slate-600 mt-0.5">Saves recordings to Twilio cloud</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettings(s => ({ ...s, callRecordingEnabled: !s.callRecordingEnabled }))}
                        className={`relative rounded-full transition-all duration-200 ${settings.callRecordingEnabled ? 'bg-cyan-500' : 'bg-slate-700'}`}
                        style={{ height: '22px', width: '40px' }}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all duration-200 ${settings.callRecordingEnabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button type="submit" disabled={savingSettings} className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-cyan-500/15 transition-all disabled:opacity-40">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {savingSettings ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

            </div>
          )}
        </main>
      </div>
    </div>
  );
}

