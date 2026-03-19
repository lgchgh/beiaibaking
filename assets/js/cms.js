/**
 * CMS: Load dynamic content and log visitor
 */
(function () {
  var pageMap = {
    'index.html': 'home',
    '': 'home',
    '/': 'home',
    'about.html': 'about',
    'contact.html': 'contact',
    'gallery.html': 'gallery',
    'blog.html': 'blog',
    'privacy-policy.html': 'privacy',
    'terms-of-use.html': 'terms',
  };
  var path = window.location.pathname.split('/').pop() || 'index.html';
  var page = pageMap[path] || pageMap['index.html'];

  function logVisit() {
    fetch('/api/visitors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: page, referrer: document.referrer || '' }),
    }).catch(function () {});
  }

  function applyContent(data) {
    if (!data) return;
    Object.keys(data).forEach(function (key) {
      var val = data[key];
      if (!val && val !== '') return;
      document.querySelectorAll('[data-content="' + key + '"]').forEach(function (el) {
        if (el.getAttribute('data-html') === 'true') {
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
    fetch('/api/gallery?category=' + encodeURIComponent(cat))
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var items = (rows || []).slice(0, 4);
        if (items.length === 0) return;
        grid.innerHTML = items.map(function (r) {
          return '<figure class="home-thumb-item"><img class="thumb-image" src="' + (r.src || '') + '" alt="' + (r.alt || r.caption || '') + '" /><figcaption>' + (r.caption || '') + '</figcaption></figure>';
        }).join('');
      })
      .catch(function () {});
    });
  }

  function loadGalleryThumbs() {
    document.querySelectorAll('[data-gallery-api]').forEach(function (grid) {
      var cat = grid.getAttribute('data-gallery-api');
      var sub = grid.getAttribute('data-gallery-sub');
      var url = '/api/gallery?category=' + encodeURIComponent(cat);
      if (sub) url += '&sub=' + encodeURIComponent(sub);
      fetch(url)
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          var items = rows || [];
          grid.innerHTML = items.map(function (r) {
            return '<figure class="category-item"><img class="thumb-image" src="' + (r.src || '') + '" alt="' + (r.alt || r.caption || '') + '" /><figcaption>' + (r.caption || '') + '</figcaption></figure>';
          }).join('');
        })
        .catch(function () {});
    });
  }

  logVisit();
  loadContent();
  if (page === 'home') loadHomeThumbs();
  if (page === 'gallery') loadGalleryThumbs();
})();
