const { Client } = require('ssh2');
const fs = require('fs');
const EventEmitter = require('events');
const businessDirectory = require('./business-directory');
const contacts = require('./contacts');

class FreeSwitchESL extends EventEmitter {
  constructor(config = {}) {
    super();
    const keyPath = config.privateKeyPath || process.env.FREESWITCH_SSH_KEY || 'C:\\Users\\annam\\freeswitch-superblock.pem';
    let privateKey = config.privateKey || null;
    if (!privateKey && fs.existsSync(keyPath)) {
      try {
        privateKey = fs.readFileSync(keyPath);
      } catch (_) {}
    }

    this.sshConfig = {
      host: config.host || process.env.FREESWITCH_HOST || '127.0.0.1',
      port: config.sshPort || 22,
      username: config.username || process.env.FREESWITCH_SSH_USER || 'ubuntu',
      privateKey,
      keepaliveInterval: 10000,
      keepaliveCountMax: 5,
      readyTimeout: 30000
    };
    this.eslPort = config.eslPort || 8021;
    this.eslPassword = config.eslPassword || 'ClueCon';

    this.sshClient = null;
    this.stream = null;
    this.isConnected = false;
    this.isAuthenticated = false;
    this.buffer = '';
    this._isConnecting = false;
    this._reconnectTimer = null;

    this.activeCalls = new Map();
    this.callHistory = [];
    this.pendingCommands = [];
  }

  connect() {
    if (this._isConnecting) return Promise.resolve();
    this._isConnecting = true;

    return new Promise((resolve) => {
      try {
        if (this.sshClient) {
          this.sshClient.removeAllListeners();
          try { this.sshClient.end(); } catch (_) {}
        }
      } catch (_) {}

      this.sshClient = new Client();

      this.sshClient.on('ready', () => {
        console.log('[FreeSWITCH ESL] SSH connection established.');
        this._isConnecting = false;
        this.sshClient.forwardOut('127.0.0.1', 12345, '127.0.0.1', this.eslPort, (err, stream) => {
          if (err) {
            console.error('[FreeSWITCH ESL] Port forward error:', err.message);
            this.isConnected = false;
            this.isAuthenticated = false;
            this.emit('disconnected');
            if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
            this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 5000);
            return resolve();
          }

          this.stream = stream;
          this.isConnected = true;
          this.emit('connected');

          stream.on('data', (data) => this._handleData(data));
          stream.on('close', () => {
            console.log('[FreeSWITCH ESL] Stream closed. Reconnecting in 5s...');
            this.isConnected = false;
            this.isAuthenticated = false;
            this.emit('disconnected');
            if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
            this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 5000);
          });

          stream.on('error', (streamErr) => {
            console.error('[FreeSWITCH ESL] Stream error:', streamErr.message);
          });
        });
      });

      this.sshClient.on('error', (err) => {
        console.error('[FreeSWITCH ESL] SSH client error:', err.message);
        this.isConnected = false;
        this.isAuthenticated = false;
        this._isConnecting = false;
        this.emit('disconnected');
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 5000);
        resolve();
      });

