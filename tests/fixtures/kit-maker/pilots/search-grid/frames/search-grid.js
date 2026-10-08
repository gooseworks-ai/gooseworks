// Search grid: a search bar types the first scene over a drifting grid of the
// products, the next scenes' products slide in as cards, the top card grows to
// fill the screen and swipes through each scene's caption, then the end card.
// Beats are fractions of the video, so the same page fits any length.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var images = [];
  kit.products.forEach(function (p) { p.images.forEach(function (src) { images.push(src); }); });
  var features = kit.scenes.slice(1);
  var hook = (kit.scenes[0].on_screen || kit.scenes[0].line || '').trim();
  var placeholder = kit.values.placeholder || 'Search for anything';
  var D = kit.duration_s;

  var grid = $('gridwrap');
  for (var c = 0; c < 3; c++) {
    var col = document.createElement('div');
    col.className = 'col';
    for (var r = 0; r < 6; r++) {
      var tile = document.createElement('div');
      tile.className = 'tile';
      var img = document.createElement('img');
      img.src = images[(c * 6 + r) % images.length];
      tile.appendChild(img);
      col.appendChild(tile);
    }
    grid.appendChild(col);
  }
  var cols = Array.prototype.slice.call(document.querySelectorAll('.col'));
  $('stack-bg').style.backgroundImage = 'url("' + images[0] + '")';
  var cards = features.map(function (scene, i) {
    var card = document.createElement('div');
    card.className = 'stackcard';
    card.style.top = (342 + i * 422) + 'px';
    card.style.zIndex = String(10 - i);
    var img = document.createElement('img');
    img.src = images[(i + 1) % images.length];
    card.appendChild(img);
    $('stack-cards').appendChild(card);
    return card;
  });
  var feats = features.map(function (scene, i) {
    var feat = document.createElement('div');
    feat.className = 'feat';
    var img = document.createElement('img');
    img.src = images[(i + 1) % images.length];
    var cap = document.createElement('div');
    cap.className = 'feat-cap';
    cap.textContent = scene.on_screen || scene.line || '';
    feat.appendChild(img);
    feat.appendChild(cap);
    $('feat-track').appendChild(feat);
    return feat;
  });
  $('ec-hero-img').src = images[0];
  if (kit.brand && kit.brand.logo) $('ec-logo').src = kit.brand.logo;
  $('ec-cta').textContent = kit.brand && kit.brand.cta ? kit.brand.cta.text : '';

  var clamp01 = function (x) { return Math.max(0, Math.min(1, x)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var smooth = function (t) { t = clamp01(t); return t * t * (3 - 2 * t); };
  var ramp = function (t, a, b) { return smooth((t - a) / (b - a)); };

  kit.render(function (t) {
    var f = t / D;
    var n = hook.length;
    var ch = f < 0.03 ? 0 : f >= 0.19 ? n : Math.round(n * (f - 0.03) / 0.16);
    var typed = $('typed');
    if (ch === 0) typed.innerHTML = '<span class="ph"></span>', typed.firstChild.textContent = placeholder;
    else typed.textContent = hook.slice(0, ch);
    $('caret').style.opacity = (f < 0.19 || Math.floor(t * 2) % 2 === 0) ? '1' : '0';
    var drift = clamp01(f / 0.28);
    cols.forEach(function (col, i) { col.style.transform = 'translateY(' + ((i === 1 ? -1 : 1) * drift * 96 - 300).toFixed(2) + 'px)'; });
    $('beat-search').style.opacity = (1 - ramp(f, 0.25, 0.28)).toFixed(3);
    $('beat-stack').style.opacity = (ramp(f, 0.26, 0.29) * (1 - ramp(f, 0.42, 0.43))).toFixed(3);
    $('beat-features').style.opacity = (ramp(f, 0.42, 0.43) * (1 - ramp(f, 0.78, 0.80))).toFixed(3);
    $('beat-end').style.opacity = ramp(f, 0.78, 0.81).toFixed(3);
    cards.forEach(function (card, i) {
      var p = smooth(ramp(f, 0.28 + i * 0.01, 0.32 + i * 0.01));
      card.style.transform = 'translateX(' + lerp(1250, 0, p).toFixed(1) + 'px)';
      card.style.opacity = p.toFixed(3);
    });
    var span = 0.36 / Math.max(1, feats.length);
    var pos = 0;
    for (var k = 1; k < feats.length; k++) pos += ramp(f, 0.43 + k * span - 0.02, 0.43 + k * span);
    feats.forEach(function (feat, i) { feat.style.transform = 'translateX(' + ((i - pos) * kit.width).toFixed(1) + 'px)'; });
  });
})();
