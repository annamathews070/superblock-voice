import { useState, useEffect, useRef, useCallback } from 'react';
import { SimpleUser } from 'sip.js/lib/platform/web';

export function useWebRtcSoftphone() {
  const [isRegistered, setIsRegistered] = useState(false);
  const [callState, setCallState] = useState('idle'); // 'idle' | 'ringing' | 'connected'
  const [incomingCallInfo, setIncomingCallInfo] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [autoAnswer, setAutoAnswer] = useState(true);

  const simpleUserRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const timerRef = useRef(null);
  const autoAnswerRef = useRef(autoAnswer);

  useEffect(() => {
    autoAnswerRef.current = autoAnswer;
  }, [autoAnswer]);

  // Global user interaction listener to unlock audio output on browsers
  useEffect(() => {
    const unlockAudio = () => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // Setup remote audio element
  useEffect(() => {
    let audio = document.getElementById('remote-webrtc-audio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'remote-webrtc-audio';
      audio.autoplay = true;
      audio.muted = false;
      audio.volume = 1.0;
      document.body.appendChild(audio);
    }
    remoteAudioRef.current = audio;

    const serverWs = `ws://${window.location.hostname || '127.0.0.1'}:5066`;

    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ];

    const options = {
      aor: 'sip:1000@sip.superblock.chat',
      media: {
        constraints: { audio: true, video: false },
        remote: {
          audio: audio
        },
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
          peerConnectionConfiguration: {
            iceServers
          }
        }
      },
      userAgentOptions: {
        authorizationUsername: '1000',
        authorizationPassword: 'jXjxoSuH8rGQYyzenK7mQKXIZX9mcEfZ',
        displayName: 'Agent 1000',
        transportOptions: {
          server: serverWs,
          connectionTimeout: 15
        },
        sessionDescriptionHandlerFactoryOptions: {
          peerConnectionConfiguration: {
            iceServers
          }
        }
      }
    };

    let user;
    let reconnectTimeout = null;

    const scheduleReconnect = () => {
      if (reconnectTimeout) return;
      reconnectTimeout = setTimeout(async () => {
        reconnectTimeout = null;
        if (!simpleUserRef.current) return;
        try {
          console.log('[WebRTC Softphone] Attempting auto-reconnect to SIP proxy...');
          await simpleUserRef.current.connect();
          await simpleUserRef.current.register();
          setErrorMessage(null);
          console.log('[WebRTC Softphone] Auto-reconnect succeeded.');
        } catch (e) {
          console.warn('[WebRTC Softphone] Auto-reconnect retry in 4s:', e.message);
          scheduleReconnect();
        }
      }, 4000);
    };

    try {
      user = new SimpleUser(serverWs, options);
      simpleUserRef.current = user;

      user.delegate = {
        onRegistered: () => {
          console.log('[WebRTC Softphone] Registered as Extension 1000');
          setIsRegistered(true);
          setErrorMessage(null);
        },
        onUnregistered: () => {
          console.log('[WebRTC Softphone] Unregistered');
          setIsRegistered(false);
        },
        onServerConnect: () => {
          console.log('[WebRTC Softphone] Connected to SIP WebSocket');
          setErrorMessage(null);
        },
        onServerDisconnect: (error) => {
          console.warn('[WebRTC Softphone] Disconnected from SIP WebSocket:', error);
          setIsRegistered(false);
          scheduleReconnect();
        },
        onCallReceived: () => {
          console.log('[WebRTC Softphone] Incoming call received!');
          setCallState('ringing');
          setIncomingCallInfo({
            caller: 'WhatsApp Caller',
            time: Date.now()
          });

          // Auto-answer call immediately if enabled (seamless for agent desk & outbound calls)
          if (autoAnswerRef.current) {
            console.log('[WebRTC Softphone] Auto-answer is active. Answering call in 300ms...');
            setTimeout(async () => {
              try {
                if (simpleUserRef.current) {
                  const s = simpleUserRef.current.session;
                  if (!s || s.state !== 'Established') {
                    await simpleUserRef.current.answer();
                    setErrorMessage(null);
                    console.log('[WebRTC Softphone] Auto-answer connected successfully.');
                  }
                }
              } catch (e) {
                const msg = (e && (e.message || String(e))) || '';
                if (!msg.toLowerCase().includes('established') && !msg.toLowerCase().includes('invalid session state')) {
                  console.error('[WebRTC Softphone] Auto-answer error:', e);
                }
              }
            }, 300);
          }
        },
        onCallAnswered: () => {
          console.log('[WebRTC Softphone] Call answered & active');
          setErrorMessage(null);
          
          const attachAudioStream = () => {
            try {
              const stream = user.remoteMediaStream;
              if (stream && remoteAudioRef.current) {
                console.log('[WebRTC Softphone] Attaching remoteMediaStream to speaker, tracks:', stream.getAudioTracks().length);
                remoteAudioRef.current.srcObject = stream;
                remoteAudioRef.current.play().catch((e) => console.warn('Audio play error:', e));
              }
            } catch (err) {
              console.warn('[WebRTC Softphone] attachAudioStream error:', err);
            }
          };

          attachAudioStream();
          setTimeout(attachAudioStream, 400);
          setTimeout(attachAudioStream, 1200);

          setCallState('connected');
          setCallDuration(0);
          timerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        },
        onCallHangup: () => {
          console.log('[WebRTC Softphone] Call terminated');
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = null;
          }
          setCallState('idle');
          setIncomingCallInfo(null);
          setIsMuted(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      };

      user.connect()
        .then(() => user.register())
        .catch((err) => {
          console.error('[WebRTC Softphone] Init error:', err);
          setErrorMessage('Connecting WebRTC phone: ' + err.message + ' (retrying...)');
          scheduleReconnect();
        });

    } catch (e) {
      console.error('[WebRTC Softphone] Instantiation error:', e);
      setErrorMessage(e.message);
      scheduleReconnect();
    }

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
      if (user) {
        user.unregister().catch(() => {});
        user.disconnect().catch(() => {});
      }
    };
  }, []);

  const answerCall = useCallback(async () => {
    if (!simpleUserRef.current) return;
    try {
      const session = simpleUserRef.current.session;
      if (session && (session.state === 'Established' || session.state === 'Terminating' || session.state === 'Terminated')) {
        console.log('[WebRTC Softphone] Call already in state:', session.state);
        setErrorMessage(null);
        return;
      }
      await simpleUserRef.current.answer();
      const stream = simpleUserRef.current.remoteMediaStream;
      if (stream && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch((e) => console.warn('Audio play error:', e));
      }
      setErrorMessage(null);
    } catch (e) {
      const msg = (e && (e.message || String(e))) || '';
      if (msg.toLowerCase().includes('established') || msg.toLowerCase().includes('invalid session state')) {
        console.log('[WebRTC Softphone] Benign state warning suppressed:', msg);
        setErrorMessage(null);
        return;
      }
      console.error('[WebRTC Softphone] Failed to answer:', e);
      setErrorMessage('Failed to answer: ' + msg);
    }
  }, []);

  const declineCall = useCallback(async () => {
    if (!simpleUserRef.current) return;
    try {
      await simpleUserRef.current.hangup();
      setCallState('idle');
      setIncomingCallInfo(null);
    } catch (e) {
      console.error('[WebRTC Softphone] Failed to decline:', e);
    }
  }, []);

  const hangupCall = useCallback(async () => {
    if (!simpleUserRef.current) return;
    try {
      await simpleUserRef.current.hangup();
      setCallState('idle');
      setIncomingCallInfo(null);
    } catch (e) {
      console.error('[WebRTC Softphone] Failed to hangup:', e);
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!simpleUserRef.current) return;
    if (isMuted) {
      simpleUserRef.current.unmute();
      setIsMuted(false);
    } else {
      simpleUserRef.current.mute();
      setIsMuted(true);
    }
  }, [isMuted]);

  return {
    isRegistered,
    callState,
    incomingCallInfo,
    isMuted,
    callDuration,
    errorMessage,
    autoAnswer,
    setAutoAnswer,
    answerCall,
    declineCall,
    hangupCall,
    toggleMute
  };
}

