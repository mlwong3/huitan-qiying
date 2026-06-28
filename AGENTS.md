# 繪壇耆英 (Huitan Qiying) — Maintenance Guide

A real-time inclusive digital creation platform for elderly users and people with
different abilities. New Chinese Style aesthetic, vanilla frontend, Node/Express
+ Socket.IO backend with in-memory room state.

## Run locally
```bash
npm install
npm start          # http://localhost:3000
```
Admin password defaults to `8888` (override with `ADMIN_PASSWORD` env var).

## Structure
```
huitan-qiying/
├── server.js        # Express + Socket.IO + Multer (API + realtime)
├── package.json
├── public/
│   ├── index.html   # SPA: 5 screens (single-home, multi-entry, multi-gallery, board, admin)
│   ├── style.css    # New Chinese Style palette + entry screens + board UI
│   ├── pointerSources.js # touch/mouse pointer input layer
│   ├── assets/      # Figma-exported entry background
│   └── script.js    # painter / scanController / feedbackLayer / board / app modules
├── linearts/        # uploaded line-art (gitignored, .gitkeep tracked)
├── elements/        # reserved
└── uploads/         # reserved scratch
```

## Common modification points (§16.1)
| Task | Files | Key functions |
| --- | --- | --- |
| Canvas logic | `public/script.js` | `painter.init/openCanvas/line/setTool/endStroke` |
| Multiplayer | `server.js`, `public/script.js` | Socket.IO listeners/emitters, `app.bindSocket` |
| New API endpoint | `server.js` | add route; check admin password for protected ones |
| Admin password | `server.js` (`ADMIN_PASSWORD`) | env var |
| Voice command | `public/script.js` | `catLogic.handleVoice` |
| Cat appearance | `style.css`, `script.js` | `.cat` classes, `catLogic` timers |
| Seal ceremony | `style.css`, `script.js` | keyframes, `app.playSealCeremony` |
| Single-switch creation | `public/script.js`, `style.css` | `scanController`, `assistiveInput`, `app.placeScanElement` |
| Feedback layer | `public/script.js` | `feedbackLayer.say/tone` |
| Tactile export | `public/script.js` | `app.exportTactile/buildTactileOutput` |
| Entry screens | `public/index.html`, `style.css` | `.portal-screen`, `.portal-card`, `--figma-entry-bg` |

## Notes
- Rooms are in-memory only; lost on restart (§5.2). Personal works persist via localStorage.
- Voice uses Web Speech API (zh-HK); Recognition is Chrome/Edge/Safari only.
- Chinese upload filenames decoded via `Buffer.from(name,'latin1').toString('utf8')` (§16.2).
- Head-tracking and eye-tracking controls are removed from the core UI. The accessibility
  baseline is ability matching: free drawing, anti-tremor drawing, single-switch scanning,
  speech/sonification feedback, tactile export, and family co-creation.
- The three entry screens use `public/assets/figma-new-chinese-bg.png` as a full-bleed
  Figma-exported New Chinese Style background. Keep entry text, buttons, inputs, and cards
  as real HTML/CSS elements. Do not apply this portal styling to the board internals.
- ESP32 joystick integration should call `window.huitanAssistiveInput.move(dx, dy)`,
  `confirm()`, and `back()`. Keyboard arrow keys are the current fallback.
- Security: hardcoded password, plaintext transmission — prototype only (§14).

## Cloud Run deployment
Existing public service:
`https://huitan-qiying-705615272136.asia-east1.run.app`

Known prior deployment flags:
```bash
gcloud run deploy huitan-qiying \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --session-affinity \
  --max-instances 1 \
  --timeout 3600
```
