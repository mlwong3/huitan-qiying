# 繪壇耆英 (Huitan Qiying) — Maintenance Guide

A real-time collaborative digital painting platform for elderly users, built to the
Engineering Notes v3.1 spec. New Chinese Style aesthetic, vanilla frontend, Node/Express
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
│   ├── style.css    # New Chinese Style palette + 8 signature designs
│   └── script.js    # painter / catLogic / board / app modules
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

## Notes
- Rooms are in-memory only; lost on restart (§5.2). Personal works persist via localStorage.
- Voice uses Web Speech API (zh-HK); Recognition is Chrome/Edge/Safari only.
- Chinese upload filenames decoded via `Buffer.from(name,'latin1').toString('utf8')` (§16.2).
- Security: hardcoded password, plaintext transmission — prototype only (§14).
