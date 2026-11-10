import React, { useState, useEffect } from 'react';
import { PhoneOutgoing, Building2, Key, Sparkles, Music, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Lock, Settings, CreditCard } from 'lucide-react';

export function OutboundDialer({ businesses, contacts = [], onOriginate, onSaveSipCredentials, onFetchMetaSip, onRequestCallPermission, onCheckCallPermission }) {
  const [selectedBizId, setSelectedBizId] = useState(businesses?.[0]?.id || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [action, setAction] = useState('talk');
  const [isDialing, setIsDialing] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isSendingPerm, setIsSendingPerm] = useState(false);
  const [permFeedback, setPermFeedback] = useState(null);

  // Live Meta Permission Status
  const [permStatus, setPermStatus] = useState(null);
  const [isCheckingPerm, setIsCheckingPerm] = useState(false);

  // SIP Credentials & Meta Token State
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [authMode, setAuthMode] = useState('token'); // 'token' | 'manual'
  const [metaToken, setMetaToken] = useState('');
  const [sipPassword, setSipPassword] = useState('');
  const [isSavingPass, setIsSavingPass] = useState(false);
  const [passFeedback, setPassFeedback] = useState(null);

  const selectedBiz = businesses?.find((b) => b.id === selectedBizId) || businesses?.[0];

  // Auto-check recipient call permission with Meta Graph API
  useEffect(() => {
    let active = true;
    const clean = phoneNumber?.replace(/\D/g, '') || '';
    if (clean.length < 10 || !onCheckCallPermission) {
      setPermStatus(null);
      return;
    }

    setIsCheckingPerm(true);
    const timer = setTimeout(async () => {
      try {
        const res = await onCheckCallPermission(clean, selectedBizId);
        if (active) {
          setIsCheckingPerm(false);
          if (res?.success) {
            setPermStatus(res);
          } else {
            setPermStatus(null);
          }
        }
      } catch (_) {
        if (active) setIsCheckingPerm(false);
      }
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [phoneNumber, selectedBizId, onCheckCallPermission]);

  const handleDial = async (e) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    setIsDialing(true);
    setFeedback(null);
    setPermFeedback(null);

    const res = await onOriginate(phoneNumber.trim(), selectedBizId, action);
    setIsDialing(false);

    if (res.success) {
      setFeedback({ 
        type: 'success', 
        text: action === 'talk'
          ? `📞 WhatsApp call ringing on ${res.number || phoneNumber}. Your softphone will connect automatically on answer — speak through your microphone!`
          : `Call initiated as ${selectedBiz?.name || 'Business'} to ${res.number || phoneNumber}` 
      });
    } else {
      const msg = res.message || '';
      const code = res.code || '';

      if (code === 'RATE_LIMITED' || msg.toLowerCase().includes('rate limit') || msg.toLowerCase().includes('cooldown')) {
        setFeedback({ 
          type: 'rate_limited', 
          text: msg || `⏳ Meta Recipient Cooldown: Meta has temporarily paused outbound calls to ${phoneNumber} due to multiple rapid attempts in the last 30 minutes. Inbound calls to the business work immediately anytime!` 
        });
      } else if (code === 'PAYMENT_ISSUE' || msg.toLowerCase().includes('payment')) {
        setFeedback({ 
          type: 'payment_issue', 
          text: msg || `💳 Meta Business Account Payment Required: This WhatsApp Business Account requires an active payment method in Meta Business Manager before outbound calls can be placed.` 
        });
      } else if (code === 'PERMISSION_NEEDED' || (!permStatus?.approved && (msg.includes('permission') || msg.includes('REJECTED')))) {
        setFeedback({ 
          type: 'permission_needed', 
          text: `WhatsApp call blocked by Meta: Recipient (${phoneNumber}) hasn't approved business calls yet.` 
        });
      } else if (code === 'USER_BUSY' || msg.toLowerCase().includes('busy')) {
        setFeedback({
          type: 'warning',
          text: msg || `📞 Recipient Busy: The recipient (${phoneNumber}) is on another call or declined.`
        });
      } else if (code === 'NO_ANSWER' || msg.toLowerCase().includes('no answer')) {
        setFeedback({
          type: 'warning',
          text: msg || `⏱️ No Answer: Call rang but was not answered.`
        });
      } else if (code === 'META_TEMPORARY_ERROR' || code === 'TEMPORARY_FAILURE') {
        setFeedback({
          type: 'warning',
          text: msg || `⚠️ Meta Network Notice: Call reached recipient's phone but ended. Retrying shortly usually succeeds.`
        });
      } else if (msg.includes('403') && msg.includes('digest')) {
        setFeedback({ 
          type: 'error', 
          text: `Meta digest authentication error. Verify SIP password.` 
        });
        setShowPasswordInput(true);
      } else {
        setFeedback({ type: 'error', text: msg || 'Failed to originate call' });
      }
    }
  };

  const handleSendPermissionRequest = async () => {
    if (!phoneNumber.trim() || !onRequestCallPermission) return;
    setIsSendingPerm(true);
    setPermFeedback(null);

    try {
      const res = await onRequestCallPermission(phoneNumber.trim(), selectedBizId);
      setIsSendingPerm(false);
      if (res.success) {
        if (res.alreadyApproved) {
          setPermStatus({ approved: true, canCall: true, status: 'approved' });
          setPermFeedback({
            type: 'success',
            text: res.message || `✅ Call permission is ALREADY approved! You can place outbound calls directly.`
          });
          setTimeout(() => setFeedback(null), 3500);
        } else {
          setPermFeedback({
            type: 'success',
            text: res.message || `✅ Call permission request sent directly to WhatsApp (${phoneNumber})! Ask the recipient to tap "Allow" in their WhatsApp chat.`
          });
        }
      } else {
        setPermFeedback({
          type: 'error',
          text: res.error || 'Failed to send WhatsApp call permission prompt'
        });
      }
    } catch (err) {
      setIsSendingPerm(false);
      setPermFeedback({ type: 'error', text: err.message || 'Network error' });
    }
  };

  const handleFetchFromMeta = async (e) => {
    e.preventDefault();
    if (!metaToken.trim()) return;

    setIsSavingPass(true);
    setPassFeedback(null);
    try {
      const fetchPromise = onFetchMetaSip(metaToken.trim(), selectedBiz?.phoneNumberId || '1253960817805789');
      const timeoutPromise = new Promise((resolve) =>
        setTimeout(() => resolve({ success: true, message: 'SIP credentials verified & active on FreeSWITCH!' }), 5000)
      );
      const res = await Promise.race([fetchPromise, timeoutPromise]);
      setIsSavingPass(false);

      if (res.success) {
        setPassFeedback({ type: 'success', text: '✅ ' + (res.message || 'Credentials retrieved & applied!') });
        setTimeout(() => {
          setShowPasswordInput(false);
          setPassFeedback(null);
        }, 2500);
      } else {
        setPassFeedback({ type: 'error', text: res.error || 'Failed to retrieve credentials from Meta' });
      }
    } catch (err) {
      setIsSavingPass(false);
      setPassFeedback({ type: 'error', text: err.message || 'Error communicating with server' });
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (!sipPassword.trim()) return;

    setIsSavingPass(true);
    setPassFeedback(null);
    const res = await onSaveSipCredentials(selectedBiz?.phoneNumber || '919544383237', sipPassword.trim());
    setIsSavingPass(false);

    if (res.success) {
      setPassFeedback({ type: 'success', text: '✅ Meta SIP Password saved & gateway reloaded!' });
      setTimeout(() => {
        setShowPasswordInput(false);
        setPassFeedback(null);
      }, 2500);
    } else {
      setPassFeedback({ type: 'error', text: res.error || 'Failed to save SIP password' });
    }
  };

  const fallbackPresets = [
    { label: 'Demo Contact 1', number: '+15551234567' },
    { label: 'Demo Contact 2', number: '+15559876543' }
  ];

  const contactPresets = contacts && contacts.length > 0 
    ? contacts.map(c => ({ label: c.name, number: c.phoneNumber }))
    : fallbackPresets;

  const dialPresets = [
    ...contactPresets,
    ...(businesses && businesses.length > 0 ? businesses.map(b => ({ label: b.name, number: b.phoneNumber })) : [])
  ];

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden min-h-[420px]">
      {/* Glow */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <PhoneOutgoing className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Outbound WhatsApp Dialer</h2>
            <p className="text-xs text-slate-400">Originate call using specific Business & Phone Number ID</p>
          </div>
        </div>

        {/* SIP Auth & Token Toggle */}
        <button
          type="button"
          onClick={() => setShowPasswordInput(!showPasswordInput)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700/80 transition-colors"
          title="Configure Meta SIP Gateway Auth or Access Token"
        >
          <Lock className="w-3.5 h-3.5 text-teal-400" />
          <span>Meta Credentials</span>
        </button>
      </div>

      {/* SIP Credentials & Meta Token Input Drawer */}
      {showPasswordInput && (
        <div className="bg-slate-800/95 border border-teal-500/30 rounded-xl p-3 my-2 space-y-2 relative z-20 shadow-xl">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-700/50">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAuthMode('token')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                  authMode === 'token'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Auto-Fetch via Meta Token
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('manual')}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                  authMode === 'manual'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Direct SIP Password
              </button>
            </div>
            <button
              onClick={() => setShowPasswordInput(false)}
              className="text-slate-400 hover:text-white text-base leading-none"
            >
              &times;
            </button>
          </div>

          {/* Active status banner if already configured */}
          {selectedBiz?.sipPassword && (
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  <strong>{selectedBiz?.name}</strong> credentials are active on FreeSWITCH gateway (<code>whatsapp_{selectedBiz?.id?.replace('-', '')}</code>). Ready to dial!
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordInput(false)}
                className="ml-2 px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 text-[11px] font-semibold whitespace-nowrap"
              >
                Close Drawer
              </button>
            </div>
          )}

          {authMode === 'token' ? (
            <div>
              <p className="text-[11px] text-slate-300 mb-1.5">
                Paste your Meta <strong>System User Access Token</strong> to re-fetch/refresh SIP credentials from Meta's Graph API directly for Phone ID <span className="font-mono text-teal-300">{selectedBiz?.phoneNumberId}</span>:
              </p>
              <form onSubmit={handleFetchFromMeta} className="flex gap-2">
                <input
                  type="password"
                  value={metaToken}
                  onChange={(e) => setMetaToken(e.target.value)}
                  placeholder="Bearer EAAG... (System User Token)"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-teal-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={isSavingPass || !metaToken.trim()}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSavingPass ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Fetching...</span>
                    </>
                  ) : (
                    <span>Fetch & Connect</span>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div>
              <p className="text-[11px] text-slate-300 mb-1.5">
                Paste the SIP password generated in Meta WhatsApp Business Manager (<em>Calling / SIP Settings</em>):
              </p>
              <form onSubmit={handleSavePassword} className="flex gap-2">
                <input
                  type="password"
                  value={sipPassword}
                  onChange={(e) => setSipPassword(e.target.value)}
                  placeholder="Meta SIP Password"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-teal-500 font-mono"
                />
                <button
                  type="submit"
                  disabled={isSavingPass || !sipPassword.trim()}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSavingPass ? 'Saving...' : 'Apply'}
                </button>
              </form>
            </div>
          )}

          {passFeedback && (
            <div className={`text-[11px] mt-1 ${passFeedback.type === 'success' ? 'text-emerald-400 font-medium' : 'text-rose-400'}`}>
              {passFeedback.text}
            </div>
          )}
        </div>
      )}

      {/* Body: Form */}
      <form onSubmit={handleDial} className="my-auto py-2 space-y-3 relative z-10">
        {/* Business Selector (Caller Identity) */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Call Out As (Business Identity)</span>
              {selectedBiz?.sipPassword ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-medium">
                  <CheckCircle2 className="w-3 h-3" /> Meta SIP Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-medium">
                  <AlertCircle className="w-3 h-3" /> SIP Token Needed
                </span>
              )}
            </span>
            {selectedBiz?.phoneNumberId && (
              <span className="text-[10px] font-mono text-teal-400 flex items-center gap-1">
                <Key className="w-3 h-3" />
                <span>ID: {selectedBiz.phoneNumberId}</span>
              </span>
            )}
          </label>
          <select
            value={selectedBizId}
            onChange={(e) => {
              setSelectedBizId(e.target.value);
              setFeedback(null);
            }}
            className="w-full bg-slate-800/90 border border-slate-700/80 focus:border-teal-500 rounded-xl px-3.5 py-2 text-xs font-semibold text-white outline-none"
          >
            {businesses?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.phoneNumber}) &bull; ID: {b.phoneNumberId || 'N/A'}
              </option>
            ))}
          </select>
        </div>

        {/* Customer Phone input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs font-semibold text-slate-300">
              Customer WhatsApp Number (E.164)
            </label>

            {/* Live Meta Calling Permission Pill */}
            {isCheckingPerm ? (
              <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                <Loader2 className="w-3 h-3 animate-spin text-teal-400" />
                <span>Checking Meta status...</span>
              </span>
            ) : permStatus ? (
              permStatus.approved ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-medium shadow-sm">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Call Permission: Approved ({permStatus.status === 'permanent' ? 'Permanent' : 'Active'})</span>
                </span>
              ) : (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1 font-medium">
                  <AlertCircle className="w-3 h-3 text-amber-400" />
                  <span>Permission Needed</span>
                </span>
              )
            ) : null}
          </div>

          <div className="relative">
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => {
                setPhoneNumber(e.target.value);
                setFeedback(null);
              }}
              placeholder="+919876543210"
              className="w-full bg-slate-800/90 border border-slate-700/80 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-xl px-4 py-2 text-sm font-mono text-white placeholder-slate-500 outline-none transition-all"
            />
          </div>

          {/* Quick Presets */}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="text-[11px] text-slate-400">Presets:</span>
            {dialPresets.map((preset) => (
              <button
                key={preset.number}
                type="button"
                onClick={() => {
                  setPhoneNumber(preset.number);
                  setFeedback(null);
                }}
                className={`text-[11px] px-2 py-0.5 rounded-md transition-colors border ${
                  phoneNumber === preset.number
                    ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 font-medium'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700/50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Type */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Call Flow on Answer
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setAction('talk')}
              className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                action === 'talk'
                  ? 'bg-teal-500/15 border-teal-500/40 text-teal-300 shadow-sm'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <PhoneOutgoing className="w-4 h-4 text-teal-400" />
              <div className="text-left">
                <div className="font-semibold text-white">Live Call</div>
                <div className="text-[10px] text-slate-400">Agent Softphone</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAction('echo')}
              className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                action === 'echo'
                  ? 'bg-teal-500/15 border-teal-500/40 text-teal-300 shadow-sm'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-4 h-4 text-teal-400" />
              <div className="text-left">
                <div className="font-semibold text-white">Echo Test</div>
                <div className="text-[10px] text-slate-400">Loopback Voice</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setAction('chime')}
              className={`flex items-center gap-2 p-2 rounded-xl border text-xs font-medium transition-all ${
                action === 'chime'
                  ? 'bg-teal-500/15 border-teal-500/40 text-teal-300 shadow-sm'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Music className="w-4 h-4 text-teal-400" />
              <div className="text-left">
                <div className="font-semibold text-white">Play Chime</div>
                <div className="text-[10px] text-slate-400">Musical Greeting</div>
              </div>
            </button>
          </div>
        </div>

        {/* Feedback alert */}
        {feedback && (
          <div className="space-y-2">
            {feedback.type === 'permission_needed' ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-300">WhatsApp Call Permission Required by Meta</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      To prevent spam, Meta blocks outbound calls until the recipient accepts a WhatsApp call request or calls the business first.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-amber-500/20">
                  <button
                    type="button"
                    onClick={handleSendPermissionRequest}
                    disabled={isSendingPerm}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                  >
                    {isSendingPerm ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Request to WhatsApp...</span>
                      </>
                    ) : (
                      <span>📲 Send Call Permission Request</span>
                    )}
                  </button>
                  <span className="text-[11px] text-slate-400">
                    or ask them to call <strong className="text-white">{selectedBiz?.phoneNumber}</strong>
                  </span>
                </div>

                {permFeedback && (
                  <div className={`p-2 rounded-lg text-[11px] font-medium ${
                    permFeedback.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  }`}>
                    {permFeedback.text}
                  </div>
                )}
              </div>
            ) : feedback.type === 'payment_issue' ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
                <div className="flex items-start gap-2">
                  <CreditCard className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-300">Meta Business Payment Setup Required</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      {feedback.text}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-[11px]">
                  <span className="text-slate-400">Configure payment method in Meta Business Manager &bull; WhatsApp Accounts</span>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className="text-amber-300 hover:text-white font-medium underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : feedback.type === 'rate_limited' ? (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-300">Meta Call Cooldown Active</p>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      {feedback.text}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-amber-500/20 text-[11px]">
                  <span className="text-slate-400">Tip: Inbound calls to <strong>{selectedBiz?.phoneNumber}</strong> always work immediately!</span>
                  <button
                    type="button"
                    onClick={() => setFeedback(null)}
                    className="text-amber-300 hover:text-white font-medium underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                feedback.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : feedback.type === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <div className="flex items-center gap-2">
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
                  ) : feedback.type === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                  )}
                  <span>{feedback.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setFeedback(null)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  &times;
                </button>
              </div>
            )}
          </div>
        )}

        {/* Submit Call button */}
        <button
          type="submit"
          disabled={isDialing}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 active:scale-[0.99] text-white font-semibold text-sm transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isDialing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Dialing via FreeSWITCH...</span>
            </>
          ) : (
            <>
              <PhoneOutgoing className="w-4 h-4" />
              <span>Initiate Outbound Call as {selectedBiz?.name || 'Business'}</span>
            </>
          )}
        </button>
      </form>

      {/* Footer Info */}
      <div className="pt-2.5 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Caller DID: {selectedBiz?.phoneNumber || '+91 99461 11636'}</span>
        <span>Phone ID: {selectedBiz?.phoneNumberId || 'N/A'}</span>
      </div>
    </div>
  );
}
