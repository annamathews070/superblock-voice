# Superblock Voice 🎙️

**Multi-Tenant WhatsApp Cloud API Voice Calling & WebRTC Softphone Platform**

Superblock Voice is a full-duplex VoIP platform connecting web browsers directly to Meta's WhatsApp Business Calling SIP Gateway via an AWS-hosted FreeSWITCH PBX. It allows businesses to receive incoming WhatsApp audio calls and initiate outbound WhatsApp voice calls directly from a browser softphone.

---

## 🌟 Key Features

* **Multi-Tenant WhatsApp Identity Switching:** Dial out or receive calls using different verified business identities (Spekxo, Zangos Hotchicken, The Lady Chef, Superblock HQ, etc.).
* **Browser WebRTC Softphone:** Full-duplex WebRTC audio powered by SIP.js over secure WebSockets (WSS/WS) with auto-answer, mute, and live call timer.
* **Direct Meta SIP Trunking:** SIP over TLS directly to `wa.meta.vc:5061` with SDES-SRTP media encryption and Opus 48 kHz high-definition audio.
* **Dual-Channel Call Recordings:** Automatic server-side stereo recording of both inbound and outbound WhatsApp calls, with in-browser playback, download, and local folder synchronization.
* **Real-time Call Permissions & Templates:** Automatic verification of recipient WhatsApp call permissions and one-click dispatch of Meta-approved utility permission templates.
* **Contact Directory & Live Monitor:** Instant caller-ID name resolution, presets for frequent contacts, and live attribution of Meta Phone Number IDs and WABA headers.

---

## 🏗️ Architecture

```
[ WhatsApp Consumer App ]
         │
         ▼  (SIP over TLS 5061 / SDES-SRTP Opus)
[ Meta WhatsApp SIP Gateway (wa.meta.vc) ]
         │
         ▼  (TLS 5081 / UDP Media)
[ FreeSWITCH PBX (AWS EC2) ]
   ├── mod_sofia (external gateway per tenant)
   ├── mod_event_socket (ESL port 8021)
   └── stereo session recording (.wav)
         │
         ▼  (WS / WSS proxy & ESL TCP bridge)
[ Express API Server (Node.js) ]
         │
         ▼  (WebRTC Audio / REST API / Event Stream)
[ Vite + React Softphone UI ]
```

---

## 🚀 Getting Started

### Prerequisites

* Node.js v18+ and npm
* Running FreeSWITCH instance configured for WhatsApp SIP trunking (with Sofia SIP profiles and mod_event_socket enabled)
* Meta WhatsApp Business Account (WABA) with Calling API enabled and SIP credentials configured

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/annamathews070/superblock-voice.git
   cd superblock-voice
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Copy the example environment file and fill in your values:
   ```bash
   cp .env.example .env
   ```
   Edit `.env`:
   ```env
   PORT=3001
   META_ACCESS_TOKEN=your_system_user_token
   FREESWITCH_HOST=your_ec2_ip
   FREESWITCH_SSH_KEY=/path/to/freeswitch.pem
   FREESWITCH_SSH_USER=ubuntu
   FREESWITCH_DOMAIN=sip.yourdomain.com
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```
   * Frontend: `http://localhost:3002` (or `http://localhost:3003`)
   * Backend API: `http://localhost:3001`

---

## 📁 Project Structure

```
superblock-voice/
├── server/
│   ├── server.js              # Express REST API, SIP WS proxy, and recordings manager
│   ├── freeswitch-esl.js      # FreeSWITCH Event Socket (ESL) & SSH management
│   ├── business-directory.js  # Tenant resolution & gateway mappings
│   ├── contacts.js            # Contact book & phone number normalization
│   └── scripts/               # Test scripts, template checkers, and recording sync
├── src/
│   ├── components/
│   │   ├── OutboundDialer.jsx # Multi-tenant dialer, presets, and permission flow
│   │   ├── SoftphoneBar.jsx   # Top status bar with WebRTC connection indicator
│   │   ├── CallMonitor.jsx    # Real-time inbound call HUD and Meta metadata
│   │   └── CallRecordingsSection.jsx # Audio player, download & folder sync UI
│   ├── hooks/
│   │   └── useWebRtcSoftphone.js # SIP.js WebRTC hook for browser audio
│   └── App.jsx
└── vite.config.mjs
```

---

## 🔒 Security Note

Never commit `.env`, private keys (`.pem`), or customer call recordings to version control. The `.gitignore` is pre-configured to keep credentials and tenant data safe.

---

## 📄 License

ISC License.
