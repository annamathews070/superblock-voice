import React, { useState, useEffect } from 'react';
import { Phone, PhoneIncoming, PhoneOff, Building2, Key, Radio, Volume2, Shield, Copy, Check, ExternalLink } from 'lucide-react';

function LiveTimer({ startTime }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const update = () => {
      if (startTime) {
        setSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return <span>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>;
}

export function CallMonitor({ activeCalls, onHangup }) {
  const currentCall = activeCalls[0];
  const business = currentCall?.business;
  const [copied, setCopied] = useState(false);

  const handleCopyId = (id) => {
    if (!id) return;
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 flex flex-col justify-between shadow-xl relative overflow-hidden min-h-[420px]">
      {/* Background Glow */}
      <div className="absolute -top-24 -left-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 relative z-10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Live Inbound Call Monitor</h2>
            <p className="text-xs text-slate-400">Real-time Meta Phone Number ID & Business Attribution</p>
          </div>
        </div>

        {currentCall && (
          <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${
            currentCall.state === 'active' 
              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
              : 'bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse'
          }`}>
            {currentCall.state === 'active' ? '● Connected' : '🔔 Incoming Call'}
          </span>
        )}
      </div>

      {/* Body: Active Call Card OR Idle Waiting State */}
      <div className="my-auto py-4 relative z-10">
        {currentCall ? (
          <div className="flex flex-col items-center text-center space-y-4">
            {/* Target Business Identification Banner */}
            <div className="w-full bg-slate-800/90 border border-emerald-500/30 rounded-xl p-3.5 shadow-md text-left space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">
                      Target Business Destination
                    </div>
                    <div className="text-lg font-black text-white">
                      {business?.name || 'The Lady Chef'}
                    </div>
                  </div>
                </div>

                {/* Dialed DID */}
                <div className="text-right">
                  <div className="text-[10px] text-slate-400">Dialed DID</div>
                  <div className="text-xs font-mono font-bold text-emerald-400">
                    {currentCall.destinationNumber || business?.phoneNumber}
                  </div>
                </div>
              </div>

              {/* Unique Meta Identifiers Bar */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/60 text-xs">
                {/* Meta Phone Number ID */}
                <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700/80 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Key className="w-3 h-3 text-teal-400" />
                      <span>Meta Phone Number ID</span>
                    </div>
                    <div className="font-mono text-teal-300 font-bold text-xs truncate max-w-[140px]">
                      {currentCall.metaPhoneNumberId || business?.phoneNumberId || 'N/A'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopyId(currentCall.metaPhoneNumberId || business?.phoneNumberId)}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                    title="Copy Phone Number ID"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Owner Business ID (WABA) */}
                <div className="bg-slate-900/90 px-3 py-1.5 rounded-lg border border-slate-700/80">
                  <div className="text-[10px] text-slate-400">WABA Owner Business ID</div>
                  <div className="font-mono text-slate-200 font-semibold text-xs truncate">
                    {currentCall.metaOwnerBusinessId || business?.wabaId || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Caller Information */}
            <div className="pt-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium mb-1">
                <span>WhatsApp Audio Caller</span>
                <span>&bull;</span>
                <span>Opus 48kHz</span>
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                {currentCall.callerName || 'WhatsApp Caller'}
              </h3>
              <p className="text-sm font-mono text-emerald-400 font-bold mt-0.5">
                {currentCall.callerNumber}
              </p>
            </div>

            {/* Call Duration & Metadata */}
            <div className="flex items-center gap-4 text-xs text-slate-300 bg-slate-800/80 px-4 py-2 rounded-xl border border-slate-700/60">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400">Duration:</span>
                <span className="font-mono font-bold text-white">
                  <LiveTimer startTime={currentCall.answerTime || currentCall.startTime} />
                </span>
              </div>
              <span className="text-slate-600">|</span>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" />
                <span>DTLS-SRTP Active</span>
              </div>
            </div>

            {/* Hangup Action Button */}
            <button
              onClick={() => onHangup(currentCall.uuid)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold text-sm transition-all shadow-lg shadow-rose-600/30 hover:scale-[1.02]"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Disconnect Call</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center space-y-4 py-8">
            <div className="w-16 h-16 rounded-full bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 relative">
              <Phone className="w-7 h-7" />
              <div className="absolute inset-0 rounded-full border border-emerald-500/30 animate-pulse-ring pointer-events-none" />
            </div>
            <div className="max-w-xs">
              <h3 className="text-sm font-semibold text-slate-200">Listening for WhatsApp Inbound Calls</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Call <span className="font-semibold text-emerald-400">+91 99461 11636</span> or any registered business number. The caller details, Business Name, and <span className="text-teal-300 font-semibold">Meta Phone Number ID</span> will display in real time.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Multi-Tenant FreeSWITCH Gateway</span>
        <span>wa.meta.vc (Port 5081 TLS)</span>
      </div>
    </div>
  );
}
