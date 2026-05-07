# 🎬 Consistent Creator

A free, browser-based video recorder built for creators who want to post reels consistently — without the studio setup.

**[→ Try it live](https://consistent-creator.vercel.app)**

---

## The Problem

You want to post reels on Instagram, YouTube, and LinkedIn consistently. But you don't want to:

- Set up a camera or tripod
- Pull out your phone and prop it up
- Deal with lighting rigs
- Sit in a "studio" setting

You just want to open your laptop and hit record. But Photo Booth doesn't give you aspect ratio control, and your reels end up looking terrible.

## The Solution

**Consistent Creator** turns your webcam into a reel-ready recording studio.

Open the link → pick your aspect ratio → hit record → download your MP4.

Everything runs in your browser. Nothing is uploaded. Nothing is stored.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Aspect Ratios** | 9:16 (Reels), 16:9 (YouTube), 3:4 (Threads), 1:1 (Square) |
| **Video Effects** | Brightness, contrast, zoom — baked directly into the recording |
| **Filters** | Dim, Warm, Cool, B&W — applied in real-time |
| **MP4 Export** | Records natively as MP4 in Chrome 120+ — ready to upload anywhere |
| **Camera Flip** | Switch between front and back cameras |
| **Pause/Resume** | Pause mid-recording without splitting files |
| **100% Client-Side** | No server, no uploads, no tracking. Your videos never leave your device |

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Recording** | Canvas API + MediaRecorder (MP4 via H.264) |
| **Effects** | Canvas 2D filters (brightness, contrast, zoom, color grading) |
| **Email Gate** | Supabase REST API (waitlist collection) |
| **Hosting** | Vercel (static deployment) |
| **Design** | Custom dark theme with oklch color system |

**Zero dependencies in production.** No React. No build step. No bundler.

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────┐
│                  Browser                     │
│                                              │
│  getUserMedia → Video Track → Canvas         │
│                                │              │
│                         drawImage() loop     │
│                     (applies filters, zoom)  │
│                                │              │
│                    captureStream() → MP4     │
│                                │              │
│                         Download blob        │
└─────────────────────────────────────────────┘
```

**How recording works:**

1. Camera feed → `<video>` element (preview)
2. Each frame drawn to an offscreen `<canvas>` with effects applied
3. Canvas stream captured via `captureStream()`
4. `MediaRecorder` encodes as MP4 (Chrome) or WebM (fallback)
5. Final file downloaded directly to your machine

**Camera management:**

Mac webcams only natively support 16:9 (landscape) and 9:16 (portrait) modes. For other aspect ratios (3:4, 1:1), the camera stays in its closest native mode and CSS `object-fit: cover` handles the visual crop.

---

## 🚀 Deploy Your Own

### Static Deployment (Vercel)

```bash
# Clone the repo
git clone https://github.com/nikhilgurramm/consistent-creator.git
cd consistent-creator

# Deploy to Vercel
npx vercel --prod
```

The `vercel.json` is pre-configured:
- **Output directory:** `public/`
- **Framework:** None (static)
- **Build command:** None

### Local Development

For local development with server-side FFmpeg conversion:

```bash
# Install dependencies (server-only)
npm install

# Start the dev server
node server.js

# Open http://localhost:3847
```

The app auto-detects the environment:
- **localhost** → Uses server-side FFmpeg for MP4 conversion
- **Deployed** → Uses native browser MP4 recording

---

## 📁 Project Structure

```
consistent-creator/
├── public/
│   ├── index.html      # Main app — email gate, sidebar, preview, controls
│   ├── app.js           # Core logic — camera, recording, effects, download
│   ├── style.css        # Full design system — dark theme, animations
│   └── logo.png         # Brand logo
├── vercel.json          # Vercel deployment config
├── server.js            # Local dev server (not deployed)
└── README.md
```

---

## 🎨 Design System

The UI uses a custom dark theme built on oklch colors:

| Token | Value | Usage |
|---|---|---|
| `--bg` | `oklch(0.13 0.01 260)` | Page background |
| `--surface-1` | `oklch(0.17 0.012 260)` | Cards, panels |
| `--accent` | `oklch(0.72 0.25 330)` | Magenta accent — buttons, active states |
| `--accent-glow` | `oklch(0.72 0.25 330 / 0.3)` | Subtle glow effects |
| `--text` | `oklch(0.95 0 0)` | Primary text |

Typography: [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts.

---

## 🔒 Privacy

- **No server processing** — all recording and conversion happens in your browser
- **No uploads** — your video files are never sent anywhere
- **No tracking** — no analytics, no cookies (beyond localStorage for email gate)
- **Email collection** — only used for product update notifications via Supabase
- **Open source** — inspect every line of code yourself

---

## 🤝 Contributing

This is an open-source side project. Contributions welcome:

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add your feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

### Ideas for contributions:
- [ ] Countdown timer before recording starts
- [ ] Video trimming before export
- [ ] Custom watermark overlay
- [ ] Background blur / virtual backgrounds
- [ ] Audio-only recording mode

---

## 📄 License

MIT — use it, fork it, ship it.

---

**Built in one sitting by [@nikhilgurramm](https://github.com/nikhilgurramm)** ☕️
