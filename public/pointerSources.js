/* ===========================================================================
   Inclusive input layer.
   Free drawing still consumes pointer signals: { x, y, action }.
   Single-switch creation uses higher-level intents inside script.js:
   move / next / confirm / back / command.
   =========================================================================== */
(function (global) {
  'use strict';

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
})(window);
