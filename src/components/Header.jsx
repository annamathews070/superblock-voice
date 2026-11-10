import React from 'react';
import { PhoneCall, Building2, Radio, Server } from 'lucide-react';

export function Header({ engineStatus, connected, activeCount, businessCount, onOpenBusinesses }) {
  return (
    <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <PhoneCall className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">Superblock Voice</h1>
              <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Multi-Tenant
              </span>
            </div>
            <p className="text-xs text-slate-400">
              The Lady Chef &bull; Zangos &bull; Hodor &bull; Spexo &bull; Superblock
            </p>
          </div>
        </div>

        {/* System & Telephony Stats */}
        <div className="flex items-center gap-3 text-xs">
          {/* Business Manager Button */}
          <button
            onClick={onOpenBusinesses}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="Manage Businesses and Phone Number IDs"
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium">Businesses</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
              {businessCount || 5}
            </span>
          </button>

          {/* Active Calls Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <Radio className={`w-3.5 h-3.5 ${activeCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
            <span className="text-slate-300 font-medium">Active:</span>
            <span className={`font-bold ${activeCount > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
              {activeCount}
            </span>
          </div>

          {/* Engine Status Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60">
            <span className="relative flex h-2.5 w-2.5">
              {engineStatus.online && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${engineStatus.online ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
            </span>
            <span className="text-slate-300">
              {engineStatus.online ? 'FreeSWITCH Online' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
