import { useState, useEffect, useCallback, useRef } from 'react';

export function useVoiceEngine() {
  const [engineStatus, setEngineStatus] = useState({
    online: false,
    uptime: '',
    version: 'FreeSWITCH 1.10',
    totalSessions: 0
  });

  const [activeCalls, setActiveCalls] = useState([]);
  const [callHistory, setCallHistory] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [lastNotification, setLastNotification] = useState(null);

  const eventSourceRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setEngineStatus(data);
      }
    } catch (err) {
      console.warn('Status fetch error:', err);
    }
  }, []);

  const refreshBusinesses = useCallback(async () => {
    try {
      const res = await fetch('/api/businesses');
      if (res.ok) {
        const data = await res.json();
        setBusinesses(data.businesses || []);
      }
    } catch (err) {
      console.warn('Businesses fetch error:', err);
    }
  }, []);

  const refreshContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch (err) {
      console.warn('Contacts fetch error:', err);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
    refreshBusinesses();
    refreshContacts();

    const connectSSE = () => {
      const es = new EventSource('/api/events');
      eventSourceRef.current = es;

      es.onopen = () => {
        setConnected(true);
      };

      es.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const { type, data } = payload;

          if (type === 'initial_state') {
            setActiveCalls(data.activeCalls || []);
            setCallHistory(data.history || []);
            if (data.businesses) setBusinesses(data.businesses);
            if (data.contacts) setContacts(data.contacts);
            setEngineStatus((prev) => ({ ...prev, online: data.online }));
          } else if (type === 'call_ringing') {
            setLastNotification({ type: 'ringing', call: data });
            setActiveCalls((prev) => {
              const existing = prev.find((c) => c.uuid === data.uuid);
              if (existing) return prev.map((c) => (c.uuid === data.uuid ? data : c));
              return [data, ...prev];
            });
          } else if (type === 'call_answered') {
            setLastNotification({ type: 'answered', call: data });
            setActiveCalls((prev) =>
              prev.map((c) => (c.uuid === data.uuid ? { ...c, state: 'active', answerTime: Date.now() } : c))
            );
          } else if (type === 'call_hangup') {
            setLastNotification({ type: 'hangup', call: data });
            setActiveCalls((prev) => prev.filter((c) => c.uuid !== data.uuid));
            setCallHistory((prev) => [data, ...prev.slice(0, 49)]);
            refreshStatus();
          } else if (type === 'calls_updated') {
            setActiveCalls(data || []);
          } else if (type === 'businesses_updated') {
            setBusinesses(data || []);
          } else if (type === 'engine_status') {
            setEngineStatus((prev) => ({ ...prev, online: data.online }));
            refreshStatus();
          }
        } catch (e) {
          console.error('SSE JSON error:', e);
        }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        setTimeout(connectSSE, 3000);
      };
    };

    connectSSE();

    const interval = setInterval(refreshStatus, 10000);

    return () => {
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [refreshStatus, refreshBusinesses]);

  const originateCall = async (toNumber, fromBusinessId = 'lady-chef', action = 'echo') => {
    try {
      const res = await fetch('/api/calls/originate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber, fromBusinessId, action })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const hangupCall = async (uuid) => {
    try {
      const res = await fetch('/api/calls/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const saveBusinesses = async (newBusinesses) => {
    try {
      const res = await fetch('/api/businesses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businesses: newBusinesses })
      });
      const data = await res.json();
      if (data.businesses) {
        setBusinesses(data.businesses);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const fetchMetaSipCredentials = async (accessToken, phoneNumberId) => {
    try {
      const res = await fetch('/api/settings/fetch-meta-sip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, phoneNumberId })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const saveSipCredentials = async (username, password) => {
    try {
      const res = await fetch('/api/settings/sip-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const requestCallPermission = async (toNumber, fromBusinessId) => {
    try {
      const res = await fetch('/api/calls/request-permission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber, fromBusinessId })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const checkCallPermission = async (toNumber, fromBusinessId) => {
    try {
      const res = await fetch(`/api/calls/check-permission?toNumber=${encodeURIComponent(toNumber)}&fromBusinessId=${encodeURIComponent(fromBusinessId || 'lady-chef')}`);
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const saveContact = async (contact) => {
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contact)
      });
      const data = await res.json();
      if (data.contacts) setContacts(data.contacts);
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return {
    engineStatus,
    activeCalls,
    callHistory,
    businesses,
    contacts,
    saveContact,
    refreshContacts,
    connected,
    lastNotification,
    originateCall,
    hangupCall,
    saveBusinesses,
    saveSipCredentials,
    fetchMetaSipCredentials,
    requestCallPermission,
    checkCallPermission,
    refreshStatus
  };
}
