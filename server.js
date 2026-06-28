// 繪壇耆英 (Huitan Qiying) — Express + Socket.IO server
// Engineering Notes v3.1 — single-node deployment, in-memory room state.

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '8888'; // server.js:10 — see Security §14

// --- 1. Ensure required directories exist ---------------------------------
const DIRS = {
  public: path.join(__dirname, 'public'),
  linearts: path.join(__dirname, 'linearts'),
  uploads: path.join(__dirname, 'uploads'),
  elements: path.join(__dirname, 'elements'),
};
for (const dir of Object.values(DIRS)) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// --- 2. Multer disk storage with UTF-8 filename decoding -------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DIRS.linearts),
  filename: (req, file, cb) => {
    // Decode mojibake'd Chinese filenames (§16.2)
    const utf8Name = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, `${Date.now()}-${utf8Name}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB (Security §14.2 recommendation)
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(null, false);
  },
});

// --- 3. Middleware ---------------------------------------------------------
app.use(express.json());
app.use(express.static(DIRS.public));
app.use('/linearts', express.static(DIRS.linearts));

// --- 7. API specification --------------------------------------------------
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;

// 7.1 GET /api/linearts
app.get('/api/linearts', (req, res) => {
  fs.readdir(DIRS.linearts, (err, files) => {
    if (err) return res.json([]);
    res.json(files.filter((f) => IMAGE_RE.test(f)));
  });
});

// 7.2 POST /api/upload/lineart
app.post('/api/upload/lineart', upload.single('file'), (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD) {
    if (req.file) fs.unlink(path.join(DIRS.linearts, req.file.filename), () => {});
    return res.status(403).json({ success: false, msg: '密碼錯誤' });
  }
  if (!req.file) return res.status(400).json({ success: false, msg: '請選擇圖片檔案' });
  io.emit('refresh_linearts');
  res.json({ success: true });
});

// 7.3 POST /api/admin/delete/lineart
app.post('/api/admin/delete/lineart', (req, res) => {
  const { password, filename } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, msg: '密碼錯誤' });
  }
  // Path traversal guard
  if (!filename || filename.includes('/') || filename.includes('..') || filename.includes('\\')) {
    return res.status(400).json({ success: false, msg: '非法檔名' });
  }
  const target = path.join(DIRS.linearts, filename);
  fs.unlink(target, (err) => {
    if (err) return res.status(404).json({ success: false, msg: '檔案不存在' });
    io.emit('refresh_linearts');
    res.json({ success: true });
  });
});

// 7.4 POST /api/admin/check
app.post('/api/admin/check', (req, res) => {
  res.json({ success: req.body.password === ADMIN_PASSWORD });
});

// --- 5.2 / 12. In-memory room state & Socket.IO protocol -------------------
// rooms: { roomId: { id, bgImage, elements: [{id, img, x, y, width, date, metadata...}] } }
const rooms = {};

function makeRoomId() {
  let id;
  do {
    id = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms[id]);
  return id;
}

io.on('connection', (socket) => {
  // create_room { bgImage }
  socket.on('create_room', ({ bgImage } = {}) => {
    const roomId = makeRoomId();
    rooms[roomId] = { id: roomId, bgImage: bgImage || null, elements: [] };
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit('room_created', { roomId, bgImage: rooms[roomId].bgImage });
  });

  // join_room { roomId }
  socket.on('join_room', ({ roomId } = {}) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('error_msg', '找不到此房間號碼');
      return;
    }
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.emit('init_room', { id: room.id, bgImage: room.bgImage, elements: room.elements });
  });

  // add_element { roomId, image: dataURL } or { roomId, element }
  socket.on('add_element', ({ roomId, image, element } = {}) => {
    const room = rooms[roomId];
    if (!room || (!image && !element)) return;
    const source = element || {};
    const img = source.img || image;
    if (!img) return;
    const el = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      img,
      x: safePercent(source.x, 50),
      y: safePercent(source.y, 50),
      width: safeWidth(source.width, 30),
      date: source.date || chineseDate(),
      elementType: safeText(source.elementType, 30),
      elementName: safeText(source.elementName, 30),
      colorName: safeText(source.colorName, 20),
      colorHex: safeHex(source.colorHex),
      source: safeText(source.source, 20),
    };
    room.elements.push(el);
    io.to(roomId).emit('element_added', el);
  });

  // move_element { roomId, id, x, y }
  socket.on('move_element', ({ roomId, id, x, y } = {}) => {
    const room = rooms[roomId];
    if (!room) return;
    const el = room.elements.find((e) => e.id === id);
    if (!el) return;
    el.x = x;
    el.y = y;
    io.to(roomId).emit('element_moved', { id, x, y });
  });

  // resize_element { roomId, id, width }
  socket.on('resize_element', ({ roomId, id, width } = {}) => {
    const room = rooms[roomId];
    if (!room) return;
    const el = room.elements.find((e) => e.id === id);
    if (!el) return;
    el.width = width;
    io.to(roomId).emit('element_resized', { id, width });
  });

  // delete_element { roomId, id }
  socket.on('delete_element', ({ roomId, id } = {}) => {
    const room = rooms[roomId];
    if (!room) return;
    room.elements = room.elements.filter((e) => e.id !== id);
    io.to(roomId).emit('element_deleted', id);
  });

  // §共融 Phase 4: live cursor presence — x,y are canvas percentages (0-100),
  // kind is the input modality (touch | head | eye). Broadcast to room peers.
  socket.on('cursor', ({ roomId, x, y, kind, down } = {}) => {
    if (!roomId || !rooms[roomId]) return;
    socket.to(roomId).emit('peer_cursor', { id: socket.id, x, y, kind, down: !!down });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) socket.to(roomId).emit('peer_left', socket.id);
  });
});

// Chinese calendar date string, e.g. 二〇二六年六月十七日
function chineseDate(d = new Date()) {
  const digits = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const toCn = (n) => String(n).split('').map((c) => digits[+c]).join('');
  const monthCn = (m) => (m <= 10 ? (m === 10 ? '十' : digits[m]) : '十' + digits[m - 10]);
  const dayCn = (day) => {
    if (day <= 10) return day === 10 ? '十' : digits[day];
    if (day < 20) return '十' + digits[day - 10];
    if (day === 20) return '二十';
    if (day < 30) return '二十' + digits[day - 20];
    if (day === 30) return '三十';
    return '三十' + digits[day - 30];
  };
  return `${toCn(d.getFullYear())}年${monthCn(d.getMonth() + 1)}月${dayCn(d.getDate())}日`;
}

function safePercent(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}

function safeWidth(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(5, Math.min(90, n));
}

function safeText(v, max) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

function safeHex(v) {
  return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '';
}

server.listen(PORT, () => {
  console.log(`繪壇耆英 running at http://localhost:${PORT}`);
});