      this.sshClient.on('close', () => {
        console.log('[FreeSWITCH ESL] SSH client closed. Reconnecting in 5s...');
        this.isConnected = false;
        this.isAuthenticated = false;
        this._isConnecting = false;
        this.emit('disconnected');
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 5000);
      });

      this.once('authenticated', () => {
        resolve();
      });

      try {
        this.sshClient.connect(this.sshConfig);
      } catch (err) {
        console.error('[FreeSWITCH ESL] connect() exception:', err.message);
        this._isConnecting = false;
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), 5000);
        resolve();
      }
    });
  }

  _handleData(chunk) {
    this.buffer += chunk.toString();

    while (true) {
      // Strip leading blank lines
      this.buffer = this.buffer.replace(/^[\r\n]+/, '');
      if (!this.buffer) break;

      const headerEndMatch = this.buffer.match(/\r?\n\r?\n/);
      if (!headerEndMatch) break; // Incomplete headers

      const headerEnd = headerEndMatch.index;
      const headerStr = this.buffer.substring(0, headerEnd);
      const bodyStart = headerEnd + headerEndMatch[0].length;

      const typeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
      const contentType = typeMatch ? typeMatch[1].trim() : '';

      const lenMatch = headerStr.match(/Content-Length:\s*(\d+)/i);
      const bodyLen = lenMatch ? parseInt(lenMatch[1], 10) : 0;

      if (this.buffer.length < bodyStart + bodyLen) {
        break; // Incomplete body, wait for next chunk
      }

      const body = this.buffer.substring(bodyStart, bodyStart + bodyLen);
      this.buffer = this.buffer.substring(bodyStart + bodyLen);

      if (!this.isAuthenticated) {
        if (contentType === 'auth/request') {
          console.log('[FreeSWITCH ESL] Auth requested. Sending password...');
          this.stream.write(`auth ${this.eslPassword}\n\n`);
          continue;
        } else if (contentType === 'command/reply' && headerStr.includes('+OK accepted')) {
          console.log('[FreeSWITCH ESL] Authentication successful!');
          this.isAuthenticated = true;
          this.emit('authenticated');
          this.stream.write('event json CHANNEL_CREATE CHANNEL_ANSWER CHANNEL_HANGUP CHANNEL_PROGRESS CHANNEL_PROGRESS_MEDIA\n\n');
          continue;
        }
      }

      if (contentType === 'api/response') {
        const pending = this.pendingCommands.shift();
        if (pending) {
          pending.resolve(body.trim());
        }
        continue;
      }

      if (contentType === 'text/event-json') {
        try {
          const event = JSON.parse(body);
          this._processEvent(event);
        } catch (e) {
          // Ignore parse errors on malformed event
        }
        continue;
      }

      if (contentType === 'command/reply') {
        continue;
      }
    }
  }

  _processEvent(evt) {
    const eventName = evt['Event-Name'];
    const uuid = evt['Unique-ID'] || evt['Channel-Call-UUID'];
    if (!uuid) return;

    const rawCallerName = evt['Caller-Caller-ID-Name'] || evt['Caller-Username'] || '';
    const callerNumber = evt['Caller-Caller-ID-Number'] || evt['Caller-ANI'] || 'Unknown';
    const destinationNumber = evt['Caller-Destination-Number'] || evt['Caller-Callee-ID-Number'] || 'Superblock';
    const direction = evt['Call-Direction'] || (evt['variable_direction'] || 'inbound');

    // Resolve contact name from saved contacts (e.g. Rishad, Sana, Fathima, Anna Mathews)
    const customerPhone = direction === 'inbound' ? callerNumber : destinationNumber;
    const resolvedContact = contacts.resolve(customerPhone);
    const callerName = resolvedContact?.name || rawCallerName || 'WhatsApp Caller';

    // Extract live Meta SIP custom headers
    const metaPhoneNumberId = evt['variable_sip_h_x-wa-meta-phone-number-id'] 
      || evt['sip_h_x-wa-meta-phone-number-id'] 
      || evt['variable_x-wa-meta-phone-number-id'];

    const metaOwnerBusinessId = evt['variable_sip_h_x-wa-meta-owner-business-id'] 
      || evt['sip_h_x-wa-meta-owner-business-id'];

    const metaUserId = evt['variable_sip_h_x-wa-meta-user-id'] 
      || evt['sip_h_x-wa-meta-user-id'];

    const metaWacId = evt['variable_sip_h_x-wa-meta-wacid'] 
      || evt['sip_h_x-wa-meta-wacid'];

    // Resolve business by Meta Phone Number ID or DID
    const businessTargetNumber = direction === 'inbound' ? destinationNumber : callerNumber;
    const business = businessDirectory.resolve(businessTargetNumber, metaPhoneNumberId, metaOwnerBusinessId);

    if (eventName === 'CHANNEL_CREATE') {
      const callData = {
        uuid,
        callerName,
        callerNumber,
        customerName: resolvedContact?.name || callerName,
        customerNumber: customerPhone,
        destinationNumber,
        direction,
        business,
        metaPhoneNumberId: metaPhoneNumberId || business?.phoneNumberId || 'N/A',
        metaOwnerBusinessId: metaOwnerBusinessId || business?.wabaId || 'N/A',
        metaUserId: metaUserId || 'N/A',
        metaWacId: metaWacId || 'N/A',
        state: 'ringing',
        startTime: Date.now(),
        answerTime: null,
        endTime: null,
        duration: 0
      };
      this.activeCalls.set(uuid, callData);
      console.log(`[CALL RINGING] [${business.name} | PhoneID:${callData.metaPhoneNumberId} | WABA:${callData.metaOwnerBusinessId}] ${direction.toUpperCase()} UUID:${uuid} From:${callerNumber} To:${destinationNumber}`);
      this.emit('call_ringing', callData);
      this.emit('calls_updated', this.getActiveCalls());
    } 
    else if (eventName === 'CHANNEL_ANSWER') {
      let callData = this.activeCalls.get(uuid);
      if (!callData) {
        callData = {
          uuid,
          callerName,
          callerNumber,
          destinationNumber,
          direction,
          business,
          metaPhoneNumberId: metaPhoneNumberId || business?.phoneNumberId || 'N/A',
          metaOwnerBusinessId: metaOwnerBusinessId || business?.wabaId || 'N/A',
          metaUserId: metaUserId || 'N/A',
          metaWacId: metaWacId || 'N/A',
          startTime: Date.now(),
          duration: 0
        };
      }
      callData.state = 'active';
      callData.answerTime = Date.now();
      callData.hasRecording = true;
      callData.recordingUrl = `/api/recordings/${uuid}/stream`;
      this.activeCalls.set(uuid, callData);

      // Start 2-way call audio recording on FreeSWITCH
      this.executeApi(`uuid_record ${uuid} start /usr/local/freeswitch/recordings/${uuid}.wav`)
        .then((res) => console.log(`[RECORDING STARTED] UUID:${uuid} -> ${res}`))
        .catch((err) => console.warn(`[RECORDING NOTICE] UUID:${uuid} -> ${err.message}`));

      console.log(`[CALL ANSWERED] [${callData.business?.name || business.name}] UUID:${uuid} Caller:${callerNumber}`);
      this.emit('call_answered', callData);
      this.emit('calls_updated', this.getActiveCalls());
    } 
    else if (eventName === 'CHANNEL_HANGUP') {
      const callData = this.activeCalls.get(uuid);
      const hangupCause = evt['Hangup-Cause'] || 'NORMAL_CLEARING';
      const duration = evt['variable_duration'] ? parseInt(evt['variable_duration'], 10) : (callData?.startTime ? Math.round((Date.now() - callData.startTime) / 1000) : 0);

      const hasRecording = duration > 0;
      const record = {
        uuid,
        callerName: callData?.callerName || callerName,
        callerNumber: callData?.callerNumber || callerNumber,
        destinationNumber: callData?.destinationNumber || destinationNumber,
        direction: callData?.direction || direction,
        business: callData?.business || business,
        metaPhoneNumberId: callData?.metaPhoneNumberId || metaPhoneNumberId || business?.phoneNumberId || 'N/A',
        metaOwnerBusinessId: callData?.metaOwnerBusinessId || metaOwnerBusinessId || business?.wabaId || 'N/A',
        metaUserId: callData?.metaUserId || metaUserId || 'N/A',
        state: 'completed',
        hangupCause,
        startTime: callData?.startTime || Date.now() - duration * 1000,
        endTime: Date.now(),
        duration,
        hasRecording,
        recordingUrl: hasRecording ? `/api/recordings/${uuid}/stream` : null
      };

      this.activeCalls.delete(uuid);
      this.callHistory.unshift(record);
      if (this.callHistory.length > 50) this.callHistory.pop();

      console.log(`[CALL HANGUP] [${record.business?.name} | PhoneID:${record.metaPhoneNumberId}] UUID:${uuid} Duration:${duration}s Cause:${hangupCause}`);
      this.emit('call_hangup', record);
      this.emit('calls_updated', this.getActiveCalls());
    }
  }

  executeApi(command, timeoutMs = 4000) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.stream) {
        return reject(new Error('FreeSWITCH ESL is not connected.'));
      }

      let timer = null;
      const cmdObj = {
        resolve: (val) => {
          if (timer) clearTimeout(timer);
          resolve(val);
        },
        reject: (err) => {
          if (timer) clearTimeout(timer);
          reject(err);
        }
      };

      timer = setTimeout(() => {
        const idx = this.pendingCommands.indexOf(cmdObj);
        if (idx !== -1) this.pendingCommands.splice(idx, 1);
        resolve('+OK timeout (presumed executed)');
      }, timeoutMs);

      this.pendingCommands.push(cmdObj);
      this.stream.write(`api ${command}\n\n`);
    });
  }

  async getStatus() {
    try {
      const output = await this.executeApi('status');
      const uptimeMatch = output.match(/UP\s+(.*)/i);
      const versionMatch = output.match(/FreeSWITCH\s+\((.*?)\)/i);
      const sessionMatch = output.match(/(\d+)\s+session\(s\)\s+since\s+startup/i);

      return {
        online: true,
        uptime: uptimeMatch ? uptimeMatch[1].trim() : 'Unknown',
        version: versionMatch ? versionMatch[1].trim() : 'FreeSWITCH 1.10',
        totalSessions: sessionMatch ? parseInt(sessionMatch[1], 10) : 0,
        raw: output
      };
    } catch (e) {
      return { online: false, error: e.message };
    }
  }

  getActiveCalls() {
    return Array.from(this.activeCalls.values());
  }

  getCallHistory() {
    return this.callHistory;
  }

  async getLatestSipWarning() {
    return new Promise((resolve) => {
      if (!this.sshClient) return resolve(null);
      const timer = setTimeout(() => resolve(null), 1500);
      try {
        this.sshClient.exec('sudo tail -n 60 /usr/local/freeswitch/var/log/freeswitch/freeswitch.log', (err, stream) => {
          if (err) { clearTimeout(timer); return resolve(null); }
          let out = '';
          stream.on('data', d => out += d);
          stream.on('close', () => {
            clearTimeout(timer);
            const matches = [...out.matchAll(/Warning:\s*399\s*wa\.meta\.vc\s*"([^"]+)"/g)];
            if (matches.length > 0) {
              resolve(matches[matches.length - 1][1].trim());
            } else {
              resolve(null);
            }
          });
        });
      } catch (_) {
        clearTimeout(timer);
        resolve(null);
      }
    });
  }

  async originateWhatsAppCall(toNumber, fromBusinessId = 'lady-chef', action = 'echo') {
    let cleanNumber = toNumber.replace(/[^0-9]/g, '');
    if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) {
      cleanNumber = '91' + cleanNumber;
    }

    const businesses = businessDirectory.getAll();
    const chosenBiz = businesses.find((b) => b.id === fromBusinessId) || businesses[0];
    const callerIdNum = chosenBiz ? chosenBiz.phoneNumber.replace(/[^0-9]/g, '') : '919544383237';

    // Map business to its dedicated Meta SIP gateway
    let gatewayName = 'whatsapp';
    if (chosenBiz?.id === 'lady-chef') gatewayName = 'whatsapp_ladychef';
    else if (chosenBiz?.id === 'zangos') gatewayName = 'whatsapp_zangos';
    else if (chosenBiz?.id === 'hodor') gatewayName = 'whatsapp_hodor';
    else if (chosenBiz?.id === 'spekxo') gatewayName = 'whatsapp_spekxo';
    else if (chosenBiz?.id === 'superblock') gatewayName = 'whatsapp_superblock';

    let app = '&echo()';
    if (action === 'chime') {
      app = '&playback(tone_stream://%(250,80,523);%(250,80,659);%(250,80,784);%(600,100,1046))';
    } else if (action === 'talk' || action === 'agent') {
      app = `&bridge({sip_auto_answer=true,sip_h_Call-Info='<sip:127.0.0.1>;answer-after=0',alert_info='info=alert-autoanswer',include_external_ip=true,advertised_media_ip=13.204.46.100,rtp_adv_candidate=13.204.46.100}user/1000@sip.superblock.chat)`;
    }

    const originateCmd = `originate {origination_caller_id_number=${callerIdNum},rtp_secure_media=true,disable_video=true,video_possible=false,absolute_codec_string='OPUS,PCMA,PCMU',RECORD_STEREO=true,execute_on_answer='record_session /usr/local/freeswitch/recordings/\${uuid}.wav'}sofia/gateway/${gatewayName}/+${cleanNumber} ${app}`;
    console.log(`[ORIGINATE CALL] [As: ${chosenBiz?.name} (${callerIdNum}) | Gateway: ${gatewayName} | PhoneID: ${chosenBiz?.phoneNumberId}] -> ${originateCmd}`);

    const result = await this.executeApi(originateCmd);
    const success = result.startsWith('+OK');
    let message = result;
    let code = success ? 'SUCCESS' : 'CALL_FAILED';

    if (!success) {
      const warning = await this.getLatestSipWarning();
      console.log(`[CALL DIAGNOSTIC] Result: ${result} | Latest Meta warning: ${warning}`);

      if (warning && warning.toLowerCase().includes('rate limit')) {
        code = 'RATE_LIMITED';
        message = `⏳ Meta Rate Limit: Meta has temporarily paused outbound calls to +${cleanNumber} due to rapid consecutive attempts. Please wait a few moments.`;
      } else if (warning && warning.toLowerCase().includes('payment')) {
        code = 'PAYMENT_ISSUE';
        message = `💳 Meta Business Payment Issue: Meta requires an active payment method on this WhatsApp Business Account before placing outbound calls.`;
      } else if (warning && (warning.toLowerCase().includes('permission') || warning.toLowerCase().includes('opt-in'))) {
        code = 'PERMISSION_NEEDED';
        message = `WhatsApp call blocked by Meta: Recipient (+${cleanNumber}) has not granted call permission yet. Click 'Send Call Permission Request' first.`;
      } else if (warning && warning.includes('131000')) {
        code = 'META_TEMPORARY_ERROR';
        message = `⚠️ Meta Service Notice (131000): Meta rang the recipient's phone (+${cleanNumber}), but reported a temporary service condition or the call was declined. If declined, please retry later.`;
      } else if (result.includes('USER_BUSY')) {
        code = 'USER_BUSY';
        message = `📞 Recipient Busy: The recipient (+${cleanNumber}) is on another call or rejected the call.`;
      } else if (result.includes('NO_ANSWER')) {
        code = 'NO_ANSWER';
        message = `⏱️ No Answer: The call rang but the recipient (+${cleanNumber}) did not answer.`;
      } else if (result.includes('NORMAL_TEMPORARY_FAILURE')) {
        code = 'TEMPORARY_FAILURE';
        message = warning ? `Meta Notice: ${warning}` : `Temporary network condition on Meta gateway. Retrying in 10-15 seconds usually succeeds.`;
      } else if (warning) {
        code = 'GATEWAY_ERROR';
        message = `Meta SIP Gateway: ${warning}`;
      }
    }

    return {
      success,
      code,
      message,
      number: `+${cleanNumber}`,
      business: chosenBiz
    };
  }

  async hangupCall(uuid) {
    if (!uuid) throw new Error('UUID is required');
    const result = await this.executeApi(`uuid_kill ${uuid}`);
    return { success: result.startsWith('+OK'), message: result };
  }
}

module.exports = FreeSwitchESL;
