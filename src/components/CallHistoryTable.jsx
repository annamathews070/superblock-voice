import React, { useState, useRef } from 'react';
import { History, ArrowDownLeft, ArrowUpRight, Clock, Building2, Key, ShieldCheck, Play, Pause, Download } from 'lucide-react';

export function CallHistoryTable({ history }) {
  const [playingUuid, setPlayingUuid] = useState(null);
  const audioRef = useRef(null);

  const togglePlay = (uuid) => {
    if (playingUuid === uuid) {
      audioRef.current?.pause();
      setPlayingUuid(null);
    } else {
      setPlayingUuid(uuid);
      if (audioRef.current) {
        audioRef.current.src = `/api/recordings/${uuid}/stream`;
        audioRef.current.play().catch(() => setPlayingUuid(null));
      }
    }
  };
  const formatTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDuration = (secs) => {
    if (secs == null) return '0s';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl">
      {/* Hidden audio element for history playback */}
      <audio
        ref={audioRef}
        onEnded={() => setPlayingUuid(null)}
        onError={() => setPlayingUuid(null)}
        className="hidden"
      />

      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700/60">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Call Logs & Business Attribution</h2>
            <p className="text-xs text-slate-400">All calls matched to their respective business name and Meta Phone Number ID</p>
          </div>
        </div>
        <span className="text-xs text-slate-400 font-mono">
          {history.length} Call{history.length === 1 ? '' : 's'} Recorded
        </span>
      </div>

      {history.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs">
          No calls recorded in this session yet. Incoming and outgoing calls will automatically log here.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="pb-3 pl-2">Type</th>
                <th className="pb-3">Business Name</th>
                <th className="pb-3">Phone Number ID</th>
                <th className="pb-3">Customer Number</th>
                <th className="pb-3">Time</th>
                <th className="pb-3">Duration</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Hangup Cause</th>
                <th className="pb-3 text-right pr-2">Audio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {history.map((call, idx) => {
                const isInbound = call.direction === 'inbound';
                const biz = call.business;
                return (
                  <tr key={call.uuid || idx} className="hover:bg-slate-800/30 transition-colors">
                    {/* Direction */}
                    <td className="py-3 pl-2">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                        isInbound 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                      }`}>
                        {isInbound ? <ArrowDownLeft className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
                        {isInbound ? 'Inbound' : 'Outbound'}
                      </span>
                    </td>

                    {/* Business Name */}
                    <td className="py-3 font-semibold text-white">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span>{biz?.name || 'Superblock'}</span>
                      </div>
                    </td>

                    {/* Phone Number ID */}
                    <td className="py-3 font-mono text-[11px] text-teal-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60">
                        {biz?.phoneNumberId || 'N/A'}
                      </span>
                    </td>

                    {/* Customer */}
                    <td className="py-3 font-mono text-slate-200">
                      <div>{isInbound ? call.callerNumber : call.destinationNumber}</div>
                      {call.callerName && call.callerName !== 'WhatsApp Caller' && (
                        <div className="text-[10px] text-slate-500 font-sans">{call.callerName}</div>
                      )}
                    </td>

                    {/* Time */}
                    <td className="py-3 text-slate-400">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{formatTime(call.startTime)}</span>
                      </div>
                    </td>

                    {/* Duration */}
                    <td className="py-3 text-slate-300 font-medium">
                      {formatDuration(call.duration)}
                    </td>

                    {/* Status */}
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Completed</span>
                      </span>
                    </td>

                    {/* Hangup Cause */}
                    <td className="py-3 text-slate-500 font-mono text-[11px]">
                      {call.hangupCause || 'NORMAL_CLEARING'}
                    </td>

                    {/* Audio Recording */}
                    <td className="py-3 pr-2 text-right">
                      {call.duration > 0 ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => togglePlay(call.uuid)}
                            className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors ${
                              playingUuid === call.uuid
                                ? 'bg-purple-600 text-white'
                                : 'bg-slate-800 hover:bg-slate-700 text-purple-400 border border-slate-700'
                            }`}
                            title={playingUuid === call.uuid ? 'Pause Audio' : 'Play Audio Recording'}
                          >
                            {playingUuid === call.uuid ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                            <span className="text-[10px] font-semibold">{playingUuid === call.uuid ? 'Playing' : 'Listen'}</span>
                          </button>

                          <a
                            href={`/api/recordings/${call.uuid}/download`}
                            download={`call-${call.uuid}.wav`}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700"
                            title="Download Audio (.wav)"
                          >
                            <Download className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <span className="text-slate-600 text-[10px]">No media</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
