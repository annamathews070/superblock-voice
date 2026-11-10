import React from 'react';
import { Phone, PhoneCall, PhoneIncoming, PhoneOff, Mic, MicOff, Headphones, ShieldCheck, AlertCircle } from 'lucide-react';

export function AgentSoftphoneBar({ softphone, activeCall }) {
  const {
    isRegistered,
    callState,
    isMuted,
    callDuration,
    errorMessage,
    autoAnswer,
    setAutoAnswer,
    answerCall,
    declineCall,
    hangupCall,
    toggleMute
  } = softphone;

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className={`sticky top-[68px] z-40 rounded-2xl border transition-all duration-300 shadow-2xl overflow-hidden backdrop-blur-md ${
      callState === 'ringing'
        ? 'bg-amber-950/95 border-amber-500/80 ring-2 ring-amber-500/50 shadow-amber-500/20'
        : callState === 'connected'
        ? 'bg-emerald-950/95 border-emerald-500/80 ring-2 ring-emerald-500/50 shadow-emerald-500/20'
        : 'bg-slate-900/95 border-slate-800 shadow-slate-950/40'
    } p-4 sm:p-5 mb-6`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Left: Softphone Status / Call Details */}
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg transition-colors ${
            callState === 'ringing'
              ? 'bg-amber-500 text-slate-950 animate-bounce'
              : callState === 'connected'
              ? 'bg-emerald-500 text-white animate-pulse'
              : isRegistered
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-800 text-slate-400'
          }`}>
            {callState === 'ringing' ? (
              <PhoneIncoming className="w-6 h-6" />
            ) : callState === 'connected' ? (
              <Headphones className="w-6 h-6" />
            ) : (
              <Phone className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">Browser WebRTC Softphone</h3>
              <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                isRegistered
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}>
                {isRegistered ? 'Extension 1000 Online' : 'Connecting SIP...'}
              </span>

              <button
                type="button"
                onClick={() => setAutoAnswer(!autoAnswer)}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border transition-all flex items-center gap-1 ${
                  autoAnswer
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
                title="Automatically connects inbound and outbound calls to your laptop speakers & microphone"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${autoAnswer ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span>Auto-Answer: {autoAnswer ? 'ON' : 'OFF'}</span>
              </button>
            </div>

            {callState === 'ringing' ? (
              <p className="text-xs font-semibold text-amber-300 mt-0.5 animate-pulse">
                🔔 Incoming call from {activeCall?.callerNumber || 'WhatsApp User'} &bull; Click "Answer & Talk"
              </p>
            ) : callState === 'connected' ? (
              <p className="text-xs text-emerald-300 font-medium mt-0.5 flex items-center gap-2">
                <span>In-Call with {activeCall?.callerName || activeCall?.callerNumber || 'WhatsApp Caller'}</span>
                <span className="font-mono font-bold bg-emerald-900/60 px-2 py-0.5 rounded text-white">
                  {formatDuration(callDuration)}
                </span>
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-0.5">
                Ready to answer WhatsApp calls live through your laptop microphone & speakers
              </p>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2.5">
          {callState === 'ringing' && (
            <>
              <button
                onClick={declineCall}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all border border-slate-700"
              >
                <PhoneOff className="w-4 h-4 text-rose-400" />
                <span>Decline</span>
              </button>
              <button
                onClick={answerCall}
                className="flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-slate-950 font-bold text-xs transition-all shadow-lg shadow-emerald-500/30 animate-bounce"
              >
                <PhoneCall className="w-4 h-4" />
                <span>Answer & Talk</span>
              </button>
            </>
          )}

          {callState === 'connected' && (
            <>
              <button
                onClick={toggleMute}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${
                  isMuted 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                    : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                }`}
              >
                {isMuted ? <MicOff className="w-4 h-4 text-amber-400" /> : <Mic className="w-4 h-4 text-emerald-400" />}
                <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
              </button>

              <button
                onClick={hangupCall}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-xs font-bold transition-all shadow-lg shadow-rose-600/30"
              >
                <PhoneOff className="w-4 h-4" />
                <span>Hang Up</span>
              </button>
            </>
          )}

          {callState === 'idle' && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-700/50">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Full-Duplex WebRTC Audio Ready</span>
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mt-3 p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

