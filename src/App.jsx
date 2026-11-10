import React, { useState } from 'react';
import { useVoiceEngine } from './hooks/useVoiceEngine';
import { useWebRtcSoftphone } from './hooks/useWebRtcSoftphone';
import { Header } from './components/Header';
import { AgentSoftphoneBar } from './components/AgentSoftphoneBar';
import { CallMonitor } from './components/CallMonitor';
import { OutboundDialer } from './components/OutboundDialer';
import { CallHistoryTable } from './components/CallHistoryTable';
import { CallRecordingsSection } from './components/CallRecordingsSection';
import { BusinessManagerModal } from './components/BusinessManagerModal';

export default function App() {
  const {
    engineStatus,
    activeCalls,
    callHistory,
    businesses,
    contacts,
    connected,
    originateCall,
    hangupCall,
    saveBusinesses,
    saveSipCredentials,
    fetchMetaSipCredentials,
    requestCallPermission,
    checkCallPermission
  } = useVoiceEngine();

  const softphone = useWebRtcSoftphone();
  const [isBusinessModalOpen, setIsBusinessModalOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Navbar */}
      <Header
        engineStatus={engineStatus}
        connected={connected}
        activeCount={activeCalls.length}
        businessCount={businesses.length}
        onOpenBusinesses={() => setIsBusinessModalOpen(true)}
      />

      {/* Main Dashboard Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Real-Time Agent WebRTC Softphone Bar */}
        <AgentSoftphoneBar
          softphone={softphone}
          activeCall={activeCalls[0]}
        />

        {/* Top 2 Columns: Live Inbound Monitor & Outbound Dialer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CallMonitor
            activeCalls={activeCalls}
            onHangup={hangupCall}
          />

          <OutboundDialer
            businesses={businesses}
            contacts={contacts}
            onOriginate={originateCall}
            onSaveSipCredentials={saveSipCredentials}
            onFetchMetaSip={fetchMetaSipCredentials}
            onRequestCallPermission={requestCallPermission}
            onCheckCallPermission={checkCallPermission}
          />
        </div>

        {/* Audio Recordings Section (2-Way Full Audio) */}
        <CallRecordingsSection contacts={contacts} />

        {/* Bottom Section: Call Logs Table */}
        <CallHistoryTable history={callHistory} />
      </main>

      {/* Business & Phone Number ID Management Modal */}
      <BusinessManagerModal
        isOpen={isBusinessModalOpen}
        onClose={() => setIsBusinessModalOpen(false)}
        businesses={businesses}
        onSave={saveBusinesses}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-600">
        Superblock Voice &bull; WebRTC Agent Softphone &bull; FreeSWITCH 1.10.12 (AWS EC2 13.204.46.100)
      </footer>
    </div>
  );
}
