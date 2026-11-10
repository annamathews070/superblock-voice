import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Pause, Download, RefreshCw, Volume2, ArrowDownLeft, ArrowUpRight, Clock, FileAudio, CheckCircle2, FolderOpen } from 'lucide-react';

export function CallRecordingsSection({ contacts = [] }) {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [folderNotice, setFolderNotice] = useState(null);
  const [activeAudioUuid, setActiveAudioUuid] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const audioRef = useRef(null);

  const fetchRecordings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/recordings');
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings || []);
      }
    } catch (err) {
      console.warn('Failed to fetch recordings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecordings();
    const interval = setInterval(fetchRecordings, 15000);
    return () => clearInterval(interval);
  }, []);

  const handlePlayToggle = (rec) => {
    if (activeAudioUuid === rec.uuid) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    } else {
      setActiveAudioUuid(rec.uuid);
      setIsPlaying(true);
      if (audioRef.current) {
        audioRef.current.src = rec.streamUrl;
        audioRef.current.play().catch((e) => console.warn('Play error:', e));
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      setDuration(audioRef.current.duration || 0);
    }
  };

  const handleAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const formatSec = (sec) => {
    if (isNaN(sec) || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatTimestamp = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + 
           ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
  };

  const handleOpenFolder = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/recordings/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFolderNotice(`Opened ${data.path}`);
        setTimeout(() => setFolderNotice(null), 4000);
      }
    } catch (e) {
      console.warn('Failed to open recordings folder:', e);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-6 shadow-xl relative overflow-hidden space-y-5">
      {/* Hidden HTML5 Audio Element for playback */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleAudioEnded}
        onError={() => setIsPlaying(false)}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Mic className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <span>Call Audio Recordings</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
                2-Way Full Audio
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Automatic full-duplex recordings of both Inbound WhatsApp calls and Outbound dialer calls
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenFolder}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 hover:text-white transition-colors border border-purple-500/30 text-xs font-medium shadow-sm"
            title="Open recordings folder on your computer (Windows File Explorer)"
          >
            <FolderOpen className="w-4 h-4 text-purple-400" />
            <span>Open Recordings Folder</span>
          </button>
          <span className="text-xs font-mono text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            {recordings.length} {recordings.length === 1 ? 'Recording' : 'Recordings'}
          </span>
          <button
            type="button"
            onClick={fetchRecordings}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60 disabled:opacity-50"
            title="Refresh Recordings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {folderNotice && (
        <div className="flex items-center gap-2 p-3 bg-purple-950/40 border border-purple-800/60 rounded-xl text-purple-200 text-xs animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
          <span>{folderNotice}</span>
        </div>
      )}

      {/* Table / List */}
      {recordings.length === 0 ? (
        <div className="text-center py-10 border border-dashed border-slate-800 rounded-xl bg-slate-950/30">
          <FileAudio className="w-10 h-10 text-slate-600 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium text-slate-400">No audio recordings found yet</p>
          <p className="text-xs text-slate-600 mt-1 max-w-sm mx-auto">
            When an inbound WhatsApp caller connects or when you place an outbound call, both sides of audio are automatically recorded in HD `.wav`.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 text-slate-400 font-medium">
                <th className="py-2.5 px-3">Direction</th>
                <th className="py-2.5 px-3">Business</th>
                <th className="py-2.5 px-3">Customer / Contact</th>
                <th className="py-2.5 px-3">Time & Size</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3 text-right">Listen / Download</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {recordings.map((rec) => {
                const isSelected = activeAudioUuid === rec.uuid;
                const isInbound = rec.direction === 'inbound';

                const handleOpenFolder = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/recordings/open-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setFolderNotice(`Opened ${data.path}`);
        setTimeout(() => setFolderNotice(null), 4000);
      }
    } catch (e) {
      console.warn('Failed to open recordings folder:', e);
    } finally {
      setSyncing(false);
    }
  };

  return (
                  <tr
                    key={rec.uuid}
                    className={`transition-colors hover:bg-slate-800/40 ${
                      isSelected ? 'bg-purple-950/20 border-l-2 border-purple-500' : ''
                    }`}
                  >
                    {/* Direction */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold border ${
                          isInbound
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}
                      >
                        {isInbound ? (
                          <ArrowDownLeft className="w-3 h-3" />
                        ) : (
                          <ArrowUpRight className="w-3 h-3" />
                        )}
                        <span>{isInbound ? 'Inbound' : 'Outbound'}</span>
                      </span>
                    </td>

                    {/* Business Name */}
                    <td className="py-3 px-3 font-medium text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                        <span>{rec.business?.name || 'WhatsApp Call'}</span>
                      </span>
                    </td>

                    {/* Customer Contact & Number */}
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-200">
                          {rec.customerName || (contacts?.find(c => c.phoneNumber?.replace(/\D/g, '').endsWith(rec.customerNumber?.replace(/\D/g, '')?.slice(-10)))?.name) || 'WhatsApp Contact'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {rec.customerNumber || 'Anonymous'}
                        </span>
                      </div>
                    </td>

                    {/* Time & Size */}
                    <td className="py-3 px-3 text-slate-400">
                      <div className="flex flex-col">
                        <span>{formatTimestamp(rec.timestamp)}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{rec.sizeFormatted}</span>
                      </div>
                    </td>

                    {/* Duration */}
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {rec.duration ? `${rec.duration}s` : 'Full call'}
                    </td>

                    {/* Player Controls & Download */}
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isSelected && (
                          <div className="flex items-center gap-2 mr-2 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-purple-500/30">
                            <span className="text-[10px] font-mono text-purple-300">
                              {formatSec(currentTime)} / {formatSec(duration)}
                            </span>
                            <input
                              type="range"
                              min="0"
                              max={duration || 100}
                              value={currentTime}
                              onChange={handleSeek}
                              className="w-20 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                            />
                          </div>
                        )}

                        {/* Play/Pause Button */}
                        <button
                          type="button"
                          onClick={() => handlePlayToggle(rec)}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            isSelected && isPlaying
                              ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80'
                          }`}
                        >
                          {isSelected && isPlaying ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 text-purple-400" />
                              <span>Play</span>
                            </>
                          )}
                        </button>

                        {/* Download File */}
                        <a
                          href={rec.downloadUrl}
                          download={`call-${rec.uuid}.wav`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border border-slate-700/80"
                          title="Download WAV Recording"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
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

