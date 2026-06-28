/* ===========================================================================
   繪壇耆英 · script.js — all frontend logic
   Engineering Notes v3.1 · §6, §9, §10, §11, §12
   =========================================================================== */
(function () {
  'use strict';

  const socket = (typeof io !== 'undefined') ? io() : null;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // §4.1 Seal-pad palette colors
  const PRIMARY_COLORS = [
    { hex: '#b22222', name: '紅色' },
    { hex: '#000000', name: '黑色' },
    { hex: '#1e90ff', name: '藍色' },
  ];
  const SECONDARY_COLORS = [
    { hex: '#228b22', name: '綠色' },
    { hex: '#c9a227', name: '金色' },
    { hex: '#b83e2f', name: '朱砂' },
    { hex: '#6b4423', name: '檀木' },
    { hex: '#5a7d6c', name: '竹青' },
    { hex: '#ffffff', name: '白色' },
  ];

  const ZEN_PATTERNS = ['dot', 'grid', 'line', 'circle'];

  // §9.4 encouragement phrases
  const PRAISES = ['畫得真好！', '好有創意啊！', '這線條很美！', '很有藝術感！', '繼續加油！'];

  // ====================================================================== //
  //  Painter (§9)
  // ====================================================================== //
  const painter = {
    canvas: null,
    ctx: null,
    color: '#000000',
    lineWidth: 10,         // Fixed in v3.1
    tool: 'pen',           // 'pen' | 'zen' | 'eraser'
    mirrorMode: false,
    zenPatternIndex: 0,    // 0:dot 1:grid 2:line 3:circle
    isDrawing: false,
    lastPos: { x: 0, y: 0 },
    editing: false,
    filterEnabled: true,   // One Euro Filter anti-tremor (toggleable)
    pf: null,              // PointFilter instance

    init() {
      this.canvas = $('#paint-canvas');
      this.ctx = this.canvas.getContext('2d');
      // 預設 minCutoff 0.8 / beta 0.02 — 長者手震調校範圍 0.5–1.0 / 0.01–0.05
      this.pf = new PointFilter(0.8, 0.02);
      this.bindEvents();
      this.buildPalette();
    },

    pos(e) {
      const r = this.canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return {
        x: (cx / r.width) * this.canvas.width,
        y: (cy / r.height) * this.canvas.height,
      };
    },

    openCanvas() {
      this.editing = true;
      this.canvas.classList.add('editing');
      document.body.classList.add('drawing-active');
      $('#btn-pickup').hidden = true;
      $('#btn-finish').hidden = false;
      catLogic.say('開始畫啦，慢慢嚟～');
    },

    bindEvents() {
      // Touch/mouse is the first unified PointerSource. The drawing core only
      // listens to feed(), so new inputs (head tracking, etc.) just add a source.
      const self = this;
      this.source = new TouchMouseSource(
        this.canvas,
        (e) => self.pos(e),
        (signal) => self.feed(signal)
      );
    },

    // Unified input entry — every modality calls this with {x, y, action}.
    feed(signal) {
      if (!this.editing) return;
      if (signal.action === 'down') {
        this.isDrawing = true;
        if (this.filterEnabled && this.pf) this.pf.reset();
        this.lastPos = this.smooth(signal.x, signal.y);
        return;
      }
      if (signal.action === 'up') {
        if (this.isDrawing) this.endStroke();
        this.isDrawing = false;
        return;
      }
      // move
      if (!this.isDrawing) return;
      const p = this.smooth(signal.x, signal.y);
      this.line(this.lastPos, p);
      if (this.mirrorMode) {
        this.line(this.mirror(this.lastPos), this.mirror(p));
      }
      this.lastPos = p;
    },

    // Apply One Euro Filter when enabled; otherwise pass the raw coordinate.
    smooth(x, y) {
      if (this.filterEnabled && this.pf) return this.pf.filter(x, y);
      return { x: x, y: y };
    },

    setFilterEnabled(on) {
      this.filterEnabled = on;
      if (this.pf) this.pf.reset();
    },

    mirror(p) { return { x: this.canvas.width - p.x, y: p.y }; },

    // §9.2 tool implementation — v3.1 solid-color strokes, no physics
    line(from, to) {
      const ctx = this.ctx;
      if (this.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = this.lineWidth * 2.2;
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.lineWidth;
      }
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (this.tool === 'zen') {
        this.drawZen(from, to);
      } else {
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }
    },

    drawZen(from, to) {
      const ctx = this.ctx;
      const pattern = ZEN_PATTERNS[this.zenPatternIndex];
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.color;
      const steps = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y) / 14);
      for (let i = 0; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        ctx.beginPath();
        if (pattern === 'dot') {
          ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        } else if (pattern === 'grid') {
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 5, y - 5, 10, 10);
        } else if (pattern === 'line') {
          ctx.lineWidth = 3;
          ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke();
        } else { // circle
          ctx.lineWidth = 2;
          ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
        }
      }
    },

    endStroke() {
      // §9.4 30% probability voice praise
      if (Math.random() < 0.3) catLogic.say(PRAISES[Math.floor(Math.random() * PRAISES.length)]);
    },

    setTool(tool) {
      if (tool === 'mirror') { this.toggleMirror(); return; }
      if (tool === 'zen' && this.tool === 'zen') {
        // tap cycles patterns
        this.zenPatternIndex = (this.zenPatternIndex + 1) % ZEN_PATTERNS.length;
        catLogic.say('禪繞圖案：' + ZEN_PATTERNS[this.zenPatternIndex]);
      }
      this.tool = tool;
      $$('.tool-item[data-tool]').forEach((el) =>
        el.classList.toggle('active', el.dataset.tool === tool));
    },

    toggleMirror() {
      this.mirrorMode = !this.mirrorMode;
      $('.tool-item[data-tool="mirror"]').classList.toggle('active', this.mirrorMode);
      catLogic.say(this.mirrorMode ? '鏡子打開咗' : '鏡子閂咗');
    },

    setColor(hex) {
      this.color = hex;
      $$('.ink-pad').forEach((p) => p.classList.toggle('selected', p.dataset.hex === hex));
    },

    clear() {
      if (!confirm('確定要清空畫布嗎？')) return;
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      $('.canvas-stack').classList.add('cleared');
      catLogic.say('清乾淨啦！');
    },

    buildPalette() {
      const box = $('#palette');
      const make = (c, cls) => {
        const pad = document.createElement('button');
        pad.className = 'ink-pad ' + cls;
        pad.dataset.hex = c.hex;
        pad.title = c.name;
        pad.style.background = `radial-gradient(circle at 35% 30%, ${shade(c.hex, 40)}, ${c.hex} 70%, ${shade(c.hex, -25)})`;
        pad.addEventListener('click', () => {
          pad.classList.remove('splash'); void pad.offsetWidth; pad.classList.add('splash');
          this.setColor(c.hex);
        });
        return pad;
      };
      PRIMARY_COLORS.forEach((c) => box.appendChild(make(c, 'primary')));
      SECONDARY_COLORS.forEach((c) => box.appendChild(make(c, 'secondary')));
      // custom color picker
      const custom = document.createElement('label');
      custom.className = 'ink-pad custom';
      custom.title = '自選顏色';
      const inp = document.createElement('input');
      inp.type = 'color'; inp.value = '#000000';
      inp.addEventListener('input', () => this.setColor(inp.value));
      custom.appendChild(inp);
      box.appendChild(custom);
      this.setColor('#000000');
    },
  };

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const clamp = (v) => Math.max(0, Math.min(255, v));
    const r = clamp((n >> 16) + amt), g = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
    return `rgb(${r},${g},${b})`;
  }

  // ====================================================================== //
  //  Cat voice assistant (§11)
  // ====================================================================== //
  const catLogic = {
    cat: null, bubble: null, idleTimer: null, recognition: null, listening: false,

    init() {
      this.cat = $('#cat');
      this.bubble = $('#cat-bubble');
      this.cat.addEventListener('click', () => this.onClick());
      document.addEventListener('mousemove', (e) => this.trackPupils(e));
      this.resetIdle();
      this.setupRecognition();
    },

    say(text, speak = true) {
      this.bubble.textContent = text;
      this.bubble.hidden = false;
      clearTimeout(this._bubbleTimer);
      this._bubbleTimer = setTimeout(() => { this.bubble.hidden = true; }, 3500);
      if (speak && 'speechSynthesis' in window) {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'zh-HK';
        u.rate = 0.9; // slower for senior comprehension
        speechSynthesis.speak(u);
      }
      this.resetIdle();
    },

    onClick() {
      this.cat.classList.remove('sleeping');
      this.cat.classList.add('clicked');
      setTimeout(() => this.cat.classList.remove('clicked'), 300);
      this.startListening();
    },

    trackPupils(e) {
      const r = this.cat.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
      const dx = Math.cos(ang) * 3, dy = Math.sin(ang) * 3;
      $$('.pupil').forEach((p) => { p.style.transform = `translate(${dx}px, ${dy}px)`; });
    },

    resetIdle() {
      clearTimeout(this.idleTimer);
      this.cat.classList.remove('sleeping');
      this.idleTimer = setTimeout(() => this.cat.classList.add('sleeping'), 30000);
    },

    setupRecognition() {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      this.recognition = new SR();
      this.recognition.lang = 'zh-HK';
      this.recognition.continuous = true;
      this.recognition.interimResults = false;
      this.recognition.onresult = (ev) => {
        const text = ev.results[ev.results.length - 1][0].transcript;
        this.handleVoice(text);
      };
      this.recognition.onend = () => { this.stopListening(); };
    },

    startListening() {
      if (!this.recognition) { this.say('呢部裝置唔支援聲控喔'); return; }
      if (this.listening) return;
      this.listening = true;
      this.cat.classList.add('listening');
      this.say('我聽緊你講…', false);
      // 1.2s delayed start so we don't record our own prompt
      setTimeout(() => {
        try { this.recognition.start(); } catch (e) { /* already started */ }
      }, 1200);
      // 5s countdown
      let n = 5;
      this._count = setInterval(() => {
        n--;
        if (n <= 0) { clearInterval(this._count); this.stopListening(); }
      }, 1000);
    },

    stopListening() {
      this.listening = false;
      this.cat.classList.remove('listening');
      clearInterval(this._count);
      try { this.recognition && this.recognition.stop(); } catch (e) {}
    },

    // §11.3 voice command mapping
    handleVoice(raw) {
      const t = raw.toLowerCase();
      const has = (...keys) => keys.some((k) => t.includes(k));

      if (has('多人', 'group', 'multi')) return app.switchMode('multi');
      if (has('單人', 'single', '自己')) return app.switchMode('single');
      if (has('掌櫃', 'admin')) return app.switchMode('admin');
      if (has('離開', 'exit', 'quit')) return location.reload();

      if (has('筆', 'pen', 'draw')) { painter.setTool('pen'); return this.say('用毛筆'); }
      if (has('擦', 'eraser', 'rubber')) { painter.setTool('eraser'); return this.say('用擦膠'); }
      if (has('禪', 'zen', 'pattern')) { painter.setTool('zen'); return this.say('用禪繞筆'); }
      if (has('鏡', 'mirror')) { painter.toggleMirror(); return; }

      if (has('紅色', 'red')) { painter.setColor('#b22222'); return this.say('紅色'); }
      if (has('黑色', 'black')) { painter.setColor('#000000'); return this.say('黑色'); }
      if (has('藍色', 'blue')) { painter.setColor('#1e90ff'); return this.say('藍色'); }
      if (has('綠色', 'green')) { painter.setColor('#228b22'); return this.say('綠色'); }
      if (has('白色', 'white')) { painter.setColor('#ffffff'); return this.say('白色'); }

      if (has('清空', '全部刪除', 'clear')) return painter.clear();
      if (has('保存', '存圖', 'save')) return app.downloadCanvas();
      if (has('換圖', '線稿', 'lineart')) return app.switchMode('single');
      if (has('變大', '放大', 'bigger')) return board.resizeSelected(1.15);
      if (has('變小', '縮小', 'smaller')) return board.resizeSelected(0.87);
      if (has('完', '好', 'finish', 'ok')) return app.finishDrawing();

      this.say('唔好意思，我聽唔明～');
    },
  };

  // ====================================================================== //
  //  Board element system (§10) + multiplayer (§12)
  // ====================================================================== //
  const board = {
    layer: null,
    roomId: null,        // null = single mode
    selected: null,

    init() { this.layer = $('#elements-layer'); },

    isMulti() { return this.roomId !== null; },

    addElement(el) {
      const node = document.createElement('div');
      node.className = 'board-element';
      node.dataset.id = el.id;
      node.style.left = el.x + '%';
      node.style.top = el.y + '%';
      node.style.width = el.width + '%';
      node.innerHTML = ''; // build via DOM, avoid XSS (§14.2)
      const img = document.createElement('img');
      img.src = el.img;
      img.alt = '作品';
      const handle = document.createElement('div');
      handle.className = 'resize-handle';
      node.appendChild(img);
      node.appendChild(handle);
      this.bindElement(node, handle, el);
      this.layer.appendChild(node);
    },

    bindElement(node, handle, data) {
      let startX, startY, origX, origY, moved, pressTimer, resizing;

      const id = Number(node.dataset.id);

      const down = (e) => {
        if (e.target === handle) { startResize(e); return; }
        e.preventDefault();
        moved = false;
        const pt = pointer(e);
        startX = pt.x; startY = pt.y;
        origX = parseFloat(node.style.left); origY = parseFloat(node.style.top);
        // long-press (0.4s) => delete
        pressTimer = setTimeout(() => {
          if (!moved) node.classList.add('pressing');
        }, 150);
        this._holdTimer = setTimeout(() => { if (!moved) this.deleteElement(id); }, 400);
        document.addEventListener('mousemove', mv);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', mv, { passive: false });
        document.addEventListener('touchend', up);
      };

      const mv = (e) => {
        const pt = pointer(e);
        const dx = pt.x - startX, dy = pt.y - startY;
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          // cancels long-press; >5px => drag
          clearTimeout(this._holdTimer);
          node.classList.remove('pressing');
          moved = true;
          const rect = this.layer.getBoundingClientRect();
          node.style.left = (origX + (dx / rect.width) * 100) + '%';
          node.style.top = (origY + (dy / rect.height) * 100) + '%';
        }
      };

      const up = () => {
        clearTimeout(pressTimer); clearTimeout(this._holdTimer);
        node.classList.remove('pressing');
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
        document.removeEventListener('touchmove', mv);
        document.removeEventListener('touchend', up);
        if (!moved) {
          this.select(node);
        } else {
          const x = parseFloat(node.style.left), y = parseFloat(node.style.top);
          if (this.isMulti()) socket.emit('move_element', { roomId: this.roomId, id, x, y });
        }
      };

      const startResize = (e) => {
        e.preventDefault(); e.stopPropagation();
        resizing = true;
        const rect = this.layer.getBoundingClientRect();
        const onMove = (ev) => {
          const pt = pointer(ev);
          const center = node.getBoundingClientRect();
          const newW = ((pt.x - center.left) / rect.width) * 100 * 2;
          if (newW > 5) node.style.width = newW + '%';
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          document.removeEventListener('touchmove', onMove);
          document.removeEventListener('touchend', onUp);
          if (this.isMulti()) socket.emit('resize_element', { roomId: this.roomId, id, width: parseFloat(node.style.width) });
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
      };

      node.addEventListener('mousedown', down);
      node.addEventListener('touchstart', down, { passive: false });
    },

    select(node) {
      if (this.selected) this.selected.classList.remove('resizable-active');
      this.selected = node;
      node.classList.add('resizable-active');
    },

    deselect() {
      if (this.selected) this.selected.classList.remove('resizable-active');
      this.selected = null;
    },

    resizeSelected(factor) {
      if (!this.selected) return;
      const w = parseFloat(this.selected.style.width) * factor;
      this.selected.style.width = w + '%';
      if (this.isMulti()) socket.emit('resize_element', { roomId: this.roomId, id: Number(this.selected.dataset.id), width: w });
    },

    deleteElement(id) {
      if (!confirm('確定要刪除這件作品嗎？')) return;
      if (this.isMulti()) { socket.emit('delete_element', { roomId: this.roomId, id }); return; }
      this.removeNode(id);
    },

    removeNode(id) {
      const node = this.layer.querySelector(`[data-id="${id}"]`);
      if (node) node.remove();
      if (this.selected && Number(this.selected.dataset.id) === id) this.selected = null;
    },

    moveNode(id, x, y) {
      const node = this.layer.querySelector(`[data-id="${id}"]`);
      if (node) { node.style.left = x + '%'; node.style.top = y + '%'; }
    },

    resizeNode(id, width) {
      const node = this.layer.querySelector(`[data-id="${id}"]`);
      if (node) node.style.width = width + '%';
    },

    clearAll() { this.layer.innerHTML = ''; this.selected = null; },
  };

  function pointer(e) {
    return e.touches
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY };
  }

  // ====================================================================== //
  //  App controller (§6 navigation, gallery, ceremony, localStorage)
  // ====================================================================== //
  const app = {
    mode: 'single',

    init() {
      painter.init();
      catLogic.init();
      board.init();
      this.bindNav();
      this.bindBoard();
      this.bindAdmin();
      this.bindMulti();
      this.loadLineartsInto('#single-canvas-grid', true);
      this.renderMyWorks();
      this.bindSocket();
    },

    bindNav() {
      $$('.nav-tab').forEach((tab) =>
        tab.addEventListener('click', () => this.switchMode(tab.dataset.mode)));
      $$('.back-btn[data-mode]').forEach((b) =>
        b.addEventListener('click', () => this.switchMode(b.dataset.mode)));
    },

    switchMode(mode) {
      this.mode = mode;
      $$('.nav-tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
      const map = {
        single: '#screen-single-home',
        multi: '#screen-multi-entry',
        admin: '#screen-admin',
      };
      this.showScreen(map[mode]);
    },

    showScreen(id) {
      $$('.screen').forEach((s) => s.classList.toggle('active', '#' + s.id === id));
    },

    // ----- board lifecycle ------------------------------------------------
    bindBoard() {
      $$('.tool-item').forEach((item) => {
        item.addEventListener('click', () => {
          if (item.dataset.action === 'clear') return painter.clear();
          painter.setTool(item.dataset.tool);
        });
      });
      $('#window-latch').addEventListener('click', () => painter.clear());
      $('#btn-pickup').addEventListener('click', () => painter.openCanvas());
      $('#btn-finish').addEventListener('click', () => this.finishDrawing());
      $('#btn-leave-board').addEventListener('click', () => {
        board.roomId = null;
        this.switchMode(this.mode === 'multi' ? 'multi' : 'single');
      });
      $('#elements-layer').addEventListener('mousedown', (e) => {
        if (e.target.id === 'elements-layer') board.deselect();
      });

      // 防手震 (One Euro Filter) on/off switch
      const fb = $('#btn-filter');
      const syncFilterBtn = () => {
        const on = painter.filterEnabled;
        fb.classList.toggle('on', on);
        fb.setAttribute('aria-checked', on ? 'true' : 'false');
      };
      fb.addEventListener('click', () => {
        painter.setFilterEnabled(!painter.filterEnabled);
        syncFilterBtn();
        catLogic.say(painter.filterEnabled ? '防手震開咗，畫線會順滑啲' : '防手震閂咗');
      });
      syncFilterBtn();

      // 頭部 / 視線操控 toggles (mutually exclusive)
      $('#btn-head').addEventListener('click', () => this.toggleHead());
      $('#btn-eye').addEventListener('click', () => this.toggleEye());
    },

    // ---- 共融替代輸入：頭部 / 視線（互斥，共用游標）----
    stopHead() {
      if (this.headSource) { this.headSource.stop(); this.headSource = null; }
      const hb = $('#btn-head');
      hb.classList.remove('on'); hb.setAttribute('aria-checked', 'false');
      $('#head-cam-wrap').hidden = true;
    },

    stopEye() {
      if (this.eyeSource) { this.eyeSource.stop(); this.eyeSource = null; }
      const eb = $('#btn-eye');
      eb.classList.remove('on'); eb.setAttribute('aria-checked', 'false');
    },

    hideCursorIfIdle() {
      if (!this.headSource && !this.eyeSource) $('#head-cursor').hidden = true;
    },

    toggleHead() {
      if (this.headSource) { this.stopHead(); this.hideCursorIfIdle(); catLogic.say('頭部操控閂咗'); return; }
      if (!window.HeadSource || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('呢部裝置／瀏覽器唔支援頭部操控（需要鏡頭）'); return;
      }
      this.stopEye(); // mutually exclusive
      const canvas = painter.canvas, cursor = $('#head-cursor'), hb = $('#btn-head');
      this.headSource = new HeadSource({
        rect: () => canvas.getBoundingClientRect(),
        canvasW: canvas.width, canvasH: canvas.height,
        cursor, ring: $('#head-ring'), video: $('#head-cam'),
        emit: (sig) => painter.feed(sig),
        dwellMs: 1000, dwellRadius: 22, gain: 1.7,
        onState: (down) => catLogic.say(down ? '落筆喇，郁下個頭去畫' : '提起筆喇'),
      });
      if (!painter.editing) painter.openCanvas();
      hb.classList.add('on'); hb.setAttribute('aria-checked', 'true');
      cursor.hidden = false; $('#head-cam-wrap').hidden = false;
      catLogic.say('開緊鏡頭，望住畫面郁下個頭嚟控制');
      this.headSource.start().catch((err) => {
        this.stopHead(); this.hideCursorIfIdle();
        alert('無法開啟鏡頭：' + (err && err.message ? err.message : err));
      });
    },

    toggleEye() {
      if (this.eyeSource) { this.stopEye(); this.hideCursorIfIdle(); catLogic.say('視線操控閂咗'); return; }
      if (!window.EyeSource || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('呢部裝置／瀏覽器唔支援視線操控（需要鏡頭）'); return;
      }
      this.stopHead(); // mutually exclusive
      const canvas = painter.canvas, cursor = $('#head-cursor'), eb = $('#btn-eye');
      this.eyeSource = new EyeSource({
        rect: () => canvas.getBoundingClientRect(),
        canvasW: canvas.width, canvasH: canvas.height,
        cursor, ring: $('#head-ring'),
        emit: (sig) => painter.feed(sig),
        dwellMs: 1100, dwellRadius: 45,
        onState: (down) => catLogic.say(down ? '落筆喇，望住邊度就畫邊度' : '提起筆喇'),
      });
      if (!painter.editing) painter.openCanvas();
      eb.classList.add('on'); eb.setAttribute('aria-checked', 'true');
      cursor.hidden = false;
      catLogic.say('視線操控係實驗功能，開緊鏡頭，望住畫面試下');
      this.eyeSource.start().catch((err) => {
        this.stopEye(); this.hideCursorIfIdle();
        alert('無法開啟視線操控：' + (err && err.message ? err.message : err));
      });
    },

    openBoard(bgImage) {
      board.clearAll();
      painter.ctx.clearRect(0, 0, painter.canvas.width, painter.canvas.height);
      const bg = $('#board-bg');
      if (bgImage) { bg.src = bgImage; bg.hidden = false; }
      else { bg.hidden = true; }
      $('#btn-pickup').hidden = false;
      $('#btn-finish').hidden = true;
      painter.editing = false;
      painter.canvas.classList.remove('editing');
      $('#room-banner').hidden = !board.isMulti();
      this.showScreen('#screen-board');
    },

    // §9.3 finishing workflow
    finishDrawing() {
      if (!painter.editing) return;
      const dataURL = painter.canvas.toDataURL('image/png');
      this.playSealCeremony(() => {
        const el = {
          id: Date.now(),
          img: dataURL,
          x: 50, y: 50, width: 40,
          date: chineseDate(),
        };
        if (board.isMulti()) {
          socket.emit('add_element', { roomId: board.roomId, image: dataURL });
        } else {
          board.addElement(el);
          this.saveWork(dataURL, el.date);
        }
        painter.ctx.clearRect(0, 0, painter.canvas.width, painter.canvas.height);
        painter.editing = false;
        painter.canvas.classList.remove('editing');
        document.body.classList.remove('drawing-active');
        $('#btn-finish').hidden = true;
        $('#btn-pickup').hidden = false;
        catLogic.say('封存好啦，真係好靚！');
      });
    },

    // §4.3.8 seal ceremony
    playSealCeremony(done) {
      const overlay = $('#seal-ceremony');
      overlay.hidden = false;
      const paper = overlay.querySelector('.scroll-paper');
      const stamp = overlay.querySelector('.seal-stamp');
      paper.style.animation = 'none'; stamp.style.animation = 'none';
      void paper.offsetWidth;
      paper.style.animation = '';
      stamp.style.animation = '';
      setTimeout(() => { overlay.hidden = true; if (done) done(); }, 2100);
    },

    downloadCanvas() {
      const a = document.createElement('a');
      a.href = painter.canvas.toDataURL('image/png');
      a.download = `繪壇耆英-${Date.now()}.png`;
      a.click();
      catLogic.say('已經幫你存圖喇');
    },

    // ----- §9.5 localStorage personal gallery -----------------------------
    saveWork(dataURL, date) {
      const works = JSON.parse(localStorage.getItem('myWorks') || '[]');
      works.unshift({ img: dataURL, date, ts: Date.now() });
      localStorage.setItem('myWorks', JSON.stringify(works.slice(0, 60)));
      this.renderMyWorks();
    },

    renderMyWorks() {
      const grid = $('#my-works-grid');
      const works = JSON.parse(localStorage.getItem('myWorks') || '[]');
      grid.innerHTML = '';
      if (!works.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.style.color = 'var(--mountain-mist)';
        p.textContent = '仲未有作品，揀張紙開始畫啦～';
        grid.appendChild(p);
        return;
      }
      works.forEach((w) => {
        const card = document.createElement('div');
        card.className = 'gallery-card';
        const img = document.createElement('img');
        img.src = w.img;
        const date = document.createElement('div');
        date.className = 'card-date';
        date.textContent = w.date;
        card.appendChild(img);
        card.appendChild(date);
        grid.appendChild(card);
      });
    },

    // ----- line-art gallery ----------------------------------------------
    loadLineartsInto(gridSel, withBlank) {
      const grid = $(gridSel);
      fetch('/api/linearts')
        .then((r) => r.json())
        .then((files) => {
          grid.innerHTML = '';
          if (withBlank) grid.appendChild(this.blankCard());
          files.forEach((f) => grid.appendChild(this.lineartCard(f)));
        })
        .catch(() => { grid.innerHTML = ''; if (withBlank) grid.appendChild(this.blankCard()); });
    },

    blankCard() {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const label = document.createElement('span');
      label.className = 'blank-label';
      label.textContent = '＋ 空白宣紙';
      card.appendChild(label);
      card.addEventListener('click', () => {
        if (this.mode === 'multi') this.createRoom(null);
        else this.openBoard(null);
      });
      return card;
    },

    lineartCard(filename) {
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const img = document.createElement('img');
      img.src = '/linearts/' + encodeURIComponent(filename);
      card.appendChild(img);
      card.addEventListener('click', () => {
        const src = '/linearts/' + encodeURIComponent(filename);
        if (this.mode === 'multi') this.createRoom(src);
        else this.openBoard(src);
      });
      return card;
    },

    // ----- §12 multiplayer ------------------------------------------------
    bindMulti() {
      $('#btn-new-room').addEventListener('click', () => {
        this.showScreen('#screen-multi-gallery');
        this.loadLineartsInto('#multi-canvas-grid', true);
      });
      $('#btn-join-room').addEventListener('click', () => {
        const code = $('#room-code-input').value.trim();
        if (!/^\d{4}$/.test(code)) { alert('請輸入四位數字房間號碼'); return; }
        if (socket) socket.emit('join_room', { roomId: code });
      });
    },

    createRoom(bgImage) {
      if (!socket) { alert('需要連線伺服器才可開房'); return; }
      this._pendingBg = bgImage;
      socket.emit('create_room', { bgImage });
    },

    // ----- §13 admin ------------------------------------------------------
    bindAdmin() {
      $('#btn-admin-login').addEventListener('click', () => {
        const pass = $('#admin-pass').value;
        fetch('/api/admin/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: pass }),
        })
          .then((r) => r.json())
          .then((res) => {
            if (res.success) {
              this._adminPass = pass;
              $('#admin-login').hidden = true;
              $('#admin-panel').hidden = false;
              this.renderAdminLinearts();
            } else {
              $('#admin-hint').textContent = '密碼錯誤';
            }
          });
      });

      $('#upload-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const file = $('#lineart-file').files[0];
        if (!file) { $('#upload-status').textContent = '請先揀圖片'; return; }
        const fd = new FormData();
        fd.append('file', file);
        fd.append('password', this._adminPass);
        $('#upload-status').textContent = '上傳中…';
        fetch('/api/upload/lineart', { method: 'POST', body: fd })
          .then((r) => r.json())
          .then((res) => {
            $('#upload-status').textContent = res.success ? '上傳成功！' : (res.msg || '上傳失敗');
            if (res.success) { $('#lineart-file').value = ''; this.renderAdminLinearts(); }
          });
      });
    },

    renderAdminLinearts() {
      const grid = $('#admin-lineart-grid');
      fetch('/api/linearts').then((r) => r.json()).then((files) => {
        grid.innerHTML = '';
        files.forEach((f) => {
          const card = document.createElement('div');
          card.className = 'gallery-card';
          const img = document.createElement('img');
          img.src = '/linearts/' + encodeURIComponent(f);
          const del = document.createElement('button');
          del.className = 'del-badge';
          del.textContent = '×';
          del.addEventListener('click', () => this.deleteLineart(f));
          card.appendChild(img);
          card.appendChild(del);
          grid.appendChild(card);
        });
      });
    },

    deleteLineart(filename) {
      if (!confirm('確定刪除「' + filename + '」？')) return;
      fetch('/api/admin/delete/lineart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this._adminPass, filename }),
      })
        .then((r) => r.json())
        .then((res) => { if (res.success) this.renderAdminLinearts(); else alert(res.msg || '刪除失敗'); });
    },

    // ----- §8 socket events ----------------------------------------------
    bindSocket() {
      if (!socket) return;

      socket.on('room_created', ({ roomId, bgImage }) => {
        board.roomId = roomId;
        $('#room-id-label').textContent = roomId;
        this.openBoard(bgImage);
        catLogic.say('開房成功，號碼係 ' + roomId.split('').join(' '));
      });

      socket.on('init_room', ({ id, bgImage, elements }) => {
        board.roomId = id;
        $('#room-id-label').textContent = id;
        this.openBoard(bgImage);
        elements.forEach((el) => board.addElement(el));
        catLogic.say('加入咗房間 ' + id);
      });

      socket.on('element_added', (el) => {
        board.addElement(el);
        if (board.isMulti()) this.showCompletionBanner();
      });
      socket.on('element_moved', ({ id, x, y }) => board.moveNode(id, x, y));
      socket.on('element_resized', ({ id, width }) => board.resizeNode(id, width));
      socket.on('element_deleted', (id) => board.removeNode(id));
      socket.on('error_msg', (msg) => alert(msg));
      socket.on('refresh_linearts', () => {
        this.loadLineartsInto('#single-canvas-grid', true);
        if (!$('#admin-panel').hidden) this.renderAdminLinearts();
      });
    },

    showCompletionBanner() {
      const b = $('#completion-banner');
      b.hidden = false;
      clearTimeout(this._bannerTimer);
      this._bannerTimer = setTimeout(() => { b.hidden = true; }, 3000);
    },
  };

  // Chinese calendar date (client-side mirror of server util)
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

  document.addEventListener('DOMContentLoaded', () => app.init());
})();
