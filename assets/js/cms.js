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

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  /** 首页多区块并行请求易撞上无服务器冷启动/DB 瞬时失败，做有限次重试 */
  function fetchGalleryRows(category) {
    var url = '/api/gallery?category=' + encodeURIComponent(category);
    var max = 4;
    function delay(ms) {
      return new Promise(function (res) {
        setTimeout(res, ms);
      });
    }
    function tryOnce(i) {
      return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('gallery http ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (!Array.isArray(data)) throw new Error('gallery not array');
          return data;
        })
        .catch(function () {
          if (i + 1 < max) {
            return delay(280 * (i + 1) + Math.random() * 120).then(function () {
              return tryOnce(i + 1);
            });
          }
          return [];
        });
    }
    return tryOnce(0);
  }

  function bindHomeThumbImgRetry(grid) {
    grid.querySelectorAll('.thumb-image').forEach(function (img) {
      img.addEventListener(
        'error',
        function onImgErr() {
          img.removeEventListener('error', onImgErr);
          if (img.dataset.thumbRetry) return;
          img.dataset.thumbRetry = '1';
          var base = (img.getAttribute('src') || '').split('?')[0];
          if (base) img.src = base + '?_=' + Date.now();
        },
        { passive: true }
      );
    });
  }

  function applyContent(data) {
    if (!data) return;
    var navSocialHideClass = {
      site_nav_show_youtube: 'nav-hide-social-yt',
      site_nav_show_pinterest: 'nav-hide-social-pin',
      site_nav_show_instagram: 'nav-hide-social-insta',
    };
    Object.keys(data).forEach(function (key) {
      var val = data[key];
      if (!val && val !== '') return;
      if (key === 'site_email_label' && val) {
        document.querySelectorAll('[data-mailto="site_email"], [data-contact-link]').forEach(function (el) {
          el.setAttribute('title', val);
          el.setAttribute('aria-label', val);
        });
        return;
      }
      if (navSocialHideClass[key]) {
        var showSocial =
          val === undefined ||
          val === null ||
          String(val) === '' ||
          String(val) === '1' ||
          String(val).toLowerCase() === 'true';
        document.body.classList.toggle(navSocialHideClass[key], !showSocial);
        return;
      }
      document.querySelectorAll('[data-content="' + key + '"]').forEach(function (el) {
        if (el.tagName === 'IMG' || el.getAttribute('data-content-src') === 'true') {
          el.src = resolveImgSrc(val);
          el.style.display = val ? '' : 'none';
          var wrap = el.closest('.about-photo');
          if (wrap) {
            var fb = wrap.querySelector('[data-intro-photo-fallback]');
            if (fb) fb.style.display = val ? 'none' : '';
          }
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

  function renderHomeThumbGrid(grid, rows) {
    if (!Array.isArray(rows)) rows = [];
    var items = rows.slice(0, 4);
    grid.innerHTML = items
      .map(function (r) {
        var src = resolveImgSrc(r.src || '');
        var alt = escAttr(r.alt || r.caption || '');
        var cap = (r.caption || '').replace(/</g, '&lt;');
        return (
          '<figure class="home-thumb-item"><img class="thumb-image" src="' +
          escAttr(src) +
          '" alt="' +
          alt +
          '" /><figcaption>' +
          cap +
          '</figcaption></figure>'
        );
      })
      .join('');
    bindHomeThumbImgRetry(grid);
  }

  /** 单次请求拉齐首页四类，避免四次独立 /api 调用在无服务器环境下的冷启动与并发失败 */
  function fetchHomeThumbBundle() {
    var url = '/api/gallery?home=1';
    var max = 5;
    function delay(ms) {
      return new Promise(function (res) {
        setTimeout(res, ms);
      });
    }
    function tryOnce(i) {
      return fetch(url, { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) {
          if (!r.ok) throw new Error('gallery home http ' + r.status);
          return r.json();
        })
        .then(function (data) {
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('gallery home shape');
          /* 确保四类键始终为数组，避免缺键导致空白 */
          var cats = ['decorated', 'fondant', 'french', 'cookies'];
          for (var c = 0; c < cats.length; c++) {
            var k = cats[c];
            if (!Array.isArray(data[k])) data[k] = [];
          }
          return data;
        })
        .catch(function () {
          if (i + 1 < max) {
            return delay(280 * (i + 1) + Math.random() * 120).then(function () {
              return tryOnce(i + 1);
            });
          }
          return null;
        });
    }
    return tryOnce(0);
  }

  function loadHomeThumbsPerSection() {
    var grids = document.querySelectorAll('[data-home-thumbs]');
    grids.forEach(function (grid, idx) {
      var section = grid.closest('[data-category]');
      var cat = section ? section.getAttribute('data-category') : '';
      if (!cat) return;
      setTimeout(function () {
        fetchGalleryRows(cat).then(function (rows) {
          renderHomeThumbGrid(grid, rows);
        });
      }, idx * 75);
    });
  }

  function loadHomeThumbs() {
    var grids = document.querySelectorAll('[data-home-thumbs]');
    if (!grids.length) return;
    fetchHomeThumbBundle().then(function (bundle) {
      if (!bundle) {
        loadHomeThumbsPerSection();
        return;
      }
      grids.forEach(function (grid) {
        var section = grid.closest('[data-category]');
        var cat = section ? section.getAttribute('data-category') : '';
        if (!cat) return;
        renderHomeThumbGrid(grid, bundle[cat] || []);
      });
    });
  }

  var GALLERY_PAGE_SIZE = 30;

  function isGalleryGridActive(grid) {
    var section = grid.closest('.category-section');
    if (!section || !section.classList.contains('is-active')) return false;
    var subBlock = grid.closest('.subcategory-block');
    if (subBlock) return subBlock.classList.contains('is-active');
    return true;
  }

  function getGalleryListPage() {
    var p = parseInt(new URLSearchParams(window.location.search).get('page') || '1', 10);
    if (isNaN(p) || p < 1) return 1;
    return p;
  }

  function galleryListPageHref(nextPage) {
    var p = new URLSearchParams(window.location.search);
    if (nextPage <= 1) p.delete('page');
    else p.set('page', String(nextPage));
    var q = p.toString();
    return window.location.pathname + (q ? '?' + q : '');
  }

  function removeGalleryPaginationAfter(grid) {
    var n = grid.nextElementSibling;
    if (n && n.classList && n.classList.contains('gallery-pagination')) n.remove();
  }

  function renderGalleryPagination(grid, meta) {
    removeGalleryPaginationAfter(grid);
    var totalPages = meta.totalPages;
    if (totalPages <= 1) return;
    var page = meta.page;
    var nav = document.createElement('nav');
    nav.className = 'gallery-pagination';
    nav.setAttribute('aria-label', 'Gallery pages');
    var prevDisabled = page <= 1;
    var nextDisabled = page >= totalPages;
    nav.innerHTML =
      '<button type="button" class="gallery-page-prev"' +
      (prevDisabled ? ' disabled' : '') +
      '>Previous</button>' +
      '<span class="gallery-page-status">Page ' +
      page +
      ' / ' +
      totalPages +
      '</span>' +
      '<button type="button" class="gallery-page-next"' +
      (nextDisabled ? ' disabled' : '') +
      '>Next</button>';
    grid.insertAdjacentElement('afterend', nav);
    var prevBtn = nav.querySelector('.gallery-page-prev');
    var nextBtn = nav.querySelector('.gallery-page-next');
    if (!prevDisabled && prevBtn) {
      prevBtn.addEventListener('click', function () {
        window.location.href = galleryListPageHref(page - 1);
      });
    }
    if (!nextDisabled && nextBtn) {
      nextBtn.addEventListener('click', function () {
        window.location.href = galleryListPageHref(page + 1);
      });
    }
  }

  function loadGalleryThumbs() {
    document.querySelectorAll('[data-gallery-api]').forEach(function (grid) {
      if (!isGalleryGridActive(grid)) {
        removeGalleryPaginationAfter(grid);
        grid.innerHTML = '';
        return;
      }
      var cat = grid.getAttribute('data-gallery-api');
      var sub = grid.getAttribute('data-gallery-sub');
      var listPage = getGalleryListPage();
      var origin =
        typeof window !== 'undefined' && window.location && window.location.origin
          ? window.location.origin
          : '';
      var apiUrl =
        origin +
        '/api/gallery?paged=1&limit=' +
        GALLERY_PAGE_SIZE +
        '&page=' +
        encodeURIComponent(String(listPage)) +
        '&category=' +
        encodeURIComponent(cat);
      if (sub) apiUrl += '&sub=' + encodeURIComponent(sub);
      fetch(apiUrl, { cache: 'no-store', credentials: 'same-origin' })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (data) {
          if (!data || !Array.isArray(data.items)) return;
          var items = data.items;
          grid.innerHTML = items
            .map(function (r) {
              var src = resolveImgSrc(r.src || '');
              return (
                '<figure class="category-item"><img class="thumb-image" src="' +
                src +
                '" alt="' +
                (r.alt || r.caption || '').replace(/"/g, '&quot;') +
                '" onerror="this.style.display=\'none\'" /><figcaption>' +
                (r.caption || '').replace(/</g, '&lt;') +
                '</figcaption></figure>'
              );
            })
            .join('');
          var totalPages =
            typeof data.totalPages === 'number' && data.totalPages > 0 ? data.totalPages : 1;
          var pageNum = typeof data.page === 'number' ? data.page : 1;
          renderGalleryPagination(grid, { page: pageNum, totalPages: totalPages });
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

  /* 从 bfcache 恢复时脚本不会再次 DOMContentLoaded，补载一次首页缩略图 */
  window.addEventListener('pageshow', function (ev) {
    if (ev.persisted && page === 'home') loadHomeThumbs();
  });
})();
