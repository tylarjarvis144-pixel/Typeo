# Jarvis

An AI that runs your house. Talk or type to it ("Good night", "Is anyone at the front door?", "Make it 72") and it controls your lights, locks, garage, cameras, thermostat and alarm through **Home Assistant**.

```
You (phone / voice) → Jarvis (Claude) → Home Assistant → your devices
```

Until Home Assistant is set up, Jarvis runs a **simulated house**, so you can try everything now.

## Safety

- **Unlocking a door, opening the garage and disarming the alarm never happen automatically.** Jarvis asks, and you approve in the app with your PIN. Approvals expire after 2 minutes. Five wrong PINs lock approvals for 5 minutes.
- Locking, closing and arming happen right away, because they make the house safer.
- Every action shows up in the Activity list and in the server log.
- Jarvis has no login of its own: anyone on your home Wi-Fi can open it and switch lights, but they still can't unlock anything without the PIN. **Don't port-forward it to the internet.** To use it away from home, use [Tailscale](https://tailscale.com) (free) or a VPN.

## 1. Try it now (simulated house)

You need [Node.js 22+](https://nodejs.org) and an Anthropic API key from [console.anthropic.com](https://console.anthropic.com).

```bash
cd jarvis
npm install
cp .env.example .env     # then edit .env: add your API key and choose a PIN
npm start
```

Open http://localhost:3000. On your phone, open `http://<your-computer's-IP>:3000` while on the same Wi-Fi.

## 2. Install Home Assistant

The easiest options:

- **Home Assistant Green** (about $130): a small box you plug into your router. Nothing to install.
- **Raspberry Pi 4 or 5**: flash Home Assistant OS with the [Raspberry Pi Imager](https://www.home-assistant.io/installation/raspberrypi).
- **An old PC or laptop**: [install guide](https://www.home-assistant.io/installation/).

Once it boots, open http://homeassistant.local:8123 and create your account.

## 3. Move your Google Home devices into Home Assistant

Home Assistant doesn't "import" Google Home. It talks to each device directly, which is faster and works even if Google's servers are down. In Home Assistant, go to **Settings → Devices & services → Add integration**:

| What you have in Google Home | Integration to add in Home Assistant |
|---|---|
| Nest thermostat, Nest cameras, Nest doorbell | **Google Nest** (needs Google's one-time $5 Device Access fee; the guide walks you through it) |
| Nest speakers / displays, Chromecast | **Google Cast** (usually found automatically) |
| Matter devices (look for the Matter logo) | In the Google Home app: device → Settings → **Linked Matter apps & services** → add Home Assistant |
| Other smart bulbs, plugs, locks, cameras | Search for the brand: Philips Hue, TP-Link Kasa, Wyze, Ring, Yale, August, Schlage, Eufy, etc. |

You can keep using "Hey Google" too: both can control the same devices.

**Tip:** give devices clear names in Home Assistant ("Front Door", "Kitchen Lights"). Jarvis uses those names.

## 4. Connect Jarvis to Home Assistant

1. In Home Assistant, click your profile (bottom left) → **Security** → **Long-lived access tokens** → **Create token**. Copy it.
2. Edit `jarvis/.env`:
   ```
   HA_URL=http://homeassistant.local:8123
   HA_TOKEN=paste-the-token-here
   ```
3. If your alarm panel needs a code, set `ALARM_CODE` too.
4. Restart Jarvis (`npm start`). The header should say **Home Assistant** instead of **Simulated house**.

Run Jarvis on a computer in your house (a spare PC, laptop or Raspberry Pi), because it needs to reach Home Assistant on your network.

## What Jarvis can do

| Ask | What happens |
|---|---|
| "Turn on the kitchen lights at 40%" | Runs right away |
| "Lock the back door" / "Close the garage" | Runs right away |
| "Unlock the front door" / "Open the garage" | Waits for your PIN |
| "Arm the alarm" / "Disarm the alarm" | Arming runs right away; disarming waits for your PIN |
| "Make it 72" / "Turn the heat off" | Thermostat |
| "Is anyone at the front door?" | Takes a camera snapshot, shows it to you, and describes it |
| "Good night" / "I'm leaving" | A routine: locks up, lights off, arms the alarm |
| "Are all the doors locked?" | Checks and tells you |

Tap 🎙 to talk (Chrome, Edge or Safari) and 🔈 to have Jarvis read its replies aloud.

## Files

- `server.js`: web server and the conversation with Claude
- `tools.js`: the actions Jarvis can take, and the PIN safety gate
- `devices.js`: Home Assistant connection plus the simulated house
- `public/index.html`: the app you open on your phone
