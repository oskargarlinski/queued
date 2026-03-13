# Queued - Spotify Playlist Timeline

> Know exactly when every song plays.

Queued is a web app that turns any Spotify playlist into a precise clock timeline. Set a start time and instantly see the exact timestamp every track will play. Or flip it around - use **reverse mode** to target a specific song at a specific moment, and let Queued calculate when you need to hit play.

**[Live Demo →](https://queued-zeta.vercel.app)**

![Queued Screenshot](https://i.ibb.co/TMhLzDdS/Screenshot-2026-03-13-172402.png)
![Queued Demo](https://github.com/user-attachments/assets/2dad6c44-89cb-451e-8875-8b5335bd9ed0)

---

## What it does

Most playlist tools tell you the total duration. Queued tells you *when*. 

Pick a playlist, set a start time, and every track gets a real clock timestamp - down to the second. Useful for timing music to events, syncing a playlist to a journey, or just satisfying curiosity.

### Features

- **Browse or paste** - log in to browse your Spotify library, or paste any public playlist link directly
- **Forward timeline** - set a start time and see exact clock timestamps for every track
- **Visual scrubber** - proportional timeline bar showing every song as a block; hover for a tooltip with track name, artist, and clock time
- **Live NOW indicator** - a red line on the scrubber shows where the current time falls within the playlist
- **Reverse mode** - click any track, set the time you want it to play, and the start time recalculates automatically
- **Track offset** - in reverse mode, specify how far *into* a track to target (e.g. "I want to be 1:34 into this song at 9pm")
- **Handles any playlist length** - paginated API calls fetch all tracks regardless of playlist size

---

## How it works

### Tech stack

- **React + Vite** - frontend framework and build tool
- **Spotify Web API** - playlist and track data
- **OAuth 2.0 with PKCE** - secure authentication entirely in the browser, no backend required

### Authentication

Queued uses the [PKCE (Proof Key for Code Exchange)](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) flow - the recommended approach for client-side apps where a backend server isn't available. A random code verifier is generated, hashed with SHA-256, and sent alongside the auth request. Spotify verifies the hash when exchanging the code for an access token, ensuring the token can only be claimed by the original requester even if the auth code is intercepted.

Tokens are stored in `localStorage` and automatically refreshed before expiry - users stay logged in across sessions without re-authenticating.

### Timeline calculation

The core logic is straightforward: each track's play time is a cumulative sum of all previous track durations, added to the start time.

```
track[0].playTime = startTime
track[1].playTime = startTime + track[0].duration
track[2].playTime = startTime + track[0].duration + track[1].duration
...
track[n].playTime = startTime + sum(durations[0..n-1])
```

All calculations are done in milliseconds for precision, then formatted for display.

### Reverse mode

Given a target track and a desired clock time, the start time is derived by working backwards:

```
startTime = targetClockTime - track[n].elapsedMs - offsetMs
```

Where `elapsedMs` is the cumulative duration of all tracks before the target, and `offsetMs` is an optional position within the target track itself.

---

## Getting started

### Prerequisites

- Node.js 18+
- A [Spotify Developer account](https://developer.spotify.com/dashboard)

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/queued.git
cd queued
npm install
```

### 2. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Click **Create App**
3. Set a name and description
4. Add `http://127.0.0.1:3000` as a Redirect URI
5. Save and copy your **Client ID**

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and add your Client ID:

```
VITE_SPOTIFY_CLIENT_ID=your_client_id_here
```

### 4. Add yourself as a user

Spotify apps in development mode require explicit user allowlisting:

1. In your Spotify app dashboard → **Settings → User Management**
2. Add the email address of your Spotify account

### 5. Run

```bash
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

> **Note:** Use `127.0.0.1` not `localhost` - Spotify's OAuth requires an explicit loopback address.

---

## Deploying to Vercel

```bash
npm run build
```

1. Push your repo to GitHub
2. Import it at [vercel.com](https://vercel.com)
3. Add environment variables in Vercel project settings:
   ```
   VITE_SPOTIFY_CLIENT_ID=your_client_id_here
   VITE_REDIRECT_URI=https://your-app.vercel.app
   ```
4. In your Spotify Developer Dashboard, add `https://your-app.vercel.app` as an additional Redirect URI

Vercel will redeploy automatically on every push to `main`.

---

## Project structure

```
queued/
├── src/
│   ├── App.jsx          # All views and application logic
│   ├── spotify.js       # Spotify API calls and OAuth PKCE flow
│   ├── main.jsx         # React entry point
│   └── index.css        # All styles
├── index.html
├── vite.config.js
└── .env.example
```

---

## Limitations

- Spotify apps in **Development Mode** are limited to 25 allowlisted users. Extending to public access requires submitting for Spotify's quota extension review.
- Local playback is not controlled - Queued is a timeline calculator only, not a playback controller.
- Podcast episodes and locally added files may not return duration data from the API and are filtered out.
