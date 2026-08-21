"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/apiClient';

export default function Workstation() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Queue & Leads State
  const [leads, setLeads] = useState([]);
  const [categories, setCategories] = useState({
    overdue: [], dueToday: [], replies: [], interested: [], newLeads: []
  });
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadHistory, setLeadHistory] = useState([]);
  const [fetchingLead, setFetchingLead] = useState(false);

  // Softphone & Twilio State
  const [deviceReady, setDeviceReady] = useState(false);
  const [callStatus, setCallStatus] = useState('offline'); // offline, ready, ringing, active, muted
  const [isMuted, setIsMuted] = useState(false);
  const [activeConnection, setActiveConnection] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callSid, setCallSid] = useState('');
  
  // Dialer / Communications Forms
  const [smsText, setSmsText] = useState('');
  const [whatsappText, setWhatsappText] = useState('');
  const [whatsappTemplates, setWhatsappTemplates] = useState([]);
  const [selectedWaTemplate, setSelectedWaTemplate] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [inboxes, setInboxes] = useState([]);
  const [selectedInboxId, setSelectedInboxId] = useState('');

  // Outcome / Lock Form
  const [outcome, setOutcome] = useState('new');
  const [notes, setNotes] = useState('');
  const [callbackDate, setCallbackDate] = useState('');
  const [bookingCloser, setBookingCloser] = useState('');
  const [bookingLink, setBookingLink] = useState('');
  const [bookingDate, setBookingDate] = useState('');
  const [bookingTimezone, setBookingTimezone] = useState('UTC');
  const [closersList, setClosersList] = useState([]);
  const [submittingOutcome, setSubmittingOutcome] = useState(false);
  const [outcomeError, setOutcomeError] = useState('');

  // Session stats & Break State
  const [stats, setStats] = useState({ activeTimeSeconds: 0, dialingTimeSeconds: 0, breakTimeSeconds: 0, isOnBreak: false });
  const [alerts, setAlerts] = useState([]);

  // Refs & Timers
  const callTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const deviceRef = useRef(null);

  // Initialize
  useEffect(() => {
    const localUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    
    if (!localUser || !token) {
      router.push('/login');
      return;
    }
    
    const parsedUser = JSON.parse(localUser);
    setUser(parsedUser);
    
    // Initial fetches
    fetchQueue();
    fetchStats();
    fetchAlerts();
    fetchWhatsAppTemplates();
    fetchInboxes();
    fetchClosers();

    // Setup heartbeat (10s)
    heartbeatTimerRef.current = setInterval(sendHeartbeat, 10000);

    // Load Twilio script & initialize
    loadTwilioScript().then(success => {
      if (success) initializeTwilioDevice();
    });

    return () => {
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      // Clean up connection
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
    };
  }, []);

  // Sync timers
  useEffect(() => {
    if (callStatus === 'active') {
      durationTimerRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationTimerRef.current) clearInterval(durationTimerRef.current);
      setCallDuration(0);
    }
  }, [callStatus]);

  // Load Twilio SDK
  const loadTwilioScript = () => {
    return new Promise((resolve) => {
      if (window.Twilio) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://sdk.twilio.com/js/client/releases/1.13.0/twilio.min.js';
      script.async = true;
      script.onload = () => resolve(true);
      document.body.appendChild(script);
    });
  };

  // Initialize Twilio Device
  const initializeTwilioDevice = async () => {
    try {
      const res = await apiRequest('/api/calls/token');
      if (!res.success || !res.token) return;

      const device = new window.Twilio.Device(res.token, {
        codecPreferences: ['opus', 'pcmu'],
        fakeLocalAudioSink: true,
        enableIceRestart: true
      });

      device.on('ready', () => {
        setDeviceReady(true);
        setCallStatus('ready');
      });

      device.on('connect', (conn) => {
        setActiveConnection(conn);
        setCallStatus('active');
        // Extract Twilio Call Sid
        setCallSid(conn.parameters.CallSid || '');
      });

      device.on('disconnect', () => {
        // Log dialing seconds
        if (callDuration > 0) {
          apiRequest('/api/session/dialing', 'POST', { seconds: callDuration }).then(fetchStats);
        }
        setActiveConnection(null);
        setCallStatus('ready');
        setIsMuted(false);
      });

      device.on('error', (err) => {
        console.error('Twilio Device Error:', err);
        setCallStatus('ready');
      });

      deviceRef.current = device;
    } catch (e) {
      console.error('Could not initialize Twilio device:', e.message);
    }
  };

  // Heartbeat & Sync stats
  const sendHeartbeat = async () => {
    try {
      const res = await apiRequest('/api/session/heartbeat', 'POST');
      if (res.success) {
        setStats(prev => ({
          ...prev,
          isOnBreak: res.isOnBreak,
          activeTimeSeconds: res.activeTimeSeconds
        }));
      }
      fetchAlerts();
    } catch (e) {
      console.warn('Heartbeat update failed');
    }
  };

  const fetchStats = async () => {
    try {
      const res = await apiRequest('/api/session/stats');
      if (res.success) setStats(res.data);
    } catch (e) {}
  };

  const fetchAlerts = async () => {
    try {
      const res = await apiRequest('/api/manager/alerts');
      if (res.success) setAlerts(res.data);
    } catch (e) {}
  };

  const fetchWhatsAppTemplates = async () => {
    try {
      // Seeded fallback templates
      setWhatsAppTemplates([
        { _id: 'wa-tpl-intro', name: 'Quick Intro & Availability', body: 'Hi {{first_name}}, this is {{sender_name}} regarding {{company}}. Wanted to see if you have a quick minute this week to connect? Here is my calendar if easier: {{booking_link}}' },
        { _id: 'wa-tpl-followup', name: 'Call Follow-up & Booking Link', body: 'Hi {{first_name}}, tried giving you a quick call earlier. Whenever you have 5 minutes, feel free to pick a time that works best for you here: {{booking_link}}' }
      ]);
    } catch (e) {}
  };

  const fetchInboxes = async () => {
    try {
      const res = await apiRequest('/api/emails'); // Can fetch inboxes
      setInboxes([
        { _id: 'default', name: 'System Default SendGrid', fromEmail: 'outbound@8020dialer.com', fromName: '80/20 Outbound' }
      ]);
    } catch (e) {}
  };

  const fetchClosers = async () => {
    try {
      const res = await apiRequest('/api/auth/register'); // Get user lists
      setClosersList([
        { _id: '1', name: 'Closer Sarah' },
        { _id: '2', name: 'Closer Alex' }
      ]);
    } catch (e) {}
  };

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/leads/queue');
      if (res.success) {
        setLeads(res.data.sortedList);
        setCategories(res.data.categories);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Lead selection & Lock acquisition
  const handleSelectLead = async (lead) => {
    if (stats.isOnBreak) {
      alert('Please end your break before contacting leads.');
      return;
    }
    
    setFetchingLead(true);
    setOutcomeError('');
    setNotes('');
    setOutcome('new');
    setCallbackDate('');
    
    try {
      // Acquires lock via API
      const res = await apiRequest(`/api/leads/${lead._id}`);
      if (res.success) {
        setSelectedLead(res.data);
        
        // Fetch timeline logs
        const historyRes = await apiRequest(`/api/manager/activity?limit=20`);
        if (historyRes.success) {
          const leadLogs = historyRes.data.filter(l => l.leadId === lead._id);
          setLeadHistory(leadLogs);
        }
      }
    } catch (e) {
      alert(e.message || 'This lead is currently locked or worked by another agent.');
    } finally {
      setFetchingLead(false);
    }
  };

  // Outbound Dialing
  const startCall = async () => {
    if (!selectedLead || !selectedLead.contact?.phone) return;
    if (callStatus !== 'ready') return;

    setCallStatus('ringing');
    try {
      // Place outbound call request
      const res = await apiRequest('/api/calls', 'POST', {
        to: selectedLead.contact.phone,
        leadId: selectedLead._id
      });
      
      if (res.success && deviceRef.current) {
        // Start device call
        const conn = deviceRef.current.connect({ To: selectedLead.contact.phone });
        setActiveConnection(conn);
        setCallSid(res.data.callSid);
      } else {
        throw new Error('Calling failed.');
      }
    } catch (e) {
      alert(e.message || 'Outbound call failed. Please check Allowed Calling Hours constraints.');
      setCallStatus('ready');
    }
  };

  const endCall = () => {
    if (deviceRef.current) {
      deviceRef.current.disconnectAll();
    }
  };

  const toggleMute = () => {
    if (activeConnection) {
      const nextMute = !isMuted;
      activeConnection.mute(nextMute);
      setIsMuted(nextMute);
      setCallStatus(nextMute ? 'muted' : 'active');
    }
  };

  // Outbound SMS
  const sendSms = async (e) => {
    e.preventDefault();
    if (!selectedLead || !smsText.trim()) return;
    setSendingMessage(true);
    setMessageError('');

    try {
      const res = await apiRequest('/api/messages', 'POST', {
        to: selectedLead.contact.phone,
        body: smsText,
        leadId: selectedLead._id
      });
      if (res.success) {
        setSmsText('');
        // Refresh history
        handleSelectLead(selectedLead);
      }
    } catch (err) {
      setMessageError(err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Outbound WhatsApp
  const sendWhatsApp = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;
    setSendingMessage(true);
    setMessageError('');

    try {
      const payload = {
        to: selectedLead.contact.phone,
        leadId: selectedLead._id
      };
      if (selectedWaTemplate) {
        payload.templateId = selectedWaTemplate;
      } else {
        payload.body = whatsappText;
      }

      const res = await apiRequest('/api/messages/whatsapp', 'POST', payload);
      if (res.success) {
        setWhatsappText('');
        setSelectedWaTemplate('');
        handleSelectLead(selectedLead);
      }
    } catch (err) {
      setMessageError(err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Outbound Email
  const sendOutboundEmail = async (e) => {
    e.preventDefault();
    if (!selectedLead || !emailSubject.trim() || !emailBody.trim()) return;
    setSendingMessage(true);
    setMessageError('');

    try {
      const res = await apiRequest('/api/emails', 'POST', {
        leadId: selectedLead._id,
        subject: emailSubject,
        body: emailBody,
        inboxId: selectedInboxId || null
      });
      if (res.success) {
        setEmailSubject('');
        setEmailBody('');
        handleSelectLead(selectedLead);
      }
    } catch (err) {
      setMessageError(err.message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Submit Call Outcome & release lock
  const handleSubmitOutcome = async (e) => {
    e.preventDefault();
    if (!selectedLead) return;
    
    setSubmittingOutcome(true);
    setOutcomeError('');

    try {
      const payload = {
        outcome,
        notes,
        duration: callDuration,
        callSid
      };

      if (outcome === 'callback') {
        payload.callbackDate = callbackDate;
      }

      if (outcome === 'meeting-booked') {
        payload.booking = {
          meetingDate: bookingDate,
          meetingTimezone: bookingTimezone,
          closer: bookingCloser,
          meetingLink: bookingLink
        };
      }

      const res = await apiRequest(`/api/leads/${selectedLead._id}/work`, 'POST', payload);
      if (res.success) {
        // Clear workspace
        setSelectedLead(null);
        setLeadHistory([]);
        fetchQueue();
        fetchStats();
      }
    } catch (err) {
      setOutcomeError(err.message || 'Failed to submit call outcome.');
    } finally {
      setSubmittingOutcome(false);
    }
  };

  // Break toggler
  const handleToggleBreak = async () => {
    if (selectedLead) {
      alert('Please submit call outcome and release lead lock before going on break.');
      return;
    }
    try {
      const res = await apiRequest('/api/session/break/toggle', 'POST');
      if (res.success) {
        setStats(prev => ({
          ...prev,
          isOnBreak: res.data.isOnBreak,
          breakTimeSeconds: res.data.breakTimeSeconds
        }));
      }
    } catch (e) {}
  };

  // Format seconds -> HH:MM:SS
  const formatTime = (totalSecs) => {
    const hrs = Math.floor(totalSecs / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSecs % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-950 font-sans min-h-screen text-slate-100">
      
      {/* Top Navbar */}
      <header className="bg-slate-900/60 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center shadow-md shadow-cyan-500/20">
            <span className="font-extrabold text-white text-lg">80</span>
          </div>
          <div>
            <h2 className="font-bold text-slate-100 leading-none">Workstation</h2>
            <span className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase">sales workspace</span>
          </div>
        </div>

        {/* Softphone Banner */}
        <div className="hidden md:flex items-center gap-4 bg-slate-950/80 border border-slate-800 rounded-full px-5 py-2">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${
              callStatus === 'active' ? 'bg-emerald-500 animate-pulse' :
              callStatus === 'ready' ? 'bg-cyan-500' : 'bg-red-500'
            }`}></span>
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {callStatus === 'active' ? `In Call (${formatTime(callDuration)})` : `Softphone: ${callStatus}`}
            </span>
          </div>
          
          {callStatus === 'active' && (
            <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
              <button 
                onClick={toggleMute} 
                className={`p-1.5 rounded-lg text-xs font-semibold ${isMuted ? 'bg-red-500/20 text-red-400' : 'hover:bg-slate-800 text-slate-400'}`}
              >
                🎙️ {isMuted ? 'Muted' : 'Mute'}
              </button>
              <button 
                onClick={endCall} 
                className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md shadow-red-500/20 transition-all duration-300"
              >
                🔴 End Call
              </button>
            </div>
          )}
        </div>

        {/* User profile & break controls */}
        <div className="flex items-center gap-4">
          <button 
            onClick={handleToggleBreak}
            className={`px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 ${
              stats.isOnBreak 
                ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md shadow-amber-500/20' 
                : 'border border-slate-800 hover:border-slate-700 text-slate-300'
            }`}
          >
            ☕ {stats.isOnBreak ? 'On Break' : 'Start Break'}
          </button>
          
          <div className="text-right hidden sm:block">
            <div className="text-xs font-bold">{user?.name || 'Loading...'}</div>
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

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 gap-6 p-6 overflow-hidden">
        
        {/* Left Side: Stats and Lead Queue (3 columns) */}
        <aside className="xl:col-span-3 flex flex-col gap-6">
          
          {/* Stats card */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 shadow-xl">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Workspace Daily Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-950/50 rounded-2xl p-3 border border-slate-850">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Active Work</span>
                <div className="text-sm font-bold text-cyan-400 mt-1">{formatTime(stats.activeTimeSeconds)}</div>
              </div>
              <div className="bg-slate-950/50 rounded-2xl p-3 border border-slate-850">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Dialing Time</span>
                <div className="text-sm font-bold text-indigo-400 mt-1">{formatTime(stats.dialingTimeSeconds)}</div>
              </div>
              <div className="bg-slate-950/50 rounded-2xl p-3 border border-slate-850">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Break Time</span>
                <div className="text-sm font-bold text-amber-400 mt-1">{formatTime(stats.breakTimeSeconds)}</div>
              </div>
              <div className="bg-slate-950/50 rounded-2xl p-3 border border-slate-850">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Targets Info</span>
                <div className="text-sm font-bold text-emerald-400 mt-1">Lead limits</div>
              </div>
            </div>
          </div>

          {/* Alerts Feed */}
          {alerts.length > 0 && (
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 shadow-xl max-h-48 overflow-y-auto">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
                <span>System Warnings</span>
                <span className="bg-red-500/10 text-red-400 text-[10px] px-2 py-0.5 rounded-full font-bold">{alerts.length}</span>
              </h3>
              <div className="space-y-2">
                {alerts.map((al, idx) => (
                  <div key={idx} className="flex gap-2 items-start text-xs bg-slate-950/40 p-2.5 rounded-xl border border-slate-850">
                    <span className="mt-0.5">{al.type === 'error' ? '🔴' : al.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                    <span className="text-slate-300 leading-normal">{al.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dialer Queue */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-5 flex-1 flex flex-col min-h-[350px] shadow-xl overflow-hidden">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center justify-between">
              <span>Contact Queue</span>
              <span className="bg-cyan-500/15 text-cyan-400 text-xs px-2 py-0.5 rounded-full font-bold">{leads.length} leads</span>
            </h3>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : leads.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center text-slate-500 text-center p-6 border-2 border-dashed border-slate-800/40 rounded-2xl">
                <span className="text-2xl mb-2">🎉</span>
                <p className="text-sm font-semibold">Outbound list cleared!</p>
                <p className="text-[10px] text-slate-600 mt-1">Enjoy the rest of the afternoon.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {leads.map((l) => (
                  <div 
                    key={l._id} 
                    onClick={() => handleSelectLead(l)}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition-all duration-300 hover:translate-x-1 ${
                      selectedLead?._id === l._id 
                        ? 'bg-gradient-to-r from-cyan-950/60 to-indigo-950/60 border-cyan-500/50 shadow-md shadow-cyan-950/20' 
                        : 'bg-slate-950/40 border-slate-850 hover:bg-slate-900/40'
                    } ${l.outOfHours ? 'opacity-40 border-dashed' : ''}`}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div className="font-bold text-xs truncate max-w-[130px]">{l.contact?.name}</div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        l.status === 'callback' ? 'bg-amber-500/10 text-amber-400' :
                        l.status === 'interested' ? 'bg-emerald-500/10 text-emerald-400' :
                        l.status === 'new' ? 'bg-cyan-500/10 text-cyan-400' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {l.status}
                      </span>
                    </div>
                    
                    <div className="text-[10px] text-slate-400 truncate mt-1">{l.company?.name || 'No Company'}</div>
                    
                    <div className="flex justify-between items-center mt-2.5">
                      <span className="text-[9px] text-slate-500">{l.geography?.city || l.geography?.timezone || 'UTC'}</span>
                      {l.outOfHours ? (
                        <span className="text-[9px] text-amber-500 font-bold">⛔ Out of Hours</span>
                      ) : (
                        <span className="text-[9px] text-slate-500 font-semibold">{l.contact?.phone}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Center: Selected Lead Workspace (6 columns) */}
        <main className="xl:col-span-6 flex flex-col gap-6">
          {fetchingLead ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 flex-1 flex flex-col items-center justify-center shadow-xl">
              <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-slate-400 text-sm">Locking lead timeline profile...</p>
            </div>
          ) : !selectedLead ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-8 flex-1 flex flex-col items-center justify-center text-center shadow-xl border-dashed">
              <div className="w-20 h-20 rounded-full bg-slate-950/60 border border-slate-800 flex items-center justify-center mb-6 text-3xl">🎯</div>
              <h2 className="text-xl font-bold">Sales Dialer Ready</h2>
              <p className="text-slate-400 text-sm max-w-sm mt-2">
                Click any lead in your priority queue on the left side to acquire its lock, load their details, and initiate outbound dials.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6 overflow-hidden">
              
              {/* Profile details header */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-cyan-500/10 to-transparent rounded-bl-full pointer-events-none"></div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-white">{selectedLead.contact?.name}</h2>
                    <p className="text-slate-400 text-sm mt-1">{selectedLead.contact?.position || 'Sales Prospect'} at <span className="text-cyan-400 font-bold">{selectedLead.company?.name || 'Company Name'}</span></p>
                  </div>
                  
                  {/* Phone trigger dial button */}
                  <div className="flex items-center gap-3">
                    {selectedLead.outOfHours && (
                      <span className="text-xs text-amber-500 font-bold bg-amber-500/10 px-3 py-1.5 rounded-xl border border-amber-500/20">
                        ⚠️ Outside Hours limit
                      </span>
                    )}
                    <button
                      onClick={startCall}
                      disabled={callStatus !== 'ready' || selectedLead.outOfHours}
                      className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-6 py-3 rounded-2xl shadow-lg shadow-cyan-500/20 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 transform hover:-translate-y-0.5 active:translate-y-0"
                    >
                      ☎️ Call Browser Phone
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/40">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Phone</span>
                    <div className="text-xs font-bold mt-0.5 truncate">{selectedLead.contact?.phone || 'None'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Email</span>
                    <div className="text-xs font-bold mt-0.5 truncate">{selectedLead.contact?.email || 'None'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Timezone / Location</span>
                    <div className="text-xs font-bold mt-0.5 truncate">{selectedLead.geography?.city || 'City'}, {selectedLead.geography?.timezone || 'UTC'}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-semibold">Lead Priority</span>
                    <div className="text-xs font-bold mt-0.5 text-cyan-400">Rank #{selectedLead.assignment?.priority || 0}</div>
                  </div>
                </div>
              </div>

              {/* Messaging Communications Tabs */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl flex-1 flex flex-col overflow-hidden">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">Send Drip / Outreach Messages</h3>
                {messageError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium">
                    ⚠️ {messageError}
                  </div>
                )}

                {/* Tabs */}
                <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto custom-scrollbar">
                  
                  {/* SMS Panel */}
                  <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex flex-col justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-850 pb-2 mb-3">💬 Send SMS Text</h4>
                      <textarea
                        rows={5}
                        value={smsText}
                        onChange={(e) => setSmsText(e.target.value)}
                        placeholder="Write standard SMS message..."
                        className="w-full text-xs bg-slate-900/80 border border-slate-800 focus:border-cyan-500/30 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none transition-all resize-none"
                      />
                    </div>
                    <button
                      onClick={sendSms}
                      disabled={sendingMessage || !smsText.trim()}
                      className="w-full py-2.5 mt-3 bg-slate-900 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 text-xs font-bold rounded-xl border border-cyan-500/20 shadow-md shadow-cyan-950/10 transition-all duration-300 disabled:opacity-40"
                    >
                      {sendingMessage ? 'Sending...' : 'Send SMS'}
                    </button>
                  </div>

                  {/* WhatsApp Template Panel */}
                  <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex flex-col justify-between">
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-850 pb-2 mb-1">🟢 WhatsApp Templates</h4>
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold mb-1 block">Choose Preset Template</label>
                        <select
                          value={selectedWaTemplate}
                          onChange={(e) => {
                            setSelectedWaTemplate(e.target.value);
                            const t = whatsappTemplates.find(tpl => tpl._id === e.target.value);
                            setWhatsappText(t ? t.body : '');
                          }}
                          className="w-full text-xs bg-slate-900/80 border border-slate-800 rounded-xl p-2 text-slate-100 focus:outline-none cursor-pointer"
                        >
                          <option value="">Custom WhatsApp Text</option>
                          {whatsappTemplates.map(tpl => (
                            <option key={tpl._id} value={tpl._id}>{tpl.name}</option>
                          ))}
                        </select>
                      </div>
                      <textarea
                        rows={3}
                        value={whatsappText}
                        onChange={(e) => setWhatsappText(e.target.value)}
                        placeholder="Customize WhatsApp details..."
                        className="w-full text-xs bg-slate-900/80 border border-slate-800 focus:border-cyan-500/30 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none transition-all resize-none"
                      />
                    </div>
                    <button
                      onClick={sendWhatsApp}
                      disabled={sendingMessage || (!whatsappText.trim() && !selectedWaTemplate)}
                      className="w-full py-2.5 mt-3 bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 text-xs font-bold rounded-xl border border-emerald-500/20 shadow-md shadow-emerald-950/10 transition-all duration-300 disabled:opacity-40"
                    >
                      {sendingMessage ? 'Sending...' : 'Send WhatsApp'}
                    </button>
                  </div>

                  {/* SendGrid Email identity Panel */}
                  <div className="bg-slate-950/40 border border-slate-850 rounded-2xl p-4 flex flex-col justify-between">
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-850 pb-2 mb-1">✉️ Send Email</h4>
                      <div>
                        <select
                          value={selectedInboxId}
                          onChange={(e) => setSelectedInboxId(e.target.value)}
                          className="w-full text-[10px] bg-slate-900/80 border border-slate-800 rounded-lg p-1.5 text-slate-100 focus:outline-none cursor-pointer"
                        >
                          {inboxes.map(ib => (
                            <option key={ib._id} value={ib._id}>{ib.fromName} ({ib.fromEmail})</option>
                          ))}
                        </select>
                      </div>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Subject..."
                        className="w-full text-xs bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 placeholder-slate-600 focus:outline-none"
                      />
                      <textarea
                        rows={2}
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        placeholder="Write email HTML or text..."
                        className="w-full text-xs bg-slate-900/80 border border-slate-800 focus:border-cyan-500/30 rounded-xl p-3 text-slate-100 placeholder-slate-600 focus:outline-none transition-all resize-none"
                      />
                    </div>
                    <button
                      onClick={sendOutboundEmail}
                      disabled={sendingMessage || !emailSubject.trim() || !emailBody.trim()}
                      className="w-full py-2.5 mt-3 bg-slate-900 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/20 shadow-md shadow-indigo-950/10 transition-all duration-300 disabled:opacity-40"
                    >
                      {sendingMessage ? 'Sending...' : 'Send Email'}
                    </button>
                  </div>

                </div>
              </div>

              {/* Timeline list logs */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl max-h-56 overflow-y-auto">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Timeline logs ({leadHistory.length})</h3>
                {leadHistory.length === 0 ? (
                  <div className="text-xs text-slate-500 py-3">No activity logs recorded. First dial now.</div>
                ) : (
                  <div className="space-y-3">
                    {leadHistory.map((h, i) => (
                      <div key={i} className="flex items-start gap-3 bg-slate-950/40 border border-slate-850/60 p-3 rounded-2xl text-xs">
                        <span className="text-sm">
                          {h.action === 'call' ? '☎️' : h.action === 'email' ? '✉️' : h.action === 'sms' ? '💬' : '📝'}
                        </span>
                        <div className="flex-1">
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-300 capitalize">{h.action} Outcome: {h.outcome || 'note'}</span>
                            <span className="text-[10px] text-slate-500">{new Date(h.timestamp).toLocaleString()}</span>
                          </div>
                          {h.notes && <p className="text-slate-400 mt-1 italic">"{h.notes}"</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </main>

        {/* Right Side: Call Outcomes Panel (3 columns) */}
        <aside className="xl:col-span-3">
          <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-xl h-full flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 pb-3 mb-5">Log Call Outcome</h3>
              
              {!selectedLead ? (
                <p className="text-xs text-slate-500 text-center py-12">No active lead locked. Select a lead first.</p>
              ) : (
                <form onSubmit={handleSubmitOutcome} className="space-y-5">
                  {outcomeError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-medium">
                      ⚠️ {outcomeError}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Outcome Status</label>
                    <select
                      value={outcome}
                      onChange={(e) => setOutcome(e.target.value)}
                      className="w-full text-xs bg-slate-950/80 border border-slate-850 focus:border-cyan-500/50 rounded-2xl px-4 py-3 text-slate-100 focus:outline-none"
                    >
                      <option value="new">Select Outcome...</option>
                      <option value="no-answer">🔇 No Answer (auto retry)</option>
                      <option value="busy">📴 Busy (auto retry)</option>
                      <option value="voicemail">📟 Voicemail (auto retry)</option>
                      <option value="callback">📅 Schedule Callback</option>
                      <option value="interested">🙋 Interested</option>
                      <option value="meeting-booked">🤝 Meeting Booked</option>
                      <option value="not-interested">🙅 Not Interested</option>
                      <option value="wrong-number">❌ Wrong Number</option>
                      <option value="dnc">⛔ Do Not Call (DNC)</option>
                    </select>
                  </div>

                  {/* Scheduled Callback Input */}
                  {outcome === 'callback' && (
                    <div>
                      <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Callback Date & Time</label>
                      <input
                        type="datetime-local"
                        required
                        value={callbackDate}
                        onChange={(e) => setCallbackDate(e.target.value)}
                        className="w-full text-xs bg-slate-950/80 border border-slate-850 focus:border-cyan-500/50 rounded-2xl px-4 py-3 text-slate-100 focus:outline-none"
                      />
                    </div>
                  )}

                  {/* Meeting Booked Inputs */}
                  {outcome === 'meeting-booked' && (
                    <div className="space-y-4 bg-slate-950/40 p-4 border border-slate-850 rounded-2xl">
                      <h4 className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">Handoff Details</h4>
                      
                      <div>
                        <label className="block text-[9px] text-slate-400 font-semibold mb-1">Closer</label>
                        <select
                          value={bookingCloser}
                          onChange={(e) => setBookingCloser(e.target.value)}
                          className="w-full text-xs bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-100"
                        >
                          <option value="">Select Closer...</option>
                          {closersList.map(c => (
                            <option key={c._id} value={c.name}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-semibold mb-1">Meeting Date & Time</label>
                        <input
                          type="datetime-local"
                          required
                          value={bookingDate}
                          onChange={(e) => setBookingDate(e.target.value)}
                          className="w-full text-xs bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-100 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-semibold mb-1">Meeting Timezone</label>
                        <select
                          value={bookingTimezone}
                          onChange={(e) => setBookingTimezone(e.target.value)}
                          className="w-full text-xs bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-100 focus:outline-none"
                        >
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">EST / New York</option>
                          <option value="America/Chicago">CST / Chicago</option>
                          <option value="America/Denver">MST / Denver</option>
                          <option value="America/Los_Angeles">PST / Los Angeles</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[9px] text-slate-400 font-semibold mb-1">Calendar / Meeting Link</label>
                        <input
                          type="url"
                          value={bookingLink}
                          onChange={(e) => setBookingLink(e.target.value)}
                          placeholder="https://zoom.us/j/..."
                          className="w-full text-xs bg-slate-900 border border-slate-800 rounded-xl p-2 text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Outcome Notes / Call summary</label>
                    <textarea
                      rows={6}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add summary details of call outcome here..."
                      className="w-full text-xs bg-slate-950/80 border border-slate-850 focus:border-cyan-500/50 rounded-2xl px-4 py-3 text-slate-100 placeholder-slate-600 focus:outline-none resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingOutcome || outcome === 'new'}
                    className="w-full py-4 px-4 bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-semibold rounded-2xl shadow-lg shadow-cyan-500/20 focus:outline-none transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submittingOutcome ? 'Saving Log...' : 'Release & Save Lead'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
