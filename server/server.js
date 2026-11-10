const http = require('http');
const express = require('express');
const cors = require('cors');
const net = require('net');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const FreeSwitchESL = require('./freeswitch-esl');
const businessDirectory = require('./business-directory');
const contacts = require('./contacts');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const esl = new FreeSwitchESL();
const server = http.createServer(app);

const FREESWITCH_INTERNAL_IP = process.env.FREESWITCH_PRIVATE_IP || process.env.FREESWITCH_INTERNAL_IP || '127.0.0.1';

// 1. Dedicated Raw TCP Proxy for FreeSWITCH SIP WebSocket on local port 5066
const sipTcpProxy = net.createServer((clientSocket) => {
  if (!esl.sshClient) {
    clientSocket.destroy();
    return;
  }
  esl.sshClient.forwardOut('127.0.0.1', 12345, FREESWITCH_INTERNAL_IP, 5066, (err, stream) => {
    if (err) {
      console.error('[SIP TCP Proxy] forwardOut error:', err.message);
      clientSocket.destroy();
      return;
    }
    clientSocket.pipe(stream).pipe(clientSocket);
    stream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => stream.destroy());
  });
});

sipTcpProxy.listen(5066, '127.0.0.1', () => {
  console.log('[SIP Proxy] Dedicated TCP WebSocket tunnel active on ws://127.0.0.1:5066 -> FreeSWITCH:5066');
});

