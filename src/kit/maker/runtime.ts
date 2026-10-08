// The script the maker puts first in every frame page. It gives the page its
// data (window.kit) and replaces every clock the page could read with one
// virtual clock that only the maker moves, one frame at a time:
//   Date, performance.now, timers, requestAnimationFrame, event times,
//   CSS and Web Animations, SVG animations, Math.random and crypto randomness.
// So the same inputs give the same pixels on every run. It also reports what
// the page must not do (reach the network, start workers, play media, throw),
// so the maker can refuse the page with a plain reason.
//
// Plain ES2020 in a string: nothing here is compiled, so the page runs exactly
// this text. Keep it free of backticks and "${".

/** Fixed wall-clock start for the page: 2026-01-01T00:00:00Z. */
export const PAGE_EPOCH_MS = 1767225600000;

const RUNTIME = String.raw`(function () {
  'use strict';
  var DATA = __KIT_DATA__;
  var EPOCH = __KIT_EPOCH__;
  var now = 0;
  var problems = [];
  var said = Object.create(null);
  function report(message) {
    message = String(message).slice(0, 400);
    if (said[message] || problems.length >= 40) return;
    said[message] = 1;
    problems.push(message);
  }
  function isLocal(url) {
    return /^(file|data|blob|about):/i.test(String(url));
  }
  function reach(url, how) {
    report('The frame page tries to reach ' + String(url).slice(0, 200) + ' (' + how + '). Frame pages may load only their own files.');
  }

  // Randomness: one fixed seed, so a page that shuffles shuffles the same way every run.
  var seed = 0x2f6b3a1d;
  function random() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    var t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  Math.random = random;
  try {
    Object.defineProperty(window.crypto, 'getRandomValues', { value: function (array) {
      var bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
      return array;
    } });
    Object.defineProperty(window.crypto, 'randomUUID', { value: function () {
      var hex = '';
      for (var i = 0; i < 32; i++) hex += Math.floor(random() * 16).toString(16);
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-' + '89ab'.charAt(Math.floor(random() * 4)) + hex.slice(17, 20) + '-' + hex.slice(20, 32);
    } });
  } catch (e) {}

  // Clocks.
  var RealDate = Date;
  class KitDate extends RealDate {
    constructor() {
      if (arguments.length === 0) super(EPOCH + now);
      else super(...arguments);
    }
    static now() { return EPOCH + now; }
  }
  window.Date = new Proxy(KitDate, { apply: function () { return new RealDate(EPOCH + now).toString(); } });
  try { Object.defineProperty(performance, 'now', { value: function () { return now; } }); } catch (e) {}
  try { Object.defineProperty(performance, 'timeOrigin', { get: function () { return EPOCH; } }); } catch (e) {}
  try { Object.defineProperty(Event.prototype, 'timeStamp', { get: function () { return now; } }); } catch (e) {}
  try { Object.defineProperty(document.timeline, 'currentTime', { get: function () { return now; } }); } catch (e) {}
  try { performance.setResourceTimingBufferSize(100000); } catch (e) {}

  // Timers and frame callbacks run only when the maker moves the clock.
  var timers = new Map();
  var frameCallbacks = new Map();
  var nextId = 1;
  function addTimer(fn, ms, args, repeat) {
    if (typeof fn !== 'function') {
      report('The frame page gives a timer code as text; give it a function.');
      return 0;
    }
    var delay = Number(ms) || 0;
    if (delay < 0) delay = 0;
    var id = nextId++;
    timers.set(id, { id: id, at: now + delay, fn: fn, args: args, every: repeat ? Math.max(1, delay) : 0 });
    return id;
  }
  window.setTimeout = function (fn, ms) { return addTimer(fn, ms, Array.prototype.slice.call(arguments, 2), false); };
  window.setInterval = function (fn, ms) { return addTimer(fn, ms, Array.prototype.slice.call(arguments, 2), true); };
  window.clearTimeout = function (id) { timers.delete(id); };
  window.clearInterval = function (id) { timers.delete(id); };
  window.requestAnimationFrame = function (fn) { var id = nextId++; frameCallbacks.set(id, fn); return id; };
  window.cancelAnimationFrame = function (id) { frameCallbacks.delete(id); };
  window.requestIdleCallback = function (fn) {
    return addTimer(function () { fn({ didTimeout: false, timeRemaining: function () { return 0; } }); }, 0, [], false);
  };
  window.cancelIdleCallback = function (id) { timers.delete(id); };

  // What a frame page must not do. The kit's browser blocks the network as well;
  // this only says what the page tried, so the maker can refuse it plainly.
  ['WebSocket', 'EventSource'].forEach(function (name) {
    var Real = window[name];
    if (typeof Real !== 'function') return;
    window[name] = function (url) { reach(url, name); return new Real(url); };
  });
  ['Worker', 'SharedWorker'].forEach(function (name) {
    window[name] = function () { report('The frame page starts a ' + name + '. Frame pages run on the page alone.'); throw new Error(name + ' is not available'); };
  });
  window.addEventListener('error', function (event) {
    var target = event.target;
    if (target && target !== window && target.tagName) {
      var url = target.currentSrc || target.src || target.href || '';
      if (url && !isLocal(url)) reach(url, target.tagName.toLowerCase());
      else report('The frame page could not load ' + String(url || target.tagName).slice(0, 200) + '. List every file the page uses in its frames.');
      return;
    }
    report('The frame page threw an error: ' + String(event.message || 'unknown').slice(0, 300));
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    report('The frame page threw an error: ' + String(reason && reason.message ? reason.message : reason).slice(0, 300));
  });
  var resourcesSeen = 0;
  function scanResources() {
    var list = performance.getEntriesByType('resource');
    for (; resourcesSeen < list.length; resourcesSeen++) {
      var name = list[resourcesSeen].name;
      if (!isLocal(name)) reach(name, list[resourcesSeen].initiatorType || 'request');
    }
  }

  // Animations: every CSS or Web Animation is paused when it appears and set
  // to its age on the virtual clock. SVG animations follow the same clock.
  var born = new WeakMap();
  function syncAnimations() {
    var list = document.getAnimations ? document.getAnimations() : [];
    for (var i = 0; i < list.length; i++) {
      var animation = list[i];
      if (!born.has(animation)) {
        born.set(animation, now);
        try { animation.pause(); } catch (e) {}
      }
      try { animation.currentTime = Math.max(0, now - born.get(animation)); } catch (e) {}
    }
    var svgs = document.getElementsByTagName('svg');
    for (var j = 0; j < svgs.length; j++) {
      var svg = svgs[j];
      if (svg.ownerSVGElement || typeof svg.pauseAnimations !== 'function') continue;
      try { svg.pauseAnimations(); svg.setCurrentTime(now / 1000); } catch (e) {}
    }
  }

  function call(fn, args, what) {
    try { return fn.apply(window, args); } catch (e) {
      report('The frame page threw an error in ' + what + ': ' + String(e && e.message ? e.message : e).slice(0, 300));
      return undefined;
    }
  }

  function runTimers(until) {
    var runs = 0;
    for (;;) {
      var next = null;
      timers.forEach(function (timer) {
        if (timer.at <= until && (!next || timer.at < next.at || (timer.at === next.at && timer.id < next.id))) next = timer;
      });
      if (!next) return;
      if (++runs > 20000) {
        report('The frame page sets timers without end.');
        timers.clear();
        return;
      }
      if (next.at > now) now = next.at;
      if (next.every) next.at += next.every;
      else timers.delete(next.id);
      call(next.fn, next.args, 'a timer');
      syncAnimations();
    }
  }

  // Frame data for the page.
  var renderers = [];
  var waits = [];
  function sceneAt(t) {
    var scenes = DATA.scenes;
    for (var i = scenes.length - 1; i >= 0; i--) {
      if (t >= scenes[i].start_s) {
        var length = scenes[i].end_s - scenes[i].start_s;
        return { index: i, scene: scenes[i], progress: length > 0 ? Math.min(1, (t - scenes[i].start_s) / length) : 1 };
      }
    }
    return { index: 0, scene: scenes[0], progress: 0 };
  }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (key) { freeze(value[key]); });
      Object.freeze(value);
    }
    return value;
  }
  var kit = freeze({
    version: 1,
    aspect: DATA.aspect,
    width: DATA.width,
    height: DATA.height,
    fps: DATA.fps,
    frames: DATA.frames,
    duration_s: DATA.duration_s,
    scenes: DATA.scenes,
    products: DATA.products,
    brand: DATA.brand,
    fonts: DATA.fonts,
    values: DATA.values,
    sceneAt: sceneAt,
    render: function (fn) { if (typeof fn === 'function') renderers.push(fn); },
    ready: function (promise) { waits.push(Promise.resolve(promise)); }
  });
  window.kit = kit;

  async function settle() {
    // Reading the layout makes the browser start any font the new frame needs.
    if (document.body) void document.body.offsetHeight;
    try { await document.fonts.ready; } catch (e) {}
    var pending = [];
    var images = document.images;
    for (var i = 0; i < images.length; i++) {
      if (!images[i].complete) pending.push(images[i].decode().catch(function () {}));
    }
    if (pending.length) await Promise.all(pending);
  }

  function take() {
    scanResources();
    var out = problems.slice();
    problems.length = 0;
    return out;
  }

  var driver = {
    start: async function () {
      if (document.readyState !== 'complete') {
        await new Promise(function (resolve) { window.addEventListener('load', resolve, { once: true }); });
      }
      try { await Promise.all(waits); } catch (e) { report('The frame page did not get ready: ' + String(e && e.message ? e.message : e).slice(0, 300)); }
      // Load every font and picture up front, so no frame is drawn while one is still loading.
      var faces = [];
      document.fonts.forEach(function (face) { faces.push(face); });
      await Promise.all(faces.map(function (face) { return face.load().catch(function () {}); }));
      faces.forEach(function (face) {
        if (face.status === 'error') report('The font "' + face.family + '" could not be read.');
      });
      await Promise.all(DATA.preload.map(function (url) {
        var image = new Image();
        image.src = url;
        return image.decode().catch(function () { report('The picture ' + url + ' could not be read.'); });
      }));
      if (document.querySelector('video, audio')) report('The frame page plays video or sound. Frame pages show pictures and text only.');
      syncAnimations();
      await settle();
      return take();
    },
    frame: async function (index) {
      var target = (index * 1000) / DATA.fps;
      runTimers(target);
      now = target;
      var callbacks = Array.from(frameCallbacks.values());
      frameCallbacks.clear();
      for (var i = 0; i < callbacks.length; i++) call(callbacks[i], [now], 'a frame callback');
      syncAnimations();
      var t = target / 1000;
      try {
        if (renderers.length) {
          for (var r = 0; r < renderers.length; r++) await renderers[r](t, { index: index, scene: sceneAt(t) });
        } else if (typeof window.renderAt === 'function') {
          await window.renderAt(t);
        } else if (typeof window.__renderAt === 'function') {
          await window.__renderAt(t);
        } else if (typeof window.seek === 'function') {
          await window.seek(target);
        }
      } catch (e) {
        report('The frame page threw an error while drawing: ' + String(e && e.message ? e.message : e).slice(0, 300));
      }
      syncAnimations();
      await settle();
      return take();
    }
  };
  Object.defineProperty(window, '__kitDriver', { value: Object.freeze(driver), writable: false, configurable: false });
})();`;

/** Page data as a JS literal that is safe inside a <script> element. */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .split(String.fromCharCode(0x2028)).join('\\u2028')
    .split(String.fromCharCode(0x2029)).join('\\u2029');
}

/** The runtime with this page's data in it. */
export function runtimeScript(data: unknown): string {
  return RUNTIME.replace('__KIT_DATA__', () => scriptJson(data)).replace('__KIT_EPOCH__', String(PAGE_EPOCH_MS));
}
