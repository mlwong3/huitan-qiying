/* ===========================================================================
   One Euro Filter — Casiez, Roussel & Vogel (CHI 2012)
   Adaptive low-pass: strong smoothing at low speed (suppresses tremor),
   loosens at high speed (stays responsive). Plain-JS port (no bundler/TS):
   classes are attached to window for classic <script> loading.
   =========================================================================== */
(function (global) {
  'use strict';

  function LowPass() {
    this.s = 0;
    this.init = false;
  }
  LowPass.prototype.filter = function (x, alpha) {
    this.s = this.init ? alpha * x + (1 - alpha) * this.s : x;
    this.init = true;
    return this.s;
  };
  LowPass.prototype.reset = function () {
    this.init = false;
  };

  function OneEuroFilter(minCutoff, beta, dCutoff) {
    this.minCutoff = minCutoff != null ? minCutoff : 1.0;
    this.beta = beta != null ? beta : 0.02;
    this.dCutoff = dCutoff != null ? dCutoff : 1.0;
    this.xf = new LowPass();
    this.dxf = new LowPass();
    this.tPrev = null;
    this.xPrev = 0;
  }
  OneEuroFilter.prototype.alpha = function (cutoff, dt) {
    var tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  };
  OneEuroFilter.prototype.filter = function (x, tSeconds) {
    if (this.tPrev === null) {
      this.tPrev = tSeconds;
      this.xPrev = x;
      return this.xf.filter(x, 1);
    }
    var dt = Math.max(1e-3, tSeconds - this.tPrev);
    var dxHat = this.dxf.filter((x - this.xPrev) / dt, this.alpha(this.dCutoff, dt));
    var cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    var xHat = this.xf.filter(x, this.alpha(cutoff, dt));
    this.tPrev = tSeconds;
    this.xPrev = x;
    return xHat;
  };
  OneEuroFilter.prototype.reset = function () {
    this.xf.reset();
    this.dxf.reset();
    this.tPrev = null;
  };

  // 2D convenience: one filter per axis, shared timestamp.
  function PointFilter(minCutoff, beta) {
    if (minCutoff == null) minCutoff = 1.0;
    if (beta == null) beta = 0.02;
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
  }
  PointFilter.prototype.filter = function (x, y) {
    var t = performance.now() / 1000;
    return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) };
  };
  PointFilter.prototype.reset = function () {
    this.fx.reset();
    this.fy.reset();
  };

  global.LowPass = LowPass;
  global.OneEuroFilter = OneEuroFilter;
  global.PointFilter = PointFilter;
})(window);
