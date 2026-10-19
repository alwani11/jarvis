# Jarvis

A voice assistant for Windows: a dry, witty British butler who keeps answers short, calls you "sir", thinks with **your Claude account**, and talks in **your Fish Audio voice**.

- Hold **Ctrl+Space** to talk (or hold the orb with your mouse), or just say **"Hey Jarvis"** for hands-free
- Knows the real date and time, and searches the web
- Glowing blue orb dashboard that reacts to your voice and his
- Taskbar icon + tray icon; starts automatically when you sign in to Windows (can be turned off in Settings)
- Gmail (read and **draft only**: he cannot send or delete), Google Calendar (read only), Spotify control

## Setup (about 10 minutes)

### 1. Install the basics
1. Install [Node.js](https://nodejs.org) (the LTS version).
2. Install **Claude Code** and sign in with your Claude account. This is Jarvis's brain, so no API key is needed:
   open PowerShell, run `npm install -g @anthropic-ai/claude-code`, then run `claude` once and log in. Type `/exit` when done.

### 2. Get Jarvis running
```
git clone <this repo's URL>
cd jarvis
npm install
npm start
```
The first launch downloads a small speech-recognition model (about 40 MB, once). The orb turns calm blue when he's ready.
Allow microphone access if Windows asks.

### 3. Add his voice (Settings, opens automatically the first time)
1. Create a free account at [fish.audio](https://fish.audio), open your account's API page and create an **API key**.
2. Open the voice you want, and copy its **ID** (the long code at the end of the voice's web address).
3. Paste both into Jarvis's **Settings**. The model is already set to the free `s2.1-pro-free`. Press **Save**.

Without a Fish key he still works, using a plain Windows voice.

### 4. Optional: Spotify (needs Spotify Premium)
1. Go to the [Spotify developer dashboard](https://developer.spotify.com/dashboard), create an app.
2. Add this Redirect URI exactly: `http://127.0.0.1:8888/callback`
3. Copy the app's **Client ID** into Jarvis's Settings, press **Connect Spotify** and approve in your browser.
4. Keep Spotify open on this PC (it needs an active player).

### 5. Optional: Gmail and Google Calendar
Google makes you create your own "app" for this. It is free and stays private to you.
1. Go to [Google Cloud Console](https://console.cloud.google.com), create a project.
2. **APIs & Services → Library**: enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen**: choose External, fill in the app name and your email, and add **your own Gmail address as a Test user**.
4. **Credentials → Create credentials → OAuth client ID → Desktop app**. Copy the **Client ID** and **Client secret** into Jarvis's Settings.
5. Press **Connect Google** and approve. Google will warn the app is unverified; that's expected, since it's yours.

Jarvis asks for: read Gmail, create Gmail drafts, read Calendar. He has no tool to send or delete email or change events, so he cannot, even if asked.

## Using him
| Do this | Result |
|---|---|
| Hold Ctrl+Space, speak, let go | He answers |
| Say "Hey Jarvis, what's on my calendar tomorrow?" | Hands-free (toggle on the left panel) |
| Say "Hey Jarvis" and pause | He listens for your next sentence |
| Close the window | He keeps running in the tray. Right-click the tray icon → Quit |

Try: "What time is it?", "Who won the match last night?", "Play Daft Punk", "Any unread email?", "Draft an email to Sam saying I'll be late."

## How it works (plain English)
- **Ears:** Your microphone → a small speech-to-text model that runs on your PC (nothing is sent anywhere).
- **Brain:** The text goes to Claude through the Claude Code program you logged into, with Jarvis's butler personality and the current date/time. Claude may search the web or use Gmail/Calendar/Spotify.
- **Voice:** Each sentence goes to Fish Audio as soon as it's written, so he starts talking quickly.
- **Orb:** Watches the loudness of your voice and his.
- Your keys and sign-ins are stored only in `%APPDATA%\jarvis` on your PC.

## Troubleshooting
- *"Claude Code was not found"*: re-do step 1.2, then restart Jarvis.
- *Hold-to-talk does nothing*: hold the orb with the mouse instead (the global hotkey needs a Windows permission some PCs block).
- *He answers slowly*: the first answer after launch is slowest. Speed depends on your internet.
- Run the checks: `npm test`. Build an installer: `npm run dist`.
