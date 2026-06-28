/* ===========================================================================
   Unified pointer abstraction layer.
   Every input modality (touch/mouse, head, eye, voice) normalises into one
   stream: emit({ x, y, action: 'down' | 'move' | 'up' }), x/y in canvas space.
   The drawing core (painter.feed) consumes only this stream, so adding a new
   input never touches the engine. HeadSource (Phase 2) lives in headSource.js.
   =========================================================================== */
(function (global) {
  'use strict';

  // Wraps the existing mouse + touch events on the canvas into the unified stream.
  // toCanvas(e) -> {x, y} in canvas coordinate space (reuses painter.pos).
  function TouchMouseSource(canvas, toCanvas, emit) {
    this.canvas = canvas;
    this.toCanvas = toCanvas;
    this.emit = emit;
    this.enabled = true;
    this._bind();
  }

  TouchMouseSource.prototype._bind = function () {
    var self = this;
    var c = this.canvas;

    var start = function (e) {
      if (!self.enabled) return;
      if (e.cancelable) e.preventDefault();
      var p = self.toCanvas(e);
      self.emit({ x: p.x, y: p.y, action: 'down' });
    };
    var move = function (e) {
      if (!self.enabled) return;
      if (e.cancelable) e.preventDefault();
      var p = self.toCanvas(e);
      self.emit({ x: p.x, y: p.y, action: 'move' });
    };
    var end = function () {
      if (!self.enabled) return;
      self.emit({ x: 0, y: 0, action: 'up' });
    };

    c.addEventListener('mousedown', start);
    c.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    c.addEventListener('touchstart', start, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', end);
  };

  global.TouchMouseSource = TouchMouseSource;

  // ------------------------------------------------------------------------ //
  //  HeadSource — head tracking via MediaPipe FaceLandmarker (Phase 2).
  //  Maps a face landmark to a cursor; dwell (holding still) toggles pen
  //  down/up, so head movement draws. Emits the SAME {x,y,action} stream as
  //  TouchMouseSource, so painter.feed needs no knowledge of the source.
  //  All inference runs in-browser; the webcam image is never uploaded.
  // ------------------------------------------------------------------------ //
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[data-src="' + src + '"]')) { res(); return; }
      var s = document.createElement('script');
      s.src = src; s.async = true; s.setAttribute('data-src', src);
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('載入失敗 ' + src)); };
      document.head.appendChild(s);
    });
  }

  // Shared "dwell-to-draw" engine — the inclusive core reused by every
  // pointing modality. Input: a canvas-space point. It smooths (One Euro),
  // moves the cursor, runs dwell selection, and emits the unified stream.
  function DwellEngine(opts) {
    // opts: { rect(), canvasW, canvasH, cursor, ring, emit,
    //         dwellMs, dwellRadius, minCutoff, beta, onState }
    this.o = opts;
    this.pf = new PointFilter(
      opts.minCutoff != null ? opts.minCutoff : 0.5,
      opts.beta != null ? opts.beta : 0.01
    );
    this.penDown = false;
    this.lastPt = null;
    this.dwellStart = null;
    this.cooldownUntil = 0;
  }
  DwellEngine.prototype.update = function (cx, cy) {
    var o = this.o;
    var s = this.pf.filter(cx, cy);

    if (o.cursor) {
      var r = o.rect();
      o.cursor.style.left = (r.left + (s.x / o.canvasW) * r.width) + 'px';
      o.cursor.style.top = (r.top + (s.y / o.canvasH) * r.height) + 'px';
    }

    var now = performance.now();
    var moved = this.lastPt ? Math.hypot(s.x - this.lastPt.x, s.y - this.lastPt.y) : 999;
    var radius = o.dwellRadius || 20;
    var dwellMs = o.dwellMs || 1000;

    if (now < this.cooldownUntil) {
      this._ring(0);
    } else if (moved < radius) {            // holding still -> accumulate dwell
      if (this.dwellStart == null) this.dwellStart = now;
      var prog = clamp((now - this.dwellStart) / dwellMs, 0, 1);
      this._ring(prog);
      if (prog >= 1) { this._toggle(s); this.dwellStart = null; this.cooldownUntil = now + 500; }
    } else {                                 // moving -> cancel dwell
      this.dwellStart = null;
      this._ring(0);
    }

    if (this.penDown) o.emit({ x: s.x, y: s.y, action: 'move' });
    this.lastPt = s;
    return s;
  };
  DwellEngine.prototype._toggle = function (s) {
    this.penDown = !this.penDown;
    this.o.emit({ x: s.x, y: s.y, action: this.penDown ? 'down' : 'up' });
    if (this.o.cursor) this.o.cursor.classList.toggle('down', this.penDown);
    if (this.o.onState) this.o.onState(this.penDown);
  };
  DwellEngine.prototype._ring = function (p) {
    if (this.o.ring) this.o.ring.style.setProperty('--p', p);
  };
  DwellEngine.prototype.liftPen = function () {
    if (this.penDown) { this.o.emit({ x: 0, y: 0, action: 'up' }); this.penDown = false; }
    this.dwellStart = null;
  };

  // -- HeadSource: MediaPipe FaceLandmarker -> nose landmark -> dwell engine -- //
  function HeadSource(opts) {
    this.opts = opts;
    this.gain = opts.gain || 1.6;
    this.engine = new DwellEngine(Object.assign({ minCutoff: 0.5, beta: 0.01 }, opts));
    this.running = false;
    this.landmarker = null;
    this.stream = null;
    this.raf = null;
  }
  // Decoupled from the camera so it stays unit-testable. nx,ny: mirrored [0,1].
  HeadSource.prototype.processPoint = function (nx, ny) {
    var ax = clamp(0.5 + (nx - 0.5) * this.gain, 0, 1);
    var ay = clamp(0.5 + (ny - 0.5) * this.gain, 0, 1);
    return this.engine.update(ax * this.opts.canvasW, ay * this.opts.canvasH);
  };
  HeadSource.prototype.start = async function () {
    var V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20';
    var vision = await import(V + '/vision_bundle.mjs');
    var fileset = await vision.FilesetResolver.forVisionTasks(V + '/wasm');
    this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
    });
    this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
    this.opts.video.srcObject = this.stream;
    await this.opts.video.play();
    this.running = true;
    this._loop();
  };
  HeadSource.prototype._loop = function () {
    if (!this.running) return;
    var v = this.opts.video;
    if (v.readyState >= 2 && this.landmarker) {
      var res = this.landmarker.detectForVideo(v, performance.now());
      if (res && res.faceLandmarks && res.faceLandmarks[0]) {
        var lm = res.faceLandmarks[0][1]; // nose bridge landmark
        this.processPoint(1 - lm.x, lm.y); // mirror x for natural control
      }
    }
    var self = this;
    this.raf = requestAnimationFrame(function () { self._loop(); });
  };
  HeadSource.prototype.stop = function () {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); });
    this.engine.liftPen();
  };

  // -- EyeSource: WebGazer gaze (screen px) -> dwell engine (Phase 3) -------- //
  // Eye gaze is noisier than head pose, so the engine uses a lower cutoff and a
  // larger dwell radius. Accuracy improves after WebGazer's click-calibration.
  function EyeSource(opts) {
    this.opts = opts;
    this.engine = new DwellEngine(Object.assign(
      { minCutoff: 0.4, beta: 0.008, dwellRadius: opts.dwellRadius || 45 }, opts
    ));
    this.running = false;
  }
  // screen px -> canvas space (clamped to the canvas), then the shared engine.
  EyeSource.prototype.processScreen = function (sx, sy) {
    var o = this.opts, r = o.rect();
    var cx = clamp(((sx - r.left) / r.width) * o.canvasW, 0, o.canvasW);
    var cy = clamp(((sy - r.top) / r.height) * o.canvasH, 0, o.canvasH);
    return this.engine.update(cx, cy);
  };
  EyeSource.prototype.start = async function () {
    await loadScript('https://cdn.jsdelivr.net/npm/webgazer@3.3.0/dist/webgazer.min.js');
    var wg = window.webgazer;
    if (!wg) throw new Error('WebGazer 載入失敗');
    var self = this;
    wg.setRegression('ridge');
    wg.showVideoPreview(true).showPredictionPoints(false).showFaceOverlay(false);
    wg.setGazeListener(function (data) {
      if (!self.running || !data) return;
      self.processScreen(data.x, data.y);
    });
    await wg.begin();
    this.running = true;
  };
  EyeSource.prototype.stop = function () {
    this.running = false;
    this.engine.liftPen();
    try {
      if (window.webgazer) { window.webgazer.clearGazeListener(); window.webgazer.end(); }
    } catch (e) { /* webgazer not started */ }
  };

  global.DwellEngine = DwellEngine;
  global.HeadSource = HeadSource;
  global.EyeSource = EyeSource;
})(window);
