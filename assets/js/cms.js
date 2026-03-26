/**
 * CMS: Load dynamic content and log visitor
 */
(function () {
  var pageMap = {
    'index.html': 'home', 'index': 'home',
    '': 'home', '/': 'home',
    'about.html': 'about', 'about': 'about',
    'contact.html': 'contact', 'contact': 'contact',
    'gallery.html': 'gallery', 'gallery': 'gallery',
    'blog.html': 'share', 'blog': 'share', 'share': 'share',
    'post.html': 'post', 'post': 'post',
    'privacy-policy.html': 'privacy', 'privacy-policy': 'privacy',
    'terms-of-use.html': 'terms', 'terms-of-use': 'terms',
  };
  var path = 'index.html';
  if (typeof window !== 'undefined' && window.location && window.location.pathname) {
    var segments = window.location.pathname.split('/').filter(Boolean);
    path = segments.length ? segments[segments.length - 1] : '';
    path = path.split('?')[0].split('#')[0] || '';
    path = path.toLowerCase();
    if (!path) path = 'index.html';
    if (path === 'index') path = 'index.html';
  }
  var page = pageMap[path] || pageMap['index.html'];

  function logVisit() {
    fetch('/api/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: page, referrer: document.referrer || '' }),
    }).catch(function () {});
  }

  function resolveImgSrc(src) {
    if (!src) return '';
    if (src.indexOf('http://') === 0 || src.indexOf('https://') === 0) return src;
    var origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    return origin + (src.indexOf('/') === 0 ? src : '/' + src);
  }

  function applyContent(data) {
    if (!data) return;
    Object.keys(data).forEach(function (key) {
      var val = data[key];
      if (!val && val !== '') return;
      document.querySelectorAll('[data-content="' + key + '"]').forEach(function (el) {
        if (el.tagName === 'IMG' || el.getAttribute('data-content-src') === 'true') {
          el.src = resolveImgSrc(val);
          el.style.display = val ? '' : 'none';
        } else if (el.getAttribute('data-html') === 'true') {
          var html = val;
          if (html.indexOf('<') === -1) {
            html = html.split(/\n\n+/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
          }
          el.innerHTML = html;
        } else {
          el.textContent = val;
        }
      });
      document.querySelectorAll('[data-mailto="' + key + '"]').forEach(function (el) {
        el.setAttribute('href', 'mailto:' + val);
      });
      document.querySelectorAll('[data-href="' + key + '"]').forEach(function (el) {
        el.setAttribute('href', val || '#');
      });
    });
  }

  function loadContent() {
    fetch('/api/content?page=' + encodeURIComponent(page))
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(applyContent)
      .catch(function () {});
    fetch('/api/content?page=site')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(applyContent)
      .catch(function () {});
  }

  function loadHomeThumbs() {
    document.querySelectorAll('[data-home-thumbs]').forEach(function (grid) {
    var section = grid.closest('[data-category]');
    var cat = section ? section.getAttribute('data-category') : '';
    if (!cat) return;
    var url = ((typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '') + '/api/gallery?category=' + encodeURIComponent(cat);
    fetch(url)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var items = (rows || []).slice(0, 4);
        grid.innerHTML = items.map(function (r) {
          var src = resolveImgSrc(r.src || '');
          return '<figure class="home-thumb-item"><img class="thumb-image" src="' + src + '" alt="' + ((r.alt || r.caption || '').replace(/"/g, '&quot;')) + '" onerror="this.style.display=\'none\'" /><figcaption>' + (r.caption || '').replace(/</g, '&lt;') + '</figcaption></figure>';
        }).join('');
      })
      .catch(function () {});
    });
  }

  function loadGalleryThumbs() {
    document.querySelectorAll('[data-gallery-api]').forEach(function (grid) {
      var cat = grid.getAttribute('data-gallery-api');
      var sub = grid.getAttribute('data-gallery-sub');
      var apiUrl = ((typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '') + '/api/gallery?category=' + encodeURIComponent(cat);
      if (sub) apiUrl += '&sub=' + encodeURIComponent(sub);
      fetch(apiUrl)
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          var items = rows || [];
          grid.innerHTML = items.map(function (r) {
            var src = resolveImgSrc(r.src || '');
            return '<figure class="category-item"><img class="thumb-image" src="' + src + '" alt="' + ((r.alt || r.caption || '').replace(/"/g, '&quot;')) + '" onerror="this.style.display=\'none\'" /><figcaption>' + (r.caption || '').replace(/</g, '&lt;') + '</figcaption></figure>';
          }).join('');
        })
        .catch(function () {});
    });
  }

  function boot() {
    logVisit();
    loadContent();
    if (page === 'home') loadHomeThumbs();
    if (page === 'gallery') loadGalleryThumbs();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
