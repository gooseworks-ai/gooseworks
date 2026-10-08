// The script the maker puts first in every frame page, before any of the
// page's own code. It gives the page its data (window.kit) and replaces every
// clock and source of chance the page could read, at the prototype level so
// no native copy stays reachable, with one virtual clock that only the maker
// moves, one frame at a time:
//   Date (and Intl and Temporal "now"), performance (now, timeOrigin, marks,
//   measures, entries, timing, memory), timers, idle and task scheduling,
//   requestAnimationFrame, event times, document.lastModified, File dates,
//   CSS and Web Animations, SVG animations, Math.random and crypto randomness.
// So the same inputs give the same pixels on every run. It also refuses what a
// frame page must not do (fetch, play video or sound, throw) and reports it,
// so the maker can refuse the page with a plain reason. The kit's browser
// watches from outside too (requests, errors, workers, frames, popups).
//
// Frames are first-party style files, reviewed in goose-studio, so this guards
// against mistakes and drift, not against a page written to escape it.
//
// Known limits (not closed here):
// - Native MessageChannel and postMessage tasks run on the browser's own timing.
// - SubtleCrypto can still use randomness (random keys are refused), and object
//   URL ids (blob:...) are random; a page that shows either text drifts.
// - Animation.startTime and SVG getCurrentTime read before kit.ready() resolves
//   come from the browser's clock.
// - Scroll and view timelines are refused; WebGL is off (the browser runs with
//   --disable-3d-apis).
// - The browser's render fingerprint draws only the generic font families, so
//   two computers that differ only in a named system font share a cache key.
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
  function define(target, name, value) {
    try { Object.defineProperty(target, name, { value: value, writable: true, configurable: true }); } catch (e) {}
  }
  function getter(target, name, get) {
    try { Object.defineProperty(target, name, { get: get, configurable: true }); } catch (e) {}
  }

  // The few natives the runtime itself needs, kept in this closure only.
  var nativeRaf = window.requestAnimationFrame.bind(window);
  var nativeSetTimeout = window.setTimeout.bind(window);
  var NativeChannel = window.MessageChannel;
  var nativeFetch = window.fetch.bind(window);
  var nativeAttachShadow = Element.prototype.attachShadow;
  var nativeEntries = Performance.prototype.getEntriesByType;
  var nativeMark = Performance.prototype.mark;
  var nativeMeasure = Performance.prototype.measure;

  // Randomness: one fixed seed, so a page that shuffles shuffles the same way every run.
  var seed = 0x2f6b3a1d;
  function random() {
    seed = (seed + 0x6d2b79f5) >>> 0;
    var t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  define(Math, 'random', random);
  if (window.Crypto) {
    define(Crypto.prototype, 'getRandomValues', function getRandomValues(array) {
      var bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(random() * 256);
      return array;
    });
    define(Crypto.prototype, 'randomUUID', function randomUUID() {
      var hex = '';
      for (var i = 0; i < 32; i++) hex += Math.floor(random() * 16).toString(16);
      return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-4' + hex.slice(13, 16) + '-' + '89ab'.charAt(Math.floor(random() * 4)) + hex.slice(17, 20) + '-' + hex.slice(20, 32);
    });
  }
  if (window.SubtleCrypto) {
    define(SubtleCrypto.prototype, 'generateKey', function generateKey() {
      report('The frame page makes a random key. Frame pages draw the same way every time.');
      return Promise.reject(new DOMException('generateKey is not available', 'NotSupportedError'));
    });
  }

  // Dates. The global Date becomes a stand-in that builds real dates at the
  // virtual time; the native constructor is reachable from nowhere else.
  var RealDate = Date;
  function virtualNow() { return EPOCH + now; }
  var KitDate = new Proxy(RealDate, {
    apply: function () { return new RealDate(EPOCH + now).toString(); },
    construct: function (target, args, newTarget) { return Reflect.construct(target, args.length ? args : [EPOCH + now], newTarget); }
  });
  define(RealDate, 'now', virtualNow);
  define(RealDate.prototype, 'constructor', KitDate);
  define(window, 'Date', KitDate);
  var formatOf = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, 'format');
  if (formatOf && formatOf.get) {
    var nativeFormat = formatOf.get;
    getter(Intl.DateTimeFormat.prototype, 'format', function () {
      var bound = nativeFormat.call(this);
      return function (date) { return bound(date === undefined ? EPOCH + now : date); };
    });
  }
  var nativeToParts = Intl.DateTimeFormat.prototype.formatToParts;
  define(Intl.DateTimeFormat.prototype, 'formatToParts', function formatToParts(date) {
    return nativeToParts.call(this, date === undefined ? EPOCH + now : date);
  });
  if (typeof Temporal === 'object' && Temporal && Temporal.Now) {
    var instant = function () { return Temporal.Instant.fromEpochMilliseconds(EPOCH + now); };
    var zoned = function (zone) { return instant().toZonedDateTimeISO(zone === undefined ? 'UTC' : zone); };
    var replacements = {
      instant: instant,
      timeZoneId: function () { return 'UTC'; },
      zonedDateTimeISO: zoned,
      plainDateTimeISO: function (zone) { return zoned(zone).toPlainDateTime(); },
      plainDateISO: function (zone) { return zoned(zone).toPlainDate(); },
      plainTimeISO: function (zone) { return zoned(zone).toPlainTime(); }
    };
    Object.getOwnPropertyNames(Temporal.Now).forEach(function (name) {
      if (typeof Temporal.Now[name] !== 'function') return;
      define(Temporal.Now, name, replacements[name] || function () { throw new Error('Temporal.Now.' + name + ' is not available'); });
    });
  }
  var nativeFile = window.File;
  if (typeof nativeFile === 'function') {
    var KitFile = new Proxy(nativeFile, {
      construct: function (target, args, newTarget) {
        var options = {};
        if (args[2]) Object.keys(args[2]).forEach(function (key) { options[key] = args[2][key]; });
        if (options.lastModified === undefined) options.lastModified = EPOCH + now;
        return Reflect.construct(target, [args[0], args[1], options], newTarget);
      }
    });
    define(nativeFile.prototype, 'constructor', KitFile);
    define(window, 'File', KitFile);
  }
  getter(Document.prototype, 'lastModified', function () { return '01/01/2026 00:00:00'; });

  // The performance clock and everything that carries its times.
  define(Performance.prototype, 'now', function now_() { return now; });
  getter(Performance.prototype, 'timeOrigin', function () { return EPOCH; });
  define(Performance.prototype, 'mark', function mark(name, options) {
    var copy = {};
    if (options) Object.keys(options).forEach(function (key) { copy[key] = options[key]; });
    if (copy.startTime === undefined) copy.startTime = now;
    return nativeMark.call(this, name, copy);
  });
  define(Performance.prototype, 'measure', function measure(name, start, end) {
    var options = {};
    if (start && typeof start === 'object') Object.keys(start).forEach(function (key) { options[key] = start[key]; });
    else {
      options.start = start === undefined ? 0 : start;
      if (end !== undefined) options.end = end;
    }
    if (options.end === undefined && options.duration === undefined) options.end = now;
    return nativeMeasure.call(this, name, options);
  });
  ['getEntries', 'getEntriesByType', 'getEntriesByName'].forEach(function (name) {
    define(Performance.prototype, name, function () { return []; });
  });
  define(Performance.prototype, 'toJSON', function toJSON() { return { timeOrigin: EPOCH }; });
  var fixedTiming = {};
  ['navigationStart', 'fetchStart', 'domainLookupStart', 'domainLookupEnd', 'connectStart', 'connectEnd', 'requestStart', 'responseStart', 'responseEnd', 'domLoading', 'domInteractive', 'domContentLoadedEventStart', 'domContentLoadedEventEnd', 'domComplete', 'loadEventStart', 'loadEventEnd'].forEach(function (key) { fixedTiming[key] = EPOCH; });
  Object.freeze(fixedTiming);
  getter(Performance.prototype, 'timing', function () { return fixedTiming; });
  var fixedMemory = Object.freeze({ jsHeapSizeLimit: 0, totalJSHeapSize: 0, usedJSHeapSize: 0 });
  getter(Performance.prototype, 'memory', function () { return fixedMemory; });
  if (window.PerformanceObserver) define(PerformanceObserver.prototype, 'observe', function observe() {});
  getter(Event.prototype, 'timeStamp', function () { return now; });
  if (window.AnimationTimeline) getter(AnimationTimeline.prototype, 'currentTime', function () { return now; });

  // Timers, frame callbacks and scheduled tasks run only when the maker moves the clock.
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
  define(window, 'setTimeout', function setTimeout(fn, ms) { return addTimer(fn, ms, Array.prototype.slice.call(arguments, 2), false); });
  define(window, 'setInterval', function setInterval(fn, ms) { return addTimer(fn, ms, Array.prototype.slice.call(arguments, 2), true); });
  define(window, 'clearTimeout', function clearTimeout(id) { timers.delete(id); });
  define(window, 'clearInterval', function clearInterval(id) { timers.delete(id); });
  define(window, 'requestAnimationFrame', function requestAnimationFrame(fn) { var id = nextId++; frameCallbacks.set(id, fn); return id; });
  define(window, 'cancelAnimationFrame', function cancelAnimationFrame(id) { frameCallbacks.delete(id); });
  define(window, 'requestIdleCallback', function requestIdleCallback(fn) {
    return addTimer(function () { fn({ didTimeout: false, timeRemaining: function () { return 0; } }); }, 0, [], false);
  });
  define(window, 'cancelIdleCallback', function cancelIdleCallback(id) { timers.delete(id); });
  if (window.Scheduler && window.scheduler) {
    define(Scheduler.prototype, 'postTask', function postTask(callback, options) {
      return new Promise(function (resolve, reject) {
        addTimer(function () { try { resolve(callback()); } catch (e) { reject(e); } }, options && options.delay, [], false);
      });
    });
    define(Scheduler.prototype, 'yield', function yield_() { return Promise.resolve(); });
  }

  // What a frame page must not do: fetch, play video or sound.
  define(window, 'fetch', function fetch(input) {
    report('The frame page fetches ' + String(input && input.url ? input.url : input).slice(0, 200) + '. Frame pages get their data from the kit and load only their own files.');
    return Promise.reject(new TypeError('fetch is not available in frame pages'));
  });
  define(XMLHttpRequest.prototype, 'open', function open(method, url) {
    report('The frame page fetches ' + String(url).slice(0, 200) + '. Frame pages get their data from the kit and load only their own files.');
    throw new DOMException('XMLHttpRequest is not available in frame pages', 'NotSupportedError');
  });
  define(Navigator.prototype, 'sendBeacon', function sendBeacon(url) { reach(url, 'beacon'); return false; });
  if (window.EventSource) define(window, 'EventSource', function EventSource(url) { reach(url, 'EventSource'); throw new DOMException('EventSource is not available', 'SecurityError'); });
  function noMedia() { report('The frame page plays video or sound. Frame pages show pictures and text only.'); }
  define(HTMLMediaElement.prototype, 'play', function play() {
    noMedia();
    return Promise.reject(new DOMException('Media is not available in frame pages', 'NotAllowedError'));
  });
  ['ScrollTimeline', 'ViewTimeline'].forEach(function (name) {
    if (window[name]) define(window, name, function () { report('The frame page uses a scroll timeline. Frame pages move with time only.'); throw new DOMException('Scroll timelines are not available in frame pages', 'NotSupportedError'); });
  });
  ['AudioContext', 'webkitAudioContext', 'OfflineAudioContext'].forEach(function (name) {
    if (window[name]) define(window, name, function () { noMedia(); throw new DOMException(name + ' is not available', 'NotSupportedError'); });
  });
  // Every tree the page draws in: the document and each shadow root, open,
  // closed (recorded when made) or declarative (found by walking).
  var roots = [document];
  var mediaWatch = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var added = records[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (node.nodeType !== 1) continue;
        if (/^(VIDEO|AUDIO)$/.test(node.tagName) || node.querySelector('video, audio')) noMedia();
      }
    }
  });
  function addRoot(root) {
    if (roots.indexOf(root) >= 0) return;
    roots.push(root);
    mediaWatch.observe(root, { childList: true, subtree: true });
  }
  mediaWatch.observe(document, { childList: true, subtree: true });
  define(Element.prototype, 'attachShadow', function attachShadow(init) {
    var root = nativeAttachShadow.call(this, init);
    addRoot(root);
    return root;
  });
  function findRoots() {
    for (var r = 0; r < roots.length; r++) {
      var all = roots[r].querySelectorAll('*');
      for (var i = 0; i < all.length; i++) if (all[i].shadowRoot) addRoot(all[i].shadowRoot);
    }
    for (var k = 0; k < roots.length; k++) if (roots[k].querySelector('video, audio')) noMedia();
  }
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
    var list = nativeEntries.call(performance, 'resource');
    for (; resourcesSeen < list.length; resourcesSeen++) {
      var name = list[resourcesSeen].name;
      if (!isLocal(name)) reach(name, list[resourcesSeen].initiatorType || 'request');
    }
  }

  // Animations: every CSS or Web Animation is paused when it appears and set
  // to its age on the virtual clock. SVG animations follow the same clock.
  var born = new WeakMap();
  function syncAnimations() {
    var seen = new Set();
    for (var r = 0; r < roots.length; r++) {
      var list = roots[r].getAnimations ? roots[r].getAnimations() : [];
      for (var i = 0; i < list.length; i++) {
        var animation = list[i];
        if (seen.has(animation)) continue;
        seen.add(animation);
        if (animation.timeline && animation.timeline !== document.timeline) report('The frame page uses a scroll timeline. Frame pages move with time only.');
        if (!born.has(animation)) born.set(animation, now);
        // Paused every time: a page that calls play() never gets a moment on the computer's clock.
        try { if (animation.playState !== 'paused') animation.pause(); } catch (e) {}
        try { animation.currentTime = Math.max(0, now - born.get(animation)); } catch (e) {}
      }
      var svgs = roots[r].querySelectorAll('svg');
      for (var j = 0; j < svgs.length; j++) {
        var svg = svgs[j];
        if (svg.ownerSVGElement || typeof svg.pauseAnimations !== 'function') continue;
        try { svg.pauseAnimations(); svg.setCurrentTime(now / 1000); } catch (e) {}
      }
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

  // Lets the browser finish what the frame started (layout, fonts, pictures,
  // observers, queued tasks) before the maker takes the picture.
  function task() {
    return new Promise(function (resolve) {
      var channel = new NativeChannel();
      channel.port1.onmessage = function () { resolve(); };
      channel.port2.postMessage(0);
    });
  }
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
    await task();
    await new Promise(function (resolve) { nativeRaf(function () { nativeRaf(resolve); }); });
    await new Promise(function (resolve) { nativeSetTimeout(resolve, 0); });
    await task();
  }

  // Pictures the page makes from data: and blob: URLs, in HTML, SVG or CSS.
  // Each is read once and handed to the maker, which refuses one that moves.
  var sourcesSeen = Object.create(null);
  var URL_IN_CSS = /url\(\s*(['"]?)((?:data|blob):[^'")]*)\1\s*\)/gi;
  function inlineSources() {
    var found = [];
    var add = function (url) {
      if (url && /^(data|blob):/i.test(url) && !sourcesSeen[url]) { sourcesSeen[url] = 1; found.push(url); }
    };
    var css = function (text) {
      var match;
      URL_IN_CSS.lastIndex = 0;
      while ((match = URL_IN_CSS.exec(text))) add(match[2]);
    };
    for (var r = 0; r < roots.length; r++) {
      var root = roots[r];
      root.querySelectorAll('img, source, input[type=image]').forEach(function (el) { add(el.currentSrc || el.src); (el.srcset || '').split(',').forEach(function (part) { add(part.trim().split(/\s+/)[0]); }); });
      root.querySelectorAll('image, feImage, use').forEach(function (el) { add(el.getAttribute('href') || el.getAttribute('xlink:href')); });
      root.querySelectorAll('[style]').forEach(function (el) { css(el.getAttribute('style') || ''); });
      var sheets = Array.prototype.slice.call(root.styleSheets || []).concat(Array.prototype.slice.call(root.adoptedStyleSheets || []));
      sheets.forEach(function (sheet) {
        var rules;
        try { rules = sheet.cssRules; } catch (e) { return; }
        for (var i = 0; i < rules.length; i++) css(rules[i].cssText);
      });
    }
    return found;
  }
  function toBase64(bytes) {
    var text = '';
    for (var i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(text);
  }
  async function readSource(url) {
    try {
      if (/^blob:/i.test(url)) return toBase64(new Uint8Array(await (await nativeFetch(url)).arrayBuffer()));
      var comma = url.indexOf(',');
      if (comma < 0) throw new Error('no data');
      var head = url.slice(5, comma);
      var body = url.slice(comma + 1);
      if (/;base64$/i.test(head)) return body.replace(/\s+/g, '');
      return toBase64(new TextEncoder().encode(decodeURIComponent(body)));
    } catch (e) {
      report('The picture ' + url.slice(0, 80) + ' could not be read.');
      return null;
    }
  }
  async function take() {
    scanResources();
    var sources = [];
    var urls = inlineSources();
    for (var i = 0; i < urls.length; i++) {
      var data = await readSource(urls[i]);
      if (data !== null) sources.push({ url: urls[i].slice(0, 120), data: data });
    }
    var out = problems.slice();
    problems.length = 0;
    return { problems: out, sources: sources };
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
      findRoots();
      syncAnimations();
      await settle();
      syncAnimations();
      return take();
    },
    frame: async function (index) {
      findRoots();
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
      findRoots();
      syncAnimations();
      await settle();
      // Anything the page did while the browser settled is set back to the frame's time.
      syncAnimations();
      return take();
    },
    finish: async function () {
      await settle();
      findRoots();
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
