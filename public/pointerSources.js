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

  function HeadSource(opts) {
    // opts: { rect(), canvasW, canvasH, cursor, ring, video, emit,
    //         dwellMs, dwellRadius, gain, onState }
    this.opts = opts;
    this.pf = new PointFilter(0.5, 0.01); // head signal is jumpier -> smoother
    this.penDown = false;
    this.lastPt = null;
    this.dwellStart = null;
    this.cooldownUntil = 0;
    this.running = false;
    this.landmarker = null;
    this.stream = null;
    this.raf = null;
  }

  // Core logic — decoupled from the camera so it is unit-testable.
  // nx, ny: normalised [0,1] face position (already mirrored).
  HeadSource.prototype.processPoint = function (nx, ny) {
    var o = this.opts;
    var gain = o.gain || 1.6;
    var ax = clamp(0.5 + (nx - 0.5) * gain, 0, 1);
    var ay = clamp(0.5 + (ny - 0.5) * gain, 0, 1);
    var cx = ax * o.canvasW, cy = ay * o.canvasH;     // canvas space
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

  HeadSource.prototype._toggle = function (s) {
    this.penDown = !this.penDown;
    this.opts.emit({ x: s.x, y: s.y, action: this.penDown ? 'down' : 'up' });
    if (this.opts.cursor) this.opts.cursor.classList.toggle('down', this.penDown);
    if (this.opts.onState) this.opts.onState(this.penDown);
  };

  HeadSource.prototype._ring = function (p) {
    if (this.opts.ring) this.opts.ring.style.setProperty('--p', p);
  };

  // Load MediaPipe lazily (multi-MB) and start the camera + detection loop.
  HeadSource.prototype.start = async function () {
    var V = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22';
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
    if (this.penDown) { this.opts.emit({ x: 0, y: 0, action: 'up' }); this.penDown = false; }
    this.dwellStart = null;
  };

  global.HeadSource = HeadSource;
})(window);
