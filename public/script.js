/* ===========================================================================
   繪畫耆才 · script.js — all frontend logic
   Engineering Notes v3.1 · §6, §9, §10, §11, §12
   =========================================================================== */
(function () {
  'use strict';

  const socket = (typeof io !== 'undefined') ? io() : null;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // §4.1 顏色盤 — 12 色相色環（每 30° 一格）＋白＋黑，另有自選顏色（見 buildPalette）
  const WHEEL_COLORS = [
    { hex: '#d84c4c', name: '紅' },
    { hex: '#e0883c', name: '橙' },
    { hex: '#e8c24a', name: '黃' },
    { hex: '#a7d24b', name: '黃綠' },
    { hex: '#5cbb5c', name: '綠' },
    { hex: '#45c08a', name: '青綠' },
    { hex: '#46bcc6', name: '青' },
    { hex: '#4a9ad8', name: '天藍' },
    { hex: '#4f6ccf', name: '藍' },
    { hex: '#7d5ecf', name: '靛' },
    { hex: '#b552cf', name: '紫' },
    { hex: '#d5548f', name: '桃紅' },
  ];
  const NEUTRAL_COLORS = [
    { hex: '#ffffff', name: '白色' },
    { hex: '#000000', name: '黑色' },
  ];

  const ZEN_PATTERNS = ['dot', 'grid', 'line', 'circle'];

  // §共融: input-modality labels + stable per-peer colour
  const INPUT_LABELS = { touch: '觸控', scan: '單鍵' };
  function peerColor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return 'hsl(' + h + ', 62%, 45%)';
  }

  // §9.4 encouragement phrases
  const PRAISES = ['畫得真好！', '好有創意啊！', '這線條很美！', '很有藝術感！', '繼續加油！'];

  const SCAN_ELEMENTS = [
    { key: 'flower', name: '花朵', short: '花' },
    { key: 'leaf', name: '葉子', short: '葉' },
    { key: 'circle', name: '圓形', short: '圓' },
    { key: 'line', name: '線條', short: '線' },
    { key: 'seal', name: '印章', short: '印' },
    { key: 'cloud', name: '雲朵', short: '雲' },
    { key: 'blossom', name: '小花', short: '蕾' },
    { key: 'house', name: '屋仔', short: '屋' },
    { key: 'person', name: '人仔', short: '人' },
    { key: 'tree', name: '大樹', short: '樹' },
  ];

  const SCAN_COLORS = [
    { key: 'red', name: '紅色', hex: '#b22222', tone: 196 },
    { key: 'blue', name: '藍色', hex: '#1e90ff', tone: 880 },
    { key: 'green', name: '綠色', hex: '#228b22', tone: 440 },
    { key: 'black', name: '黑色', hex: '#000000', tone: 110 },
    { key: 'gold', name: '金色', hex: '#c9a227', tone: 1046 },
  ];

  // 圖示大小（單鍵創作第三步）：以畫布百分比表示，用搖桿／方向鍵嘅上（放大）
  // 下（縮細）即時調校，Enter／空白鍵確認。
  const SCAN_SIZE_DEFAULT = 18;  // 圖示寬度預設 18%（畫布百分比）
  const SCAN_SIZE_MIN = 6;
  const SCAN_SIZE_MAX = 60;

  const JOYSTICK_STEP = 6;
  const JOYSTICK_FINE_STEP = 2;
  const DEFAULT_SCAN_POSITION = { key: 'free', x: 50, y: 50, name: '畫面中央' };
  // 「選圖元」步驟未揀顏色時，圖示用呢個中性墨色顯示形狀。
  const ELEMENT_PREVIEW_HEX = '#4a3728';

  // ====================================================================== //
  //  Painter (§9)
  // ====================================================================== //
  const painter = {
    canvas: null,
    ctx: null,
    color: '#000000',
    lineWidth: 10,         // 粗幼滑桿 #brush-size 調節（4–28）
    tool: 'pen',           // 'pen' | 'zen' | 'eraser'
    mirrorMode: false,
    zenPatternIndex: 0,    // 0:dot 1:grid 2:line 3:circle
    isDrawing: false,
    lastPos: { x: 0, y: 0 },
    editing: false,
    filterEnabled: true,   // One Euro Filter anti-tremor (toggleable)
    pf: null,              // PointFilter instance
    history: [],           // undo stack of canvas snapshots (local strokes only)
    HISTORY_MAX: 20,       // cap so 20 大筆 don't eat memory

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
      this.resetHistory();  // 新畫紙／新一張作品：清空復原紀錄
      $('#btn-finish').hidden = false;
      catLogic.say('開始畫啦，慢慢嚟～');
    },

    // §9.x 復原 (undo) — snapshot-based, LOCAL single-user strokes only.
    // 共繪 (multi) 房間透過 socket 繪畫，分散式復原太複雜，故在多人模式停用。
    pushHistory() {
      if (board.isMulti()) return;   // 多人模式不記錄本地復原
      try {
        this.history.push(this.canvas.toDataURL('image/png'));
        if (this.history.length > this.HISTORY_MAX) this.history.shift();
        this.syncUndoButton();
      } catch (e) { /* toDataURL 可能受污染，忽略即可 */ }
    },

    resetHistory() {
      this.history = [];
      this.syncUndoButton();
    },

    undo() {
      if (board.isMulti()) return;   // 多人模式無本地復原
      if (!this.history.length) {
        feedbackLayer.say('冇得再復原喇');
        return;
      }
      const snapshot = this.history.pop();
      const img = new Image();
      img.onload = () => {
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        this.syncUndoButton();
      };
      img.src = snapshot;
      feedbackLayer.say('已復原一筆');
    },

    // 多人模式隱藏復原掣；單人模式按有無紀錄調暗
    syncUndoButton() {
      const btn = $('#tool-undo');
      if (!btn) return;
      btn.hidden = board.isMulti();
      btn.classList.toggle('disabled', !this.history.length);
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
        // 每一筆開始前先拍低快照，供「復原」回退
        this.pushHistory();
        if (this.filterEnabled && this.pf) this.pf.reset();
        this.lastPos = this.smooth(signal.x, signal.y);
        if (this.onMove) this.onMove(this.lastPos, true);
        return;
      }
      if (signal.action === 'up') {
        if (this.isDrawing) this.endStroke();
        this.isDrawing = false;
        if (this.onMove) this.onMove(this.lastPos, false);
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
      if (this.onMove) this.onMove(p, true);
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
      this.pushHistory();   // 清空前拍快照，令「清空」都可以復原
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      $('.canvas-stack').classList.add('cleared');
      catLogic.say('清乾淨啦！');
      this.syncUndoButton();
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
      WHEEL_COLORS.forEach((c) => box.appendChild(make(c, 'primary')));
      NEUTRAL_COLORS.forEach((c) => box.appendChild(make(c, 'primary')));
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

  function numberLabel(n) {
    return ['零', '第一', '第二', '第三', '第四'][n] || String(n);
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

      if (has('復原', '返轉頭', 'undo')) return painter.undo();
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
  //  Feedback layer: speech + simple colour sonification
  // ====================================================================== //
  const feedbackLayer = {
    audioCtx: null,

    say(text, speak = true) {
      catLogic.say(text, speak);
    },

    tone(colorKey) {
      const color = SCAN_COLORS.find((c) => c.key === colorKey);
      if (!color) return;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!this.audioCtx) this.audioCtx = new Ctx();
        const ctx = this.audioCtx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = color.key === 'black' ? 'sine' : 'triangle';
        osc.frequency.value = color.tone;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch (e) {
        // Audio feedback is optional; speech remains the primary cue.
      }
    },
  };

  // ====================================================================== //
  //  Assistive input manager: one-switch intents for scanning mode
  // ====================================================================== //
  const assistiveInput = {
    init() {
      document.addEventListener('keydown', (e) => {
        if (!scanController.active) return;
        const arrows = {
          ArrowUp: { dx: 0, dy: -1 },
          ArrowDown: { dx: 0, dy: 1 },
          ArrowLeft: { dx: -1, dy: 0 },
          ArrowRight: { dx: 1, dy: 0 },
        };
        if (arrows[e.key]) {
          e.preventDefault();
          const unit = e.shiftKey ? JOYSTICK_FINE_STEP : JOYSTICK_STEP;
          this.emit({
            type: 'move',
            dx: arrows[e.key].dx * unit,
            dy: arrows[e.key].dy * unit,
            source: 'keyboard',
          });
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          this.emit({ type: 'confirm', source: 'keyboard' });
        } else if (e.key === 'Escape' || e.key === 'Backspace') {
          e.preventDefault();
          this.emit({ type: 'back', source: 'keyboard' });
        }
      });

      document.addEventListener('click', (e) => {
        if (!scanController.active) return;
        if (e.target.closest('#btn-scan-mode')) return;
        if (e.target.closest('.scan-option, #scan-confirm')) return;
        if (e.target.closest('#scan-panel, .canvas-stack')) {
          e.preventDefault();
          this.emit({ type: 'confirm', source: 'pointer' });
        }
      }, true);
    },

    emit(intent) {
      if (scanController.active) scanController.handleIntent(intent);
    },
  };

  window.huitanAssistiveInput = {
    move(dx, dy) { assistiveInput.emit({ type: 'move', dx, dy, source: 'external' }); },
    confirm() { assistiveInput.emit({ type: 'confirm', source: 'external' }); },
    back() { assistiveInput.emit({ type: 'back', source: 'external' }); },
    command(name) { assistiveInput.emit({ type: 'command', command: name, source: 'external' }); },
  };

  // ====================================================================== //
  //  Single-switch scanning + element creation mode
  // ====================================================================== //
  const scanController = {
    active: false,
    stepIndex: 0,
    optionIndex: 0,
    timer: null,
    selections: {},
    placement: { x: 50, y: 50 },
    sizePercent: SCAN_SIZE_DEFAULT,
    steps: ['element', 'color', 'size', 'position'],
    stepNames: {
      element: '選圖元',
      color: '選顏色',
      size: '選大小',
      position: '選位置',
    },

    init() {
      this.panel = $('#scan-panel');
      this.optionsBox = $('#scan-options');
      this.stepLabel = $('#scan-step-label');
      this.hint = $('#scan-hint');
      this.preview = $('#scan-placement-preview');
      $('#scan-confirm').addEventListener('click', () => this.handleIntent({ type: 'confirm', source: 'button' }));
    },

    start() {
      this.active = true;
      this.stepIndex = 0;
      this.optionIndex = 0;
      this.selections = {};
      this.placement = { x: DEFAULT_SCAN_POSITION.x, y: DEFAULT_SCAN_POSITION.y };
      this.sizePercent = SCAN_SIZE_DEFAULT;
      this.panel.hidden = false;
      document.body.classList.add('scan-active');
      this.syncButton();
      this.render();
      this.restartTimer();
      feedbackLayer.say('單鍵創作開始。掃描揀圖元同顏色，再用上下（搖桿或方向鍵）調大小、用方向鍵控制位置，按空白鍵或 Enter 確認。');
    },

    stop(announce = true) {
      this.active = false;
      clearInterval(this.timer);
      this.timer = null;
      this.panel.hidden = true;
      this.hidePlacementPreview();
      document.body.classList.remove('scan-active');
      this.syncButton();
      if (announce) feedbackLayer.say('單鍵創作已關閉');
    },

    toggle() {
      if (this.active) this.stop();
      else this.start();
    },

    syncButton() {
      const btn = $('#btn-scan-mode');
      btn.classList.toggle('on', this.active);
      btn.setAttribute('aria-checked', this.active ? 'true' : 'false');
    },

    restartTimer() {
      clearInterval(this.timer);
      // 'size' 同 'position' 都係手動連續調校（搖桿上下／方向鍵），唔自動輪播。
      if (this.currentStep() === 'position' || this.currentStep() === 'size') {
        this.timer = null;
        return;
      }
      this.timer = setInterval(() => this.next(), 1450);
    },

    next() {
      const options = this.optionsForStep();
      if (!options.length) return;
      this.optionIndex = (this.optionIndex + 1) % options.length;
      this.render();
    },

    handleIntent(intent) {
      if (intent.type === 'back') return this.back();
      if (intent.type === 'next') return this.next();
      if (intent.type === 'move') {
        // 'size' 步驟：上（dy<0）放大、下（dy>0）縮細；其餘（position）郁動位置。
        if (this.currentStep() === 'size') return this.adjustSize(-(Number(intent.dy) || 0));
        return this.movePlacement(intent.dx, intent.dy);
      }
      if (intent.type === 'confirm') return this.confirmCurrent();
    },

    back() {
      if (this.stepIndex === 0) return this.stop();
      this.stepIndex -= 1;
      this.optionIndex = 0;
      this.render();
      this.restartTimer();
      feedbackLayer.say('返回' + this.stepNames[this.currentStep()]);
    },

    currentStep() {
      return this.steps[this.stepIndex];
    },

    optionsForStep() {
      const step = this.currentStep();
      if (step === 'element') return SCAN_ELEMENTS;
      if (step === 'color') return SCAN_COLORS;
      // size / position: 冇卡片選項，靠搖桿／方向鍵連續調校（見 adjustSize / movePlacement）
      return [];
    },

    render() {
      const step = this.currentStep();
      const options = this.optionsForStep();
      this.stepLabel.textContent = this.stepNames[step];
      this.hint.textContent =
        step === 'position' ? '用方向鍵移動圖示，Enter／空白鍵確認位置'
        : step === 'size' ? '用上／下（搖桿或方向鍵）調校大小，Enter／空白鍵確認'
        : '按空白鍵、Enter 或點擊畫面確認';
      this.optionsBox.innerHTML = '';
      this.optionsBox.className = 'scan-options scan-step-' + step;

      if (step === 'size') {
        // 冇卡片——顯示目前大小百分比 + 置中預覽，靠搖桿／方向鍵上下調校。
        const readout = document.createElement('p');
        readout.className = 'scan-size-readout';
        readout.textContent = '目前大小：' + Math.round(this.sizePercent) + '%';
        this.optionsBox.appendChild(readout);
        this.showPlacementPreview();
        return;
      }

      if (step === 'position') {
        // 冇按鈕、冇座標文字——淨係靠方向鍵／點擊畫面郁動同確認（見上面 hint），
        // 咁樣先唔會搶走畫布高度（§6.3）。
        this.showPlacementPreview();
        return;
      }

      this.hidePlacementPreview();

      options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'scan-option';
        btn.classList.toggle('active', i === this.optionIndex);
        btn.dataset.key = opt.key;
        btn.type = 'button';
        btn.appendChild(this.optionVisual(step, opt));
        const label = document.createElement('span');
        label.textContent = opt.name;
        btn.appendChild(label);
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          this.optionIndex = i;
          this.confirmCurrent();
        });
        this.optionsBox.appendChild(btn);
      });
    },

    // 只有 'element'／'color' 兩步會行到呢度（size/position 喺 render() 已經 return）。
    optionVisual(step, opt) {
      const visual = document.createElement('span');
      visual.className = 'scan-visual';
      if (step === 'color') {
        visual.classList.add('color');
        visual.style.background = opt.hex;
        return visual;
      }
      // element：顯示真正圖示形狀（唔再用圓圈加字），令使用者一睇就知係咩形狀。
      visual.classList.add('icon');
      visual.style.backgroundImage = 'url("' + elementDataUrl(opt.key, ELEMENT_PREVIEW_HEX) + '")';
      return visual;
    },

    confirmCurrent() {
      const step = this.currentStep();
      const option = this.optionsForStep()[this.optionIndex];
      // 'size'／'position' 冇卡片選項，唔需要 option 都可以確認。
      if (!option && step !== 'position' && step !== 'size') return;

      if (step === 'element') {
        this.selections.element = option;
        feedbackLayer.say('你選擇了' + option.name);
        return this.advance();
      }
      if (step === 'color') {
        this.selections.color = option;
        feedbackLayer.tone(option.key);
        feedbackLayer.say('你選擇了' + option.name);
        return this.advance();
      }
      if (step === 'size') {
        this.selections.sizePercent = Math.round(this.sizePercent);
        feedbackLayer.say('大小 ' + Math.round(this.sizePercent) + '%');
        return this.advance();
      }
      if (step === 'position') {
        // 確認位置即刻放置圖元，唔使再多一步「確認放置」（§6.3）。
        this.selections.position = this.currentPosition();
        app.placeScanElement(this.selections);
        this.stepIndex = 0;
        this.optionIndex = 0;
        this.selections = {};
        this.placement = { x: DEFAULT_SCAN_POSITION.x, y: DEFAULT_SCAN_POSITION.y };
        this.hidePlacementPreview();
        this.render();
        this.restartTimer();
      }
    },

    advance() {
      this.stepIndex = Math.min(this.stepIndex + 1, this.steps.length - 1);
      this.optionIndex = 0;
      this.render();
      this.restartTimer();
    },

    // 搖桿／方向鍵上下調校圖示大小（畫布百分比）。delta > 0 放大、< 0 縮細。
    adjustSize(delta) {
      if (this.currentStep() !== 'size') return;
      this.sizePercent = Math.max(SCAN_SIZE_MIN, Math.min(SCAN_SIZE_MAX, this.sizePercent + (Number(delta) || 0)));
      this.render();
      feedbackLayer.say('大小 ' + Math.round(this.sizePercent) + '%', false);
    },

    movePlacement(dx, dy) {
      if (this.currentStep() !== 'position') return;
      const nextX = Math.max(6, Math.min(94, this.placement.x + (Number(dx) || 0)));
      const nextY = Math.max(6, Math.min(94, this.placement.y + (Number(dy) || 0)));
      this.placement = { x: nextX, y: nextY };
      this.render();
      feedbackLayer.say(this.currentPosition().name, false);
    },

    currentPosition() {
      const x = Math.round(this.placement.x);
      const y = Math.round(this.placement.y);
      const horizontal = x < 34 ? '左方' : x > 66 ? '右方' : '中央';
      const vertical = y < 34 ? '上方' : y > 66 ? '下方' : '中間';
      return {
        key: 'free-' + x + '-' + y,
        x,
        y,
        name: vertical + horizontal + '，X ' + x + '，Y ' + y,
      };
    },

    showPlacementPreview() {
      if (!this.preview || !this.selections.element || !this.selections.color) return;
      this.preview.hidden = false;
      this.preview.style.left = this.placement.x + '%';
      this.preview.style.top = this.placement.y + '%';
      // 預覽尺寸跟返目前調校嘅百分比，令「所見即所得」（同 placeScanElement 一致）。
      this.preview.style.width = this.sizePercent + '%';
      this.preview.style.backgroundImage = 'url("' + elementDataUrl(this.selections.element.key, this.selections.color.hex) + '")';
      this.preview.setAttribute('aria-label', this.currentPosition().name);
    },

    hidePlacementPreview() {
      if (!this.preview) return;
      this.preview.hidden = true;
      this.preview.style.backgroundImage = '';
    },
  };

  // 使用者提供嘅相片式線稿圖示（見 photo/ 原圖）：先裁走浮水印、再用亮度
  // 二值化轉成透明背景嘅黑線 PNG（scratchpad/process_icons.js），存喺
  // public/assets/icons/。SVG 內嘅 <image> 引用外部檔案喺「純圖片 context」
  // （即成個 SVG 本身被當做 <img src>／canvas 圖片用）入面會被瀏覽器擋（安全
  // 限制，唔准夾帶嘅 SVG 再發額外請求），所以要喺 app 初始化時攞一次 PNG bytes、
  // 轉做 base64 快取落嚟，之後先夾入去每次生成嘅 SVG（自成一體、唔使再發request）。
  const RASTER_ICON_PATHS = {
    cloud: '/assets/icons/cloud.png',
    blossom: '/assets/icons/blossom.png',
    house: '/assets/icons/house.png',
    person: '/assets/icons/person.png',
    tree: '/assets/icons/tree.png',
  };
  const rasterIconCache = {}; // key -> base64 (no "data:" prefix), filled by preloadRasterIcons()

  function preloadRasterIcons() {
    return Promise.all(Object.keys(RASTER_ICON_PATHS).map((key) =>
      fetch(RASTER_ICON_PATHS[key])
        .then((r) => r.blob())
        .then((blob) => new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            rasterIconCache[key] = String(reader.result).split(',')[1];
            resolve();
          };
          reader.readAsDataURL(blob);
        }))
        .catch(() => { /* 離線／載入失敗：揀呢個圖元時會 fallback 做圓形 */ })
    ));
  }

  function hexToUnit(hex) {
    const n = parseInt(hex.slice(1), 16);
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  function elementDataUrl(type, color) {
    const safeColor = color || '#000000';
    const svg = elementSvg(type, safeColor);
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function elementSvg(type, color) {
    if (RASTER_ICON_PATHS[type] && rasterIconCache[type]) {
      const c = hexToUnit(color);
      const matrix = [
        '0 0 0 0 ' + c.r,
        '0 0 0 0 ' + c.g,
        '0 0 0 0 ' + c.b,
        '0 0 0 1 0',
      ].join('  ');
      return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
        '<defs><filter id="tint" color-interpolation-filters="sRGB">' +
        '<feColorMatrix type="matrix" values="' + matrix + '"/>' +
        '</filter></defs>' +
        '<image href="data:image/png;base64,' + rasterIconCache[type] + '" width="200" height="200" filter="url(#tint)"/>' +
        '</svg>';
    }
    const stroke = color === '#000000' ? '#1a1a1a' : shade(color, -25);
    const common = 'fill="' + color + '" stroke="' + stroke + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"';
    let body = '';
    if (type === 'flower') {
      body = [
        '<circle cx="100" cy="55" r="34" ' + common + '/>',
        '<circle cx="145" cy="100" r="34" ' + common + '/>',
        '<circle cx="100" cy="145" r="34" ' + common + '/>',
        '<circle cx="55" cy="100" r="34" ' + common + '/>',
        '<circle cx="100" cy="100" r="28" fill="#f7f3e9" stroke="' + stroke + '" stroke-width="7"/>',
      ].join('');
    } else if (type === 'leaf') {
      body = '<path d="M30 120 C58 42 142 22 174 72 C150 154 68 174 30 120 Z" ' + common + '/><path d="M44 122 C82 104 120 84 164 70" fill="none" stroke="#f7f3e9" stroke-width="8" stroke-linecap="round"/>';
    } else if (type === 'circle') {
      body = '<circle cx="100" cy="100" r="70" fill="none" stroke="' + color + '" stroke-width="18"/><circle cx="100" cy="100" r="38" fill="' + color + '" opacity="0.38"/>';
    } else if (type === 'line') {
      body = '<path d="M34 136 C66 56 126 154 166 66" fill="none" stroke="' + color + '" stroke-width="20" stroke-linecap="round"/>';
    } else {
      body = '<rect x="38" y="38" width="124" height="124" rx="12" ' + common + '/><text x="100" y="118" text-anchor="middle" font-size="64" font-family="serif" fill="#f7f3e9">福</text>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' + body + '</svg>';
  }

  function ensureImageReady(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  function drawContainedImage(ctx, img, w, h) {
    const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

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
      node.dataset.elementType = el.elementType || '';
      node.dataset.elementName = el.elementName || '作品';
      node.dataset.colorName = el.colorName || '';
      node.dataset.colorHex = el.colorHex || '';
      node.dataset.source = el.source || 'drawing';
      node.style.left = el.x + '%';
      node.style.top = el.y + '%';
      node.style.width = el.width + '%';
      node.innerHTML = ''; // build via DOM, avoid XSS (§14.2)
      const img = document.createElement('img');
      img.src = el.img;
      img.alt = [el.colorName, el.elementName].filter(Boolean).join('') || '作品';
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
      this.currentInputKind = 'touch';
      preloadRasterIcons();  // 相片式圖示 base64 快取，唔使阻住其餘初始化
      painter.init();
      painter.onMove = (p, down) => this.emitCursor(p, down);
      catLogic.init();
      board.init();
      scanController.init();
      assistiveInput.init();
      this.bindNav();
      this.bindBoard();
      this.bindAdmin();
      this.bindMulti();
      this.loadLineartsInto('#single-canvas-grid', true);
      this.renderMyWorks();
      this.renderMyRooms();
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
          if (item.dataset.action === 'undo') return painter.undo();
          if (item.dataset.action === 'clear') return painter.clear();
          painter.setTool(item.dataset.tool);
        });
      });
      $('#window-latch').addEventListener('click', () => painter.clear());
      $('#btn-finish').addEventListener('click', () => this.finishDrawing());
      $('#btn-scan-mode').addEventListener('click', () => scanController.toggle());
      $('#btn-leave-board').addEventListener('click', () => this.leaveBoard());
      $('#btn-change-lineart').addEventListener('click', () => this.leaveBoard());
      $('#btn-save-image').addEventListener('click', () => this.saveImage());
      $('#brush-size').addEventListener('input', (e) => {
        painter.lineWidth = parseInt(e.target.value, 10);
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
    },

    // ---- §共融 Phase 4: live cursor presence in 共繪 ----
    emitCursor(p, down) {
      if (!socket || !board.isMulti()) return;
      const now = performance.now();
      if (now - (this._lastCursorEmit || 0) < 60) return; // throttle ~16/s
      this._lastCursorEmit = now;
      socket.emit('cursor', {
        roomId: board.roomId,
        x: (p.x / painter.canvas.width) * 100,
        y: (p.y / painter.canvas.height) * 100,
        kind: this.currentInputKind,
        down: !!down,
      });
    },

    onPeerCursor(d) {
      const layer = $('#peer-cursors');
      let el = layer.querySelector('[data-peer="' + d.id + '"]');
      if (!el) {
        el = document.createElement('div');
        el.className = 'peer-cursor';
        el.dataset.peer = d.id;
        el.style.background = peerColor(d.id);
        const label = document.createElement('span');
        label.className = 'peer-label';
        el.appendChild(label);
        layer.appendChild(el);
      }
      el.style.left = d.x + '%';
      el.style.top = d.y + '%';
      el.classList.toggle('down', d.down);
      el.querySelector('.peer-label').textContent = INPUT_LABELS[d.kind] || '夥伴';
      clearTimeout(el._idle);
      el._idle = setTimeout(() => el.remove(), 4000); // drop stale cursors
    },

    removePeer(id) {
      const el = $('#peer-cursors').querySelector('[data-peer="' + id + '"]');
      if (el) el.remove();
    },

    clearPeers() { $('#peer-cursors').innerHTML = ''; },

    openBoard(bgImage) {
      board.clearAll();
      painter.ctx.clearRect(0, 0, painter.canvas.width, painter.canvas.height);
      const bg = $('#board-bg');
      if (bgImage) {
        // Line-art is served same-origin (see storage.js), but request it as an
        // anonymous CORS image anyway so the canvas never taints even if a future
        // source is cross-origin — keeps 封存作品 / 保存圖片 working with 畫紙.
        bg.crossOrigin = 'anonymous';
        bg.src = bgImage;
        bg.hidden = false;
      } else {
        bg.hidden = true;
      }
      painter.openCanvas();  // 提筆步驟已取消：一開板即可直接畫
      $('#room-banner').hidden = !board.isMulti();
      this.showScreen('#screen-board');
    },

    // Shared by 返回觀賞 (sidebar) and 換線稿 (canvas toolbar) — both leave the
    // current board back to the paper/gallery entry for the active mode.
    leaveBoard() {
      scanController.stop(false);
      board.roomId = null;
      this.switchMode(this.mode === 'multi' ? 'multi' : 'single');
    },

    placeScanElement(selection) {
      const element = selection.element;
      const color = selection.color;
      const position = selection.position;
      if (!element || !color || !position) return;

      // 大小由使用者用搖桿／方向鍵上下調校（畫布百分比），見 scanController.adjustSize。
      const width = Math.round(selection.sizePercent || SCAN_SIZE_DEFAULT);
      const el = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        img: elementDataUrl(element.key, color.hex),
        x: position.x,
        y: position.y,
        width: width,
        date: chineseDate(),
        elementType: element.key,
        elementName: element.name,
        colorName: color.name,
        colorHex: color.hex,
        source: 'scan',
      };

      if (board.isMulti()) {
        socket.emit('add_element', { roomId: board.roomId, element: el });
      } else {
        board.addElement(el);
      }

      feedbackLayer.tone(color.key);
      feedbackLayer.say('已放下' + color.name + element.name);
    },

    // 保存圖片 (canvas toolbar) — plain-color PNG of the current board, distinct
    // from 封存作品 (which seals the work into the gallery).
    async saveImage() {
      const w = painter.canvas.width;
      const h = painter.canvas.height;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      await this.drawBoardSnapshot(ctx, w, h);
      const a = document.createElement('a');
      a.download = '繪畫耆才-作品.png';
      a.href = out.toDataURL('image/png');
      a.click();
      feedbackLayer.say('圖片已下載');
    },

    async drawBoardSnapshot(ctx, w, h) {
      const bg = $('#board-bg');
      if (!bg.hidden && bg.complete && bg.naturalWidth) {
        drawContainedImage(ctx, bg, w, h);
      }

      ctx.drawImage(painter.canvas, 0, 0, w, h);

      const nodes = $$('#elements-layer .board-element');
      for (const node of nodes) {
        const img = node.querySelector('img');
        if (!img) continue;
        await ensureImageReady(img);
        const x = (parseFloat(node.style.left) / 100) * w;
        const y = (parseFloat(node.style.top) / 100) * h;
        const ew = (parseFloat(node.style.width) / 100) * w;
        const ratio = img.naturalHeight && img.naturalWidth ? img.naturalHeight / img.naturalWidth : 1;
        const eh = ew * ratio;
        ctx.drawImage(img, x - ew / 2, y - eh / 2, ew, eh);
      }
    },

    // §9.3 finishing workflow — composites 線稿/舊作品背景 + 筆觸 + 已放置圖元成
    // 一張完整快照，等「攞返上畫板繼續畫」之後再封存都會完整包含舊內容。
    async finishDrawing() {
      if (!painter.editing) return;
      const w = painter.canvas.width;
      const h = painter.canvas.height;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      await this.drawBoardSnapshot(ctx, w, h);
      const dataURL = out.toDataURL('image/png');
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
        painter.openCanvas();  // 提筆步驟已取消：封存後即刻可以再畫下一幅
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
      a.download = `繪畫耆才-${Date.now()}.png`;
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
        card.title = '撳一下攞返上畫板繼續畫';
        card.addEventListener('click', () => this.openBoard(w.img));
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

    // ----- §12.x localStorage room history (quickly return to / cancel) --
    loadMyRooms() {
      return JSON.parse(localStorage.getItem('myRooms') || '[]');
    },

    rememberRoom(roomId) {
      const rooms = this.loadMyRooms().filter((r) => r.roomId !== roomId);
      rooms.unshift({ roomId, date: chineseDate(), ts: Date.now() });
      localStorage.setItem('myRooms', JSON.stringify(rooms.slice(0, 20)));
      this.renderMyRooms();
    },

    forgetRoom(roomId) {
      const rooms = this.loadMyRooms().filter((r) => r.roomId !== roomId);
      localStorage.setItem('myRooms', JSON.stringify(rooms));
      this.renderMyRooms();
    },

    renderMyRooms() {
      const grid = $('#my-rooms-grid');
      if (!grid) return;
      const rooms = this.loadMyRooms();
      grid.innerHTML = '';
      if (!rooms.length) {
        const p = document.createElement('p');
        p.className = 'portal-hint';
        p.textContent = '仲未有共繪作品，邀請朋友一齊畫啦～';
        grid.appendChild(p);
        return;
      }
      rooms.forEach((r) => {
        const card = document.createElement('div');
        card.className = 'room-history-card';

        const code = document.createElement('span');
        code.className = 'room-history-code';
        code.textContent = r.roomId;

        const date = document.createElement('span');
        date.className = 'room-history-date';
        date.textContent = r.date;

        const actions = document.createElement('div');
        actions.className = 'room-history-actions';

        const backBtn = document.createElement('button');
        backBtn.className = 'big-btn room-history-btn';
        backBtn.textContent = '返回';
        backBtn.addEventListener('click', () => this.rejoinRoom(r.roomId));

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'big-btn room-history-btn cancel';
        cancelBtn.textContent = '取消';
        cancelBtn.addEventListener('click', () => this.cancelRoom(r.roomId));

        actions.appendChild(backBtn);
        actions.appendChild(cancelBtn);
        card.appendChild(code);
        card.appendChild(date);
        card.appendChild(actions);
        grid.appendChild(card);
      });
    },

    rejoinRoom(roomId) {
      if (!socket) { alert('需要連線伺服器才可返回房間'); return; }
      this._pendingJoinRoomId = roomId;
      socket.emit('join_room', { roomId });
    },

    cancelRoom(roomId) {
      if (!confirm('確定要取消房間「' + roomId + '」嗎？房間內的共繪內容將會清除。')) return;
      if (socket) socket.emit('close_room', { roomId });
      this.forgetRoom(roomId);
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
      label.textContent = '＋ 空白畫紙';
      card.appendChild(label);
      card.addEventListener('click', () => {
        if (this.mode === 'multi') this.createRoom(null);
        else this.openBoard(null);
      });
      return card;
    },

    lineartCard(item) {
      // item is { name, url } from the API (string accepted for back-compat)
      const url = typeof item === 'string' ? '/linearts/' + encodeURIComponent(item) : item.url;
      const card = document.createElement('div');
      card.className = 'gallery-card';
      const img = document.createElement('img');
      img.src = url;
      card.appendChild(img);
      card.addEventListener('click', () => {
        if (this.mode === 'multi') this.createRoom(url);
        else this.openBoard(url);
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
        this._pendingJoinRoomId = code;
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
          const name = typeof f === 'string' ? f : f.name;
          const url = typeof f === 'string' ? '/linearts/' + encodeURIComponent(f) : f.url;
          const card = document.createElement('div');
          card.className = 'gallery-card';
          const img = document.createElement('img');
          img.src = url;
          const del = document.createElement('button');
          del.className = 'del-badge';
          del.textContent = '×';
          del.addEventListener('click', () => this.deleteLineart(name));
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
        this._pendingJoinRoomId = null;
        this.rememberRoom(roomId);
        catLogic.say('開房成功，號碼係 ' + roomId.split('').join(' '));
      });

      socket.on('init_room', ({ id, bgImage, elements }) => {
        board.roomId = id;
        $('#room-id-label').textContent = id;
        this.openBoard(bgImage);
        elements.forEach((el) => board.addElement(el));
        this._pendingJoinRoomId = null;
        this.rememberRoom(id);
        catLogic.say('加入咗房間 ' + id);
      });

      // §12.x 另一端取消咗呢個房間：清走本機紀錄，若正身處其中則彈返出去
      socket.on('room_closed', ({ roomId } = {}) => {
        this.forgetRoom(roomId);
        if (board.roomId === roomId) {
          board.roomId = null;
          alert('呢個共繪房間已經被取消');
          this.switchMode('multi');
        }
      });

      socket.on('element_added', (el) => {
        board.addElement(el);
        if (board.isMulti()) this.showCompletionBanner();
      });
      socket.on('element_moved', ({ id, x, y }) => board.moveNode(id, x, y));
      socket.on('element_resized', ({ id, width }) => board.resizeNode(id, width));
      socket.on('element_deleted', (id) => board.removeNode(id));
      socket.on('peer_cursor', (d) => this.onPeerCursor(d));
      socket.on('peer_left', (id) => this.removePeer(id));
      // 找不到房間（例如舊房間已在伺服器重啟後消失）：連帶清走本機紀錄
      socket.on('error_msg', (msg) => {
        if (this._pendingJoinRoomId) {
          this.forgetRoom(this._pendingJoinRoomId);
          this._pendingJoinRoomId = null;
        }
        alert(msg);
      });
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