sipTcpProxy.on('error', (err) => {
  console.warn('[SIP Proxy] TCP server warning:', err.message);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

// 2. Fallback HTTP upgrade proxy on port 3001/sip with full header re-injection
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/sip' || req.url?.startsWith('/sip')) {
    if (!esl.sshClient) {
      socket.destroy();
      return;
    }
    esl.sshClient.forwardOut('127.0.0.1', 12345, FREESWITCH_INTERNAL_IP, 5066, (err, stream) => {
      if (err) {
        console.error('[SIP Proxy] forwardOut error:', err);
        socket.destroy();
        return;
      }
      // Re-send the HTTP Upgrade request that Node's parser consumed
      let rawReq = `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        rawReq += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      }
      rawReq += '\r\n';
      stream.write(Buffer.from(rawReq));
      if (head && head.length > 0) {
        stream.write(head);
      }
      socket.pipe(stream).pipe(socket);
      stream.on('error', () => socket.destroy());
      socket.on('error', () => stream.destroy());
    });
  }
});

const sseClients = new Set();

function broadcastEvent(type, data) {
  const payload = `data: ${JSON.stringify({ type, data, timestamp: Date.now() })}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

esl.on('call_ringing', (call) => broadcastEvent('call_ringing', call));
esl.on('call_answered', (call) => broadcastEvent('call_answered', call));
esl.on('call_hangup', (call) => broadcastEvent('call_hangup', call));
esl.on('calls_updated', (calls) => broadcastEvent('calls_updated', calls));
esl.on('authenticated', () => broadcastEvent('engine_status', { online: true }));
esl.on('disconnected', () => broadcastEvent('engine_status', { online: false }));
esl.on('error', (err) => console.warn('[Server] Handled ESL error:', err?.message || err));

esl.connect().then(() => {
  console.log('[Server] FreeSWITCH ESL connected and ready.');
}).catch((err) => {
  console.error('[Server] Failed to connect FreeSWITCH ESL:', err.message);
});

// SSE endpoint
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);

  res.write(`data: ${JSON.stringify({
    type: 'initial_state',
    data: {
      activeCalls: esl.getActiveCalls(),
      history: esl.getCallHistory(),
      businesses: businessDirectory.getAll(),
      contacts: contacts.getAll(),
      online: esl.isConnected && esl.isAuthenticated
    },
    timestamp: Date.now()
  })}\n\n`);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// Server status
app.get('/api/status', async (req, res) => {
  try {
    const status = await esl.getStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Active calls
app.get('/api/calls', (req, res) => {
  res.json({
    activeCalls: esl.getActiveCalls()
  });
});

// Call history
app.get('/api/history', (req, res) => {
  res.json({
    history: esl.getCallHistory()
  });
});

// Saved Contacts directory (Anna Mathews, Rishad, Sana, Fathima, etc.)
app.get('/api/contacts', (req, res) => {
  res.json({
    contacts: contacts.getAll()
  });
});

app.post('/api/contacts', (req, res) => {
  try {
    const updated = contacts.upsert(req.body);
    res.json({ success: true, contacts: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Businesses list
app.get('/api/businesses', (req, res) => {
  res.json({
    businesses: businessDirectory.getAll()
  });
});

// Update businesses
app.post('/api/businesses', (req, res) => {
  const { businesses } = req.body;
  if (!Array.isArray(businesses)) {
    return res.status(400).json({ error: 'businesses must be an array' });
  }

  const updated = businessDirectory.updateAll(businesses);
  broadcastEvent('businesses_updated', updated);
  res.json({ businesses: updated });
});

// Automatically fetch SIP credentials from Meta Graph API using Access Token & Phone Number ID
app.post('/api/settings/fetch-meta-sip', async (req, res) => {
  const { accessToken, phoneNumberId } = req.body;
  if (!accessToken || !phoneNumberId) {
    return res.status(400).json({ error: 'accessToken and phoneNumberId are required' });
  }

  try {
    const metaUrl = `https://graph.facebook.com/v21.0/${phoneNumberId}/settings?include_sip_credentials=true`;
    const response = await fetch(metaUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      return res.status(400).json({ error: data.error?.message || 'Meta API error' });
    }

    const sipPassword = data.calling?.sip?.servers?.[0]?.sip_user_password
      || data.data?.[0]?.sip_server?.sip_password
      || data.sip_server?.sip_password
      || data.sip_password;

    const sipUser = (data.calling?.sip?.servers?.[0]?.username || '919544383237').replace(/\D/g, '');

    if (!sipPassword) {
      return res.status(404).json({
        error: 'No SIP password returned by Meta. Verify calling is enabled for this phone number in WhatsApp Manager.',
        raw: data
      });
    }

    // Match business in directory and update its sipPassword
    const businesses = businessDirectory.getAll();
    const matchedBiz = businesses.find(b => String(b.phoneNumberId) === String(phoneNumberId));
    if (matchedBiz) {
      matchedBiz.sipPassword = sipPassword;
      businessDirectory.save();
    }

    // Determine gateway name
    let gwFile = 'whatsapp.xml';
    if (matchedBiz?.id === 'lady-chef') gwFile = 'whatsapp_ladychef.xml';
    else if (matchedBiz?.id === 'zangos') gwFile = 'whatsapp_zangos.xml';
    else if (matchedBiz?.id === 'hodor') gwFile = 'whatsapp_hodor.xml';
    else if (matchedBiz?.id === 'spekxo') gwFile = 'whatsapp_spekxo.xml';
    else if (matchedBiz?.id === 'superblock') gwFile = 'whatsapp_superblock.xml';

    const gwName = gwFile.replace('.xml', '');
    const xmlConfig = `<include>\\n  <gateway name=\\"${gwName}\\">\\n    <param name=\\"realm\\" value=\\"wa.meta.vc\\"/>\\n    <param name=\\"proxy\\" value=\\"wa.meta.vc:5061\\"/>\\n    <param name=\\"register-transport\\" value=\\"tls\\"/>\\n    <param name=\\"username\\" value=\\"${sipUser}\\"/>\\n    <param name=\\"from-user\\" value=\\"${sipUser}\\"/>\\n    <param name=\\"from-domain\\" value=\\"sip.superblock.chat\\"/>\\n    <param name=\\"password\\" value=\\"${sipPassword}\\"/>\\n    <param name=\\"register\\" value=\\"false\\"/>\\n    <param name=\\"caller-id-in-from\\" value=\\"true\\"/>\\n    <param name=\\"retry-seconds\\" value=\\"30\\"/>\\n  </gateway>\\n</include>`;

    // Write gateway configuration to FreeSWITCH with 4s timeout
    await new Promise((resolve) => {
      const cmd = `echo -e "${xmlConfig}" | sudo tee /usr/local/freeswitch/conf/sip_profiles/external/${gwFile} >/dev/null`;
      const timer = setTimeout(resolve, 3500);
      try {
        esl.sshClient.exec(cmd, (err, stream) => {
          if (err) { clearTimeout(timer); return resolve(); }
          stream.on('close', () => { clearTimeout(timer); resolve(); });
          stream.resume();
        });
      } catch (_) {
        clearTimeout(timer);
        resolve();
      }
    });

    try {
      await esl.executeApi('sofia profile external rescan', 3000);
    } catch (_) {}

    res.json({
      success: true,
      message: `SIP credentials retrieved from Meta and active for ${matchedBiz?.name || sipUser}!`,
      username: sipUser,
      business: matchedBiz?.name || 'Business',
      gateway: gwName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Meta SIP Password for outbound calls
app.post('/api/settings/sip-credentials', async (req, res) => {
  const { password, username } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'password is required' });
  }

  try {
    const cleanUser = (username || '919544383237').replace(/\D/g, '');
    const cleanPass = password.trim();

    const xmlConfig = `<include>\\n  <gateway name=\\"whatsapp\\">\\n    <param name=\\"realm\\" value=\\"wa.meta.vc\\"/>\\n    <param name=\\"proxy\\" value=\\"wa.meta.vc:5061\\"/>\\n    <param name=\\"register-transport\\" value=\\"tls\\"/>\\n    <param name=\\"username\\" value=\\"${cleanUser}\\"/>\\n    <param name=\\"from-user\\" value=\\"${cleanUser}\\"/>\\n    <param name=\\"from-domain\\" value=\\"sip.superblock.chat\\"/>\\n    <param name=\\"password\\" value=\\"${cleanPass}\\"/>\\n    <param name=\\"register\\" value=\\"false\\"/>\\n    <param name=\\"caller-id-in-from\\" value=\\"true\\"/>\\n    <param name=\\"retry-seconds\\" value=\\"30\\"/>\\n  </gateway>\\n</include>`;

    await new Promise((resolve, reject) => {
      const cmd = `echo -e "${xmlConfig}" | sudo tee /usr/local/freeswitch/conf/sip_profiles/external/whatsapp.xml >/dev/null`;
      esl.sshClient.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('close', resolve);
      });
    });

    await esl.executeApi('sofia profile external rescan');

    console.log('[Server] Meta SIP credentials updated successfully.');
    res.json({ success: true, message: 'Meta SIP credentials updated and applied!' });
  } catch (err) {
    console.error('[Server] Failed to update SIP credentials:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper to retrieve Meta Graph API system token for a business
function getBusinessToken(phoneId, businessId) {
  const verifiedPath = path.join(__dirname, 'data', 'verified_businesses.json');
  if (fs.existsSync(verifiedPath)) {
    try {
      const verified = JSON.parse(fs.readFileSync(verifiedPath, 'utf8'));
      const match = verified.find(b => String(b.phoneNumberId) === String(phoneId) || b.id === businessId);
      if (match?.token) return match.token;
    } catch (_) {}
  }
  return process.env.META_ACCESS_TOKEN || '';
}

// Check WhatsApp Call Permission status with Meta Graph API
app.get('/api/calls/check-permission', async (req, res) => {
  const { toNumber, fromBusinessId } = req.query;
  if (!toNumber) {
    return res.status(400).json({ error: 'toNumber is required' });
  }

  try {
    let cleanNumber = toNumber.replace(/\D/g, '');
    if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;

    const businesses = businessDirectory.getAll();
    const chosenBiz = businesses.find(b => b.id === fromBusinessId) || businesses[0];
    const phoneId = chosenBiz?.phoneNumberId || '1253960817805789';
    const token = getBusinessToken(phoneId, chosenBiz?.id);

    const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/call_permissions?user_wa_id=${cleanNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      return res.status(400).json({ error: data.error?.message || 'Meta API error' });
    }

    const canCall = data.actions?.some(a => a.action_name === 'start_call' && a.can_perform_action === true) ?? false;
    const canSendRequest = data.actions?.some(a => a.action_name === 'send_call_permission_request' && a.can_perform_action === true) ?? false;
    const status = data.permission?.status || 'unknown';

    res.json({
      success: true,
      number: `+${cleanNumber}`,
      status, // 'permanent', 'temporary', 'no_permission', etc.
      approved: canCall,
      canCall,
      canSendRequest,
      business: chosenBiz?.name || 'Business',
      raw: data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Originate call with selected business identity
app.post('/api/calls/originate', async (req, res) => {
  const { toNumber, fromBusinessId, action } = req.body;
  if (!toNumber) {
    return res.status(400).json({ error: 'toNumber is required' });
  }

  try {
    const result = await esl.originateWhatsAppCall(toNumber, fromBusinessId || 'lady-chef', action || 'echo');

    // If FreeSWITCH reported REJECTED without specific warning, verify via Meta Graph API
    if (!result.success && result.code === 'REJECTED') {
      try {
        let cleanNumber = toNumber.replace(/\D/g, '');
        if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;
        const chosenBiz = businessDirectory.getAll().find(b => b.id === fromBusinessId) || businessDirectory.getAll()[0];
        const phoneId = chosenBiz?.phoneNumberId || '1253960817805789';
        const token = getBusinessToken(phoneId, chosenBiz?.id);

        const permRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/call_permissions?user_wa_id=${cleanNumber}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const permData = await permRes.json();
        const canCall = permData.actions?.some(a => a.action_name === 'start_call' && a.can_perform_action === true);

        if (canCall) {
          result.code = 'RATE_LIMITED';
          result.message = `⏳ Meta Rate Limit / Cooldown: Recipient (+${cleanNumber}) has approved WhatsApp calls, but Meta is enforcing a temporary cooldown due to multiple rapid attempts in the last 30 minutes.`;
        } else {
          result.code = 'PERMISSION_NEEDED';
          result.message = `WhatsApp call blocked by Meta: Recipient (+${cleanNumber}) has not approved business calls yet.`;
        }
      } catch (_) {}
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request WhatsApp Call Permission from recipient (Meta interactive message)
app.post('/api/calls/request-permission', async (req, res) => {
  const { toNumber, fromBusinessId } = req.body;
  if (!toNumber) {
    return res.status(400).json({ error: 'toNumber is required' });
  }

  try {
    let cleanNumber = toNumber.replace(/\D/g, '');
    if (!cleanNumber.startsWith('91') && cleanNumber.length === 10) cleanNumber = '91' + cleanNumber;

    const businesses = businessDirectory.getAll();
    const chosenBiz = businesses.find(b => b.id === fromBusinessId) || businesses[0];
    const phoneId = chosenBiz?.phoneNumberId || '1253960817805789';
    const token = getBusinessToken(phoneId, chosenBiz?.id);

    // 1. Proactively check current permission and limit status
    try {
      const permRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/call_permissions?user_wa_id=${cleanNumber}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const permData = await permRes.json();

      const canCall = permData.actions?.some(a => a.action_name === 'start_call' && a.can_perform_action === true);
      if (canCall) {
        return res.json({
          success: true,
          alreadyApproved: true,
          message: `✅ Call permission is ALREADY approved for +${cleanNumber}! You can place outbound calls directly.`
        });
      }

      const reqAction = permData.actions?.find(a => a.action_name === 'send_call_permission_request');
      if (reqAction && reqAction.can_perform_action === false) {
        return res.status(400).json({
          success: false,
          code: 'LIMIT_EXCEEDED',
          error: `⏳ Meta 24-Hour Limit: A call permission request was already sent to +${cleanNumber} in the last 24 hours. Meta allows only 1 request every 24 hours to prevent spam. Ask the recipient to check their WhatsApp chat, or call ${chosenBiz?.phoneNumber || 'the business'} once.`
        });
      }
    } catch (_) {}

    // 2. Send the call permission request to WhatsApp (Try approved template first for delivery outside 24h window)
    let response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanNumber,
        type: 'template',
        template: {
          name: 'request_call_permission',
          language: { code: 'en' }
        }
      })
    });

    let data = await response.json();

    // If template does not exist on this WABA, fallback to interactive message
    if (!response.ok && (data.error?.code === 100 || data.error?.code === 132000 || data.error?.code === 132001)) {
      response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanNumber,
          type: 'interactive',
          interactive: {
            type: 'call_permission_request',
            action: { name: 'call_permission_request' }
          }
        })
      });
      data = await response.json();
    }
    if (!response.ok || data.error) {
      const errCode = data.error?.code;
      const errMsg = data.error?.message || '';

      if (errCode === 138017 || errMsg.toLowerCase().includes('already been approved') || errMsg.toLowerCase().includes('already call')) {
        return res.json({
          success: true,
          alreadyApproved: true,
          message: `✅ Call permission is ALREADY approved by this contact! You can place outbound calls directly.`
        });
      }

      if (errCode === 138009 || errMsg.toLowerCase().includes('limit reached')) {
        return res.status(400).json({
          success: false,
          code: 'LIMIT_EXCEEDED',
          error: `⏳ Meta 24-Hour Limit: A call permission request was already sent to this recipient today. Meta restricts businesses to 1 request every 24 hours. Ask them to check their WhatsApp chat, or call ${chosenBiz?.phoneNumber || 'the business'}.`
        });
      }

      if (errCode === 131047 || errCode === 131026 || errMsg.toLowerCase().includes('24 hour') || errMsg.toLowerCase().includes('re-engagement')) {
        return res.status(400).json({
          success: false,
          code: 'WINDOW_CLOSED',
          error: `💬 24-Hour Customer Window Expired: The recipient has not messaged or called in the last 24 hours. Ask them to send a quick "Hi" or call ${chosenBiz?.phoneNumber || 'the business'} to re-open the window.`
        });
      }

      return res.status(400).json({
        success: false,
        error: data.error?.error_data?.details || data.error?.message || 'Failed to send permission request'
      });
    }

    res.json({
      success: true,
      message: `📲 Call permission request sent directly to +${cleanNumber}'s WhatsApp chat! Ask them to tap "Allow" so calls will connect.`,
      data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hangup call
app.post('/api/calls/hangup', async (req, res) => {
  const { uuid } = req.body;
  if (!uuid) {
    return res.status(400).json({ error: 'uuid is required' });
  }

  try {
    const result = await esl.hangupCall(uuid);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List all call recordings from FreeSWITCH EC2
app.get('/api/recordings', async (req, res) => {
  if (!esl.sshClient) {
    return res.status(503).json({ error: 'SSH connection not available' });
  }

  const cmd = `ls -lh --time-style=+%s /usr/local/freeswitch/recordings/*.wav 2>/dev/null`;
  esl.sshClient.exec(cmd, (err, stream) => {
    if (err) return res.status(500).json({ error: err.message });

    let raw = '';
    stream.on('data', (d) => (raw += d));
    stream.on('end', () => {
      const history = esl.getCallHistory() || [];
      const lines = raw.split('\n').filter((l) => l.trim().endsWith('.wav'));
      const recordings = [];

      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) continue;

        const size = parts[4];
        const timestampSec = parseInt(parts[5], 10);
        const fullPath = parts[6];
        const filename = fullPath.split('/').pop();
        const uuid = filename.replace(/\.wav$/, '');

        const match = history.find((h) => h.uuid === uuid);

        const custNum = match?.direction === 'inbound' ? match?.callerNumber : (match?.destinationNumber || 'Unknown');
        const custName = contacts.resolveName(custNum, match?.callerName || (match?.customerName || 'WhatsApp Contact'));

        recordings.push({
          uuid,
          filename,
          sizeFormatted: size,
          timestamp: timestampSec ? timestampSec * 1000 : Date.now(),
          business: match?.business || { name: 'WhatsApp Call', color: 'emerald' },
          customerNumber: custNum,
          customerName: custName,
          direction: match?.direction || 'unknown',
          duration: match?.duration || 0,
          streamUrl: `/api/recordings/${uuid}/stream`,
          downloadUrl: `/api/recordings/${uuid}/download`
        });
      }

      // Sort newest first
      recordings.sort((a, b) => b.timestamp - a.timestamp);
      res.json({ recordings });
    });
  });
});

// Stream call audio directly to HTML5 audio element
app.get('/api/recordings/:uuid/stream', (req, res) => {
  const { uuid } = req.params;
  const safeUuid = uuid.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUuid) return res.status(400).send('Invalid UUID');

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Disposition', `inline; filename="${safeUuid}.wav"`);
  res.setHeader('Accept-Ranges', 'bytes');

  const cmd = `cat /usr/local/freeswitch/recordings/${safeUuid}.wav 2>/dev/null`;
  esl.sshClient.exec(cmd, (err, stream) => {
    if (err) return res.status(500).send('SSH error: ' + err.message);
    stream.pipe(res);
    stream.on('error', (e) => console.warn('Stream error:', e.message));
  });
});

// Open local recordings folder in Windows File Explorer
app.post('/api/recordings/open-folder', (req, res) => {
  const localDir = path.resolve(__dirname, '../recordings');
  if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

  const { exec } = require('child_process');
  exec(`explorer.exe "${localDir}"`, () => {});
  res.json({ success: true, path: localDir });
});

// Sync recordings from EC2 to local folder
app.post('/api/recordings/sync', (req, res) => {
  const { exec } = require('child_process');
  exec(`node "${path.resolve(__dirname, 'scripts/sync-recordings.js')}"`, (err, stdout, stderr) => {
    res.json({ success: !err, output: stdout || stderr });
  });
});

// Download recording file
app.get('/api/recordings/:uuid/download', (req, res) => {
  const { uuid } = req.params;
  const safeUuid = uuid.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeUuid) return res.status(400).send('Invalid UUID');

  res.setHeader('Content-Type', 'audio/wav');
  res.setHeader('Content-Disposition', `attachment; filename="call-${safeUuid}.wav"`);

  const cmd = `cat /usr/local/freeswitch/recordings/${safeUuid}.wav 2>/dev/null`;
  esl.sshClient.exec(cmd, (err, stream) => {
    if (err) return res.status(500).send('SSH error: ' + err.message);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Voice API bridge & SIP WebSocket proxy running on http://localhost:${PORT}`);
});
