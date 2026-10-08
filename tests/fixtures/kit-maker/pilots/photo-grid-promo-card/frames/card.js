// Photo-grid promo card: a fixed header (logo, headline, sub) and chips over a
// two-row grid of product tiles, offer and code tiles that scrolls left for the
// whole video. Uses the recipe's own pure-function-of-time scaffold
// (initRenderer / renderAt in shared.js), which the maker drives frame by frame.
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var v = kit.values;
  var images = [];
  kit.products.forEach(function (p) { p.images.forEach(function (src) { images.push(src); }); });
  if (kit.brand && kit.brand.logo) $('wordmark').src = kit.brand.logo;
  $('headline').textContent = kit.scenes[0].on_screen || '';
  $('sub').textContent = (kit.scenes[1] && kit.scenes[1].on_screen) || '';
  var kinds = ['product', 'product', 'pct', 'product', 'product', 'product', 'off', 'product', 'code', 'product'];
  var used = 0;
  kinds.forEach(function (kind, i) {
    var tile = document.createElement('div');
    tile.dataset.i = String(i);
    if (kind === 'product') {
      tile.className = 'tile band-product';
      var img = document.createElement('img');
      img.src = images[used++ % images.length];
      tile.appendChild(img);
    } else if (kind === 'pct') {
      tile.className = 'tile type-off';
      tile.innerHTML = '<div class="pct"></div><div class="off">OFF</div>';
      tile.firstChild.textContent = v.offer || '';
    } else if (kind === 'off') {
      tile.className = 'tile type-off';
      tile.innerHTML = '<div class="pct">OFF</div>';
    } else {
      tile.className = 'tile code';
      tile.innerHTML = '<div class="lbl">CODE</div><div class="val"></div>';
      tile.lastChild.textContent = v.code || '';
    }
    $('grid').appendChild(tile);
  });
  (v.chips || []).forEach(function (text, i) {
    var chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.i = String(i);
    chip.textContent = text;
    $('chips').appendChild(chip);
  });
  var tiles = Array.prototype.slice.call(document.querySelectorAll('.tile'));
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var grid = $('grid');
  var range = 5 * 360 + 4 * 24 + 120 - kit.width;
  initRenderer(kit.duration_s, function (t) {
    $('brand').style.opacity = easeOut(clamp01(tw(t, 0, 0.4)));
    var hx = clamp01(tw(t, 0.1, 0.7));
    $('headline').style.opacity = easeOut(hx);
    $('headline').style.transform = 'translateY(' + (1 - easeOut(hx)) * 28 + 'px)';
    $('sub').style.opacity = easeOut(clamp01(tw(t, 0.5, 0.9)));
    tiles.forEach(function (el) {
      var i = Number(el.dataset.i);
      var e = easeOut(clamp01(tw(t, 0.3 + (i % 5) * 0.08, 0.8 + (i % 5) * 0.08)));
      el.style.opacity = e;
    });
    grid.style.transform = 'translateX(' + (-range * clamp01(t / kit.duration_s)).toFixed(2) + 'px)';
    chips.forEach(function (el) {
      var i = Number(el.dataset.i);
      var ce = easeOut(clamp01(tw(t, 0.9 + i * 0.08, 1.3 + i * 0.08)));
      el.style.opacity = ce;
      el.style.transform = 'translateY(' + (1 - ce) * 12 + 'px)';
    });
  });
})();
