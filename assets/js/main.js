/*!
 * Червепедия — основной скрипт. Без зависимостей.
 * Тема · меню · поиск · случайная статья · пагинация · оглавление · слайдеры · просмотр картинок
 */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var body = doc.body;
  var BASE = body.getAttribute('data-base') || '';
  var PAGE_SIZE = parseInt(body.getAttribute('data-page-size'), 10) || 20;

  function $(sel, ctx) { return (ctx || doc).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || doc).querySelectorAll(sel)); }
  function on(el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val);
    } catch (e) { /* приватный режим */ }
    return null;
  }

  /* ======================================================================
     Тема
     ====================================================================== */
  on($('[data-theme-toggle]'), 'click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.classList.add('theme-anim');
    root.setAttribute('data-theme', next);
    store('cw:theme', next);
    setTimeout(function () { root.classList.remove('theme-anim'); }, 350);
    try { if (window.CUSDIS && window.CUSDIS.setTheme) window.CUSDIS.setTheme(next); } catch (e) { /* ignore */ }
  });

  /* ======================================================================
     Меню (мобильное)
     ====================================================================== */
  (function () {
    var btn = $('[data-menu-toggle]'), nav = $('#main-nav');
    if (!btn || !nav) return;
    on(btn, 'click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    on(doc, 'click', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(e.target) || btn.contains(e.target)) return;
      nav.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  })();

  /* ======================================================================
     Скрытые рубрики (по умолчанию «Политика» не показывается)
     ====================================================================== */
  function showHidden() { return root.classList.contains('show-hidden'); }
  function setShowHidden(v) {
    root.classList.toggle('show-hidden', !!v);
    store('cw:hidden', v ? '1' : null);
    $$('[data-politics-toggle]').forEach(function (cb) { cb.checked = !!v; });
    doc.dispatchEvent(new CustomEvent('cw:hiddenchange'));
  }
  $$('[data-politics-toggle]').forEach(function (cb) {
    cb.checked = showHidden();
    on(cb, 'change', function () { setShowHidden(cb.checked); });
  });

  /* ======================================================================
     Индекс статей (search.json) — грузится один раз и только по требованию
     ====================================================================== */
  var indexPromise = null;
  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch(BASE + '/search.json', { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('index ' + r.status); return r.json(); })
      .then(function (list) {
        list.forEach(function (d) {
          d._t = norm(d.t);
          d._i = norm(d.i);
          d._x = norm(d.x);
          d._a = norm((d.a || []).join(' '));
          d._w = d._t.split(' ');
        });
        return list;
      })
      .catch(function (e) { indexPromise = null; throw e; });
    return indexPromise;
  }

  function norm(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }
  function samePage(u) {
    try { return decodeURIComponent(u).replace(/\/$/, '') === decodeURIComponent(location.pathname).replace(/\/$/, ''); }
    catch (e) { return u === location.pathname; }
  }

  /* ======================================================================
     Случайная статья
     ====================================================================== */
  function randomPool(list, ignoreHiddenPref) {
    var allowHidden = !ignoreHiddenPref && showHidden();
    var pool = list.filter(function (d) { return (allowHidden || !d.h) && !samePage(d.u); });
    if (!pool.length) pool = list.filter(function (d) { return allowHidden || !d.h; });
    return pool;
  }
  function goRandom() {
    return loadIndex().then(function (list) {
      var pool = randomPool(list);
      if (!pool.length) { location.href = BASE + '/articles/'; return; }
      location.href = pool[Math.floor(Math.random() * pool.length)].u;
    }).catch(function () { location.href = BASE + '/articles/'; });
  }
  $$('[data-random]').forEach(function (a) {
    on(a, 'click', function (e) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      goRandom();
    });
  });
  // страница /random/
  (function () {
    var st = $('[data-random-status]');
    if (!st) return;
    loadIndex().then(function (list) {
      var pool = randomPool(list);
      if (!pool.length) { st.textContent = 'Пока нет статей для выбора.'; return; }
      location.replace(pool[Math.floor(Math.random() * pool.length)].u);
    }).catch(function () {
      st.innerHTML = 'Не удалось загрузить список статей. <a href="' + BASE + '/articles/">Открыть все статьи</a>';
    });
  })();

  // Карточка случайных статей на главной
  (function () {
    var box = $('[data-random-cards]');
    if (!box) return;
    var btn = $('[data-random-reroll]');
    var queue = [];
    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    function card(d) {
      var a = doc.createElement('a');
      a.className = 'rcard' + (d.m ? '' : ' rcard--noimg');
      a.href = d.u;
      var html = '';
      if (d.m) html += '<img src="' + esc(d.m) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">';
      html += '<span class="rcard-body"><span class="rcard-title">' + esc(d.t) + '</span>' +
        '<span class="rcard-text">' + esc((d.i || '').slice(0, 110)) + '</span></span>';
      a.innerHTML = html;
      var img = $('img', a);
      if (img) on(img, 'error', function () { img.remove(); a.classList.add('rcard--noimg'); });
      return a;
    }
    function render(list) {
      var pool = randomPool(list, true).filter(function (d) { return !d.h; });
      if (!pool.length) return;
      if (queue.length < 3) queue = shuffle(pool.slice());
      var pick = queue.splice(0, Math.min(3, pool.length));
      box.innerHTML = '';
      pick.forEach(function (d) { var c = card(d); c.classList.add('is-reroll'); box.appendChild(c); });
      if (btn) btn.hidden = pool.length <= 3;
    }
    function ready() { box.classList.remove('is-pending'); }
    setTimeout(ready, 2500);
    loadIndex().then(function (list) {
      render(list);
      ready();
      on(btn, 'click', function () {
        render(list);
        btn.classList.remove('is-spin'); void btn.offsetWidth; btn.classList.add('is-spin');
      });
    }).catch(ready); // остаётся серверная подборка
  })();

  /* ======================================================================
     Поиск
     ====================================================================== */
  var EN2RU = { q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', '[': 'х', ']': 'ъ', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о', k: 'л', l: 'д', ';': 'ж', "'": 'э', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь', ',': 'б', '.': 'ю' };
  function fixLayout(s) {
    return String(s).toLowerCase().split('').map(function (c) { return EN2RU[c] || c; }).join('');
  }
  function lev1(a, b) { // расстояние Левенштейна ≤ 1 ?
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  function searchDocs(list, query, includeHidden) {
    var q = norm(query);
    var tokens = q.split(' ').filter(Boolean);
    if (!tokens.length) return { hits: [], hiddenHits: 0, tokens: [] };
    var hits = [], hiddenHits = 0;
    list.forEach(function (d) {
      var score = 0, ok = true;
      for (var k = 0; k < tokens.length; k++) {
        var t = tokens[k], s = 0;
        if (d._t.indexOf(t) !== -1) {
          s += 10;
          if ((' ' + d._t).indexOf(' ' + t) !== -1) s += 5;
        }
        if (d._a && d._a.indexOf(t) !== -1) s += 8;
        if (d._i.indexOf(t) !== -1) s += 4;
        if (d._x.indexOf(t) !== -1) s += 2;
        if (!s && t.length >= 4) {
          for (var w = 0; w < d._w.length; w++) {
            if (d._w[w].length >= 3 && lev1(d._w[w].slice(0, t.length), t)) { s += 3; break; }
          }
        }
        if (!s) { ok = false; break; }
        score += s;
      }
      if (!ok) return;
      if (d._t === q) score += 40;
      else if (d._t.indexOf(q) === 0) score += 20;
      if (d.h && !includeHidden) { hiddenHits++; return; }
      hits.push({ d: d, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score || (a.d.d < b.d.d ? 1 : -1); });
    return { hits: hits, hiddenHits: hiddenHits, tokens: tokens };
  }
  function smartSearch(list, query, includeHidden) {
    var r = searchDocs(list, query, includeHidden);
    if (!r.hits.length && !r.hiddenHits) {
      var fixed = fixLayout(query);
      if (fixed !== query.toLowerCase()) {
        var r2 = searchDocs(list, fixed, includeHidden);
        if (r2.hits.length || r2.hiddenHits) { r2.fixed = fixed; return r2; }
      }
    }
    return r;
  }
  function highlight(text, tokens) {
    var out = esc(text);
    tokens.forEach(function (t) {
      if (t.length < 2) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/е/g, '[её]') + ')', 'gi');
      out = out.replace(re, function (m, p1, off, str) {
        // не ломаем HTML-сущности
        var before = str.lastIndexOf('&', off), semi = str.lastIndexOf(';', off);
        if (before > semi && before !== -1) return m;
        return '<mark>' + p1 + '</mark>';
      });
    });
    return out;
  }
  function snippet(d, tokens) {
    var text = d.x || '';
    var low = text.toLowerCase().replace(/ё/g, 'е');
    var pos = -1;
    for (var i = 0; i < tokens.length; i++) { var p = low.indexOf(tokens[i]); if (p !== -1 && (pos === -1 || p < pos)) pos = p; }
    if (pos === -1) return (d.i || text).slice(0, 180);
    var start = Math.max(0, pos - 70), end = Math.min(text.length, pos + 120);
    return (start > 0 ? '… ' : '') + text.slice(start, end) + (end < text.length ? ' …' : '');
  }

  // --- Подсказки в поисковой строке ---
  function bindSuggest(form) {
    var input = $('[data-search-input]', form), box = $('[data-search-suggest]', form);
    if (!input || !box) return;
    var timer = null, items = [], active = -1;

    function close() { box.hidden = true; box.innerHTML = ''; items = []; active = -1; }
    function setActive(n) {
      items.forEach(function (el) { el.classList.remove('is-active'); });
      active = n;
      if (items[n]) { items[n].classList.add('is-active'); items[n].scrollIntoView({ block: 'nearest' }); }
    }
    function run() {
      var q = input.value.trim();
      if (q.length < 2) return close();
      loadIndex().then(function (list) {
        if (input.value.trim() !== q) return;
        var r = smartSearch(list, q, showHidden());
        var html = '';
        r.hits.slice(0, 6).forEach(function (h) {
          var d = h.d;
          var thumb = d.m ? '<img src="' + esc(d.m) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : esc((d.t || '?').charAt(0));
          html += '<a class="suggest-item" href="' + esc(d.u) + '"><span class="suggest-thumb">' + thumb + '</span><span><span class="suggest-title">' +
            highlight(d.t, r.tokens) + '</span><span class="suggest-meta" style="display:block">' + esc(d.n ? d.n + ' · ' : '') + esc((d.i || '').slice(0, 90)) + '</span></span></a>';
        });
        if (!r.hits.length) html = '<div class="suggest-empty">Ничего не найдено</div>';
        html += '<div class="suggest-all"><a href="' + BASE + '/search/?q=' + encodeURIComponent(q) + '">Все результаты →</a></div>';
        box.innerHTML = html;
        box.hidden = false;
        items = $$('.suggest-item', box);
        active = -1;
      }).catch(close);
    }
    on(input, 'input', function () { clearTimeout(timer); timer = setTimeout(run, 90); });
    on(input, 'focus', function () { loadIndex().catch(function () {}); if (input.value.trim().length >= 2) run(); });
    on(input, 'keydown', function (e) {
      if (box.hidden || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((active + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((active - 1 + items.length) % items.length); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); location.href = items[active].href; }
      else if (e.key === 'Escape') { close(); }
    });
    on(doc, 'click', function (e) { if (!form.contains(e.target)) close(); });
  }
  $$('[data-search-form]').forEach(bindSuggest);

  // --- Страница результатов /search/ ---
  (function () {
    var list = $('[data-search-results]');
    if (!list) return;
    var status = $('[data-search-status]');
    var input = $('[data-search-page-input]');
    var pagerNav = $('[data-pager]');
    var params = new URLSearchParams(location.search);
    var q = (params.get('q') || '').trim();
    if (input) input.value = q;
    var pager = pagerNav ? makePager(list, pagerNav, { countEl: null }) : null;

    function render() {
      if (q.length < 1) { status.textContent = 'Введите запрос в строку поиска.'; list.innerHTML = ''; if (pager) pager.refresh(true); return; }
      status.textContent = 'Ищем…';
      loadIndex().then(function (idx) {
        var r = smartSearch(idx, q, showHidden());
        var html = '';
        r.hits.forEach(function (h) {
          var d = h.d;
          var thumb = d.m
            ? '<a class="entry-thumb" href="' + esc(d.u) + '" tabindex="-1" aria-hidden="true"><img src="' + esc(d.m) + '" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add(\'entry-thumb--empty\');this.remove()"></a>'
            : '<a class="entry-thumb entry-thumb--empty" href="' + esc(d.u) + '" tabindex="-1" aria-hidden="true"><span>' + esc((d.t || '?').charAt(0)) + '</span></a>';
          html += '<li class="entry" data-hidden="0">' + thumb + '<div class="entry-body"><h3 class="entry-title"><a href="' + esc(d.u) + '">' + highlight(d.t, r.tokens) + '</a></h3>' +
            '<p class="entry-text">' + highlight(snippet(d, r.tokens), r.tokens) + '</p>' +
            '<p class="entry-meta">' + esc(d.n || '') + '</p></div></li>';
        });
        list.innerHTML = html;
        var msg = r.hits.length ? 'Найдено: ' + r.hits.length : 'По запросу «' + q + '» ничего не найдено.';
        if (r.fixed) msg += ' (показаны результаты для «' + r.fixed + '»)';
        status.textContent = msg;
        if (r.hiddenHits && !showHidden()) {
          var n = r.hiddenHits;
          status.innerHTML = esc(msg) + ' · ещё ' + n + ' в скрытых рубриках — <a href="#" data-show-hidden>показать</a>';
          on($('[data-show-hidden]', status), 'click', function (e) { e.preventDefault(); setShowHidden(true); });
        }
        if (pager) pager.refresh(true);
      }).catch(function () {
        status.textContent = 'Не удалось загрузить поиск. Попробуйте обновить страницу.';
      });
    }
    on(doc, 'cw:hiddenchange', render);
    render();
  })();

  /* ======================================================================
     Пагинация списков (на клиенте; все ссылки при этом лежат в HTML — индексируются)
     ====================================================================== */
  function makePager(list, nav, opts) {
    opts = opts || {};
    var countEl = opts.countEl === undefined ? $('[data-list-count]') : opts.countEl;
    var page = 1;

    function entries() {
      return $$(':scope > .entry', list).filter(function (el) { return el.dataset.hidden !== '1' || showHidden(); });
    }
    function readPage() {
      var p = parseInt(new URLSearchParams(location.search).get('page'), 10);
      return p > 0 ? p : 1;
    }
    function href(p) {
      var u = new URL(location.href);
      if (p <= 1) u.searchParams.delete('page'); else u.searchParams.set('page', p);
      return u.pathname + u.search;
    }
    function go(p, push) {
      page = p;
      if (push) history.pushState(null, '', href(p));
      draw(true);
    }
    function link(label, p, cls, aria) {
      var a = doc.createElement(cls && cls.indexOf('is-current') !== -1 ? 'span' : 'a');
      a.textContent = label;
      if (cls) a.className = cls;
      if (a.tagName === 'A') {
        a.href = href(p);
        a.addEventListener('click', function (e) { e.preventDefault(); go(p, true); });
      } else { a.setAttribute('aria-current', 'page'); }
      if (aria) a.setAttribute('aria-label', aria);
      return a;
    }
    function draw(scroll) {
      var all = entries();
      var total = all.length;
      var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      if (page > pages) page = pages;
      $$(':scope > .entry', list).forEach(function (el) { el.hidden = true; });
      all.forEach(function (el, i) { el.hidden = !(i >= (page - 1) * PAGE_SIZE && i < page * PAGE_SIZE); });
      if (countEl) countEl.innerHTML = total ? 'Статей: <strong>' + total + '</strong>' : 'Статей пока нет';
      nav.innerHTML = '';
      if (pages <= 1) { nav.hidden = true; return; }
      nav.hidden = false;
      nav.appendChild(link('‹ Назад', page - 1, page === 1 ? 'is-disabled' : '', 'Предыдущая страница'));
      var shown = {};
      [1, 2, page - 1, page, page + 1, pages - 1, pages].forEach(function (n) { if (n >= 1 && n <= pages) shown[n] = true; });
      var prev = 0;
      Object.keys(shown).map(Number).sort(function (a, b) { return a - b; }).forEach(function (n) {
        if (prev && n - prev > 1) { var g = doc.createElement('span'); g.className = 'is-gap'; g.textContent = '…'; nav.appendChild(g); }
        nav.appendChild(link(String(n), n, n === page ? 'is-current' : '', 'Страница ' + n));
        prev = n;
      });
      nav.appendChild(link('Вперёд ›', page + 1, page === pages ? 'is-disabled' : '', 'Следующая страница'));
      if (scroll) {
        var top = list.getBoundingClientRect().top;
        if (top < 70) window.scrollTo({ top: window.pageYOffset + top - 120, behavior: 'smooth' });
      }
    }
    on(window, 'popstate', function () { page = readPage(); draw(false); });
    on(doc, 'cw:hiddenchange', function () { page = 1; draw(false); });
    var api = {
      refresh: function (reset) { page = reset ? readPage() : page; draw(false); },
      reset: function () { page = 1; draw(false); }
    };
    page = readPage();
    draw(false);
    return api;
  }

  $$('[data-paginate]').forEach(function (list) {
    var nav = list.parentNode.querySelector('[data-pager]');
    if (!nav) return;
    var pager = makePager(list, nav);
    var sel = $('[data-sort]');
    if (sel && list.hasAttribute('data-sortable')) {
      on(sel, 'change', function () {
        var els = $$(':scope > .entry', list);
        els.sort(sel.value === 'title'
          ? function (a, b) { return a.dataset.title.localeCompare(b.dataset.title, 'ru'); }
          : function (a, b) { return a.dataset.date < b.dataset.date ? 1 : a.dataset.date > b.dataset.date ? -1 : 0; });
        els.forEach(function (el) { list.appendChild(el); });
        pager.reset();
      });
    }
  });

  /* ======================================================================
     Статья: оглавление, таблицы, якоря
     ====================================================================== */
  var content = $('#article-content');
  if (content) {
    // картинки из markdown: ленивая загрузка
    $$('img:not([loading])', content).forEach(function (im) {
      im.loading = 'lazy'; im.decoding = 'async'; im.referrerPolicy = 'no-referrer';
    });
    // таблицы — в прокручиваемую обёртку
    $$('table', content).forEach(function (t) {
      if (t.parentNode.classList.contains('table-wrap')) return;
      var w = doc.createElement('div'); w.className = 'table-wrap';
      t.parentNode.insertBefore(w, t); w.appendChild(t);
    });

    var heads = $$('h2, h3', content);
    var used = {};
    function slug(s) {
      var base = s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'razdel';
      var id = base, n = 2;
      while (used[id]) id = base + '-' + (n++);
      used[id] = true; return id;
    }
    heads.forEach(function (h) {
      if (h.id) used[h.id] = true;
    });
    heads.forEach(function (h) {
      if (!h.id) h.id = slug(h.textContent);
      var a = doc.createElement('a');
      a.className = 'anchor'; a.href = '#' + h.id; a.setAttribute('aria-label', 'Ссылка на раздел'); a.textContent = '#';
      h.appendChild(a);
    });

    var side = $('[data-toc-side]'), inline = $('[data-toc-inline]');
    if (heads.length >= 2 && (side || inline)) {
      var ol = doc.createElement('ol'), lastLi = null;
      heads.forEach(function (h) {
        var li = doc.createElement('li');
        var a = doc.createElement('a');
        a.href = '#' + h.id;
        a.textContent = h.textContent.replace(/#$/, '');
        li.appendChild(a);
        if (h.tagName === 'H3' && lastLi) {
          var sub = lastLi.querySelector('ol');
          if (!sub) { sub = doc.createElement('ol'); lastLi.appendChild(sub); }
          sub.appendChild(li);
        } else { ol.appendChild(li); lastLi = li; }
      });
      var layout = $('.article-layout');
      var wide = layout && layout.classList.contains('has-toc');
      [side, inline].forEach(function (box) {
        if (!box) return;
        $('nav', box).appendChild(ol.cloneNode(true));
        box.hidden = (box === side) && !wide;
      });
      if (inline && window.innerWidth < 720) inline.removeAttribute('open');

      // подсветка текущего раздела
      if (side && 'IntersectionObserver' in window) {
        var links = {};
        $$('a', side).forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
        var current = null;
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (en.isIntersecting) {
              if (current) current.classList.remove('is-active');
              current = links[en.target.id] || null;
              if (current) {
                current.classList.add('is-active');
                var top = current.offsetTop - side.offsetTop, vh = side.clientHeight;
                if (top < side.scrollTop + 40 || top > side.scrollTop + vh - 60) side.scrollTo({ top: Math.max(0, top - vh / 3), behavior: 'smooth' });
              }
            }
          });
        }, { rootMargin: '-72px 0px -70% 0px', threshold: 0 });
        heads.forEach(function (h) { io.observe(h); });
      }
    }
  }

  /* ======================================================================
     Возраст в инфобоксе: считается автоматически от даты рождения/смерти
     ====================================================================== */
  (function () {
    var rows = $$('.infobox-table tr');
    if (!rows.length) return;
    var MON = { 'января': 0, 'февраля': 1, 'марта': 2, 'апреля': 3, 'мая': 4, 'июня': 5, 'июля': 6, 'августа': 7, 'сентября': 8, 'октября': 9, 'ноября': 10, 'декабря': 11 };
    function parse(t) {
      t = String(t).replace(/\u00a0/g, ' ').trim();
      var m;
      if ((m = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(t))) return { y: +m[3], m: +m[2] - 1, d: +m[1], full: true };
      if ((m = /(\d{4})-(\d{2})-(\d{2})/.exec(t))) return { y: +m[1], m: +m[2] - 1, d: +m[3], full: true };
      if ((m = /(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i.exec(t)) && MON[m[2].toLowerCase()] !== undefined) return { y: +m[3], m: MON[m[2].toLowerCase()], d: +m[1], full: true };
      if ((m = /^\D*(\d{4})\D*$/.exec(t))) return { y: +m[1], full: false };
      return null;
    }
    function years(n) {
      var a = n % 100, b = n % 10;
      return n + ' ' + ((a > 10 && a < 15) ? 'лет' : b === 1 ? 'год' : (b > 1 && b < 5) ? 'года' : 'лет');
    }
    function age(b, e) { // e: {y,m,d} или Date
      var ey = e.y !== undefined ? e.y : e.getFullYear();
      var em = e.m !== undefined ? e.m : e.getMonth();
      var ed = e.d !== undefined ? e.d : e.getDate();
      var a = ey - b.y;
      if (b.full && (em * 100 + ed) < (b.m * 100 + b.d)) a--;
      return Math.max(0, a);
    }
    function add(td, text) {
      var s = doc.createElement('span'); s.className = 'age'; s.textContent = ' ' + text; td.appendChild(s);
    }
    var birth = null, death = null, ageRow = null;
    rows.forEach(function (tr) {
      var th = $('th', tr), td = $('td', tr);
      if (!th || !td) return;
      var label = th.textContent.trim().toLowerCase();
      if (/^возраст$/.test(label)) ageRow = { td: td, p: parse(td.textContent) };
      else if (/дата рождения|родил|рождение/.test(label)) birth = { td: td, p: parse(td.textContent) };
      else if (/дата смерти|умер|смерть/.test(label)) death = { td: td, p: parse(td.textContent) };
    });
    var now = new Date();
    if (ageRow && ageRow.p) {
      ageRow.td.textContent = (ageRow.p.full ? '' : '≈ ') + years(age(ageRow.p, now));
    }
    if (birth && birth.p) {
      var approx = birth.p.full ? '' : '≈ ';
      if (death && death.p) add(death.td, '(в возрасте ' + approx + years(age(birth.p, death.p)) + ')');
      else add(birth.td, '(' + approx + years(age(birth.p, now)) + ')');
    }
  })();

  /* ======================================================================
     Галерея: если фото больше 6 — листаем страницами по 6
     ====================================================================== */
  $$('ul.gallery').forEach(function (ul) {
    var items = $$(':scope > li', ul), PER = 6;
    if (items.length <= PER) return;
    var pages = Math.ceil(items.length / PER);
    var wrap = doc.createElement('div'); wrap.className = 'gallery-pager';
    var track = doc.createElement('div'); track.className = 'gallery-track';
    var cols = ul.style.getPropertyValue('--cols');
    for (var i = 0; i < pages; i++) {
      var page = doc.createElement('ul'); page.className = 'gallery-page gallery';
      if (cols) page.style.setProperty('--cols', cols);
      items.slice(i * PER, (i + 1) * PER).forEach(function (li) { page.appendChild(li); });
      track.appendChild(page);
    }
    var nav = doc.createElement('div'); nav.className = 'gallery-nav';
    nav.innerHTML = '<button type="button" class="g-prev" aria-label="Назад"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></button><span class="g-count"></span><button type="button" class="g-next" aria-label="Вперёд"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button>';
    wrap.appendChild(track); wrap.appendChild(nav);
    ul.parentNode.replaceChild(wrap, ul);
    var prev = $('.g-prev', nav), next = $('.g-next', nav), cnt = $('.g-count', nav), idx = 0, ticking = false;
    function update() {
      idx = Math.max(0, Math.min(pages - 1, Math.round(track.scrollLeft / (track.clientWidth || 1))));
      cnt.textContent = (idx + 1) + ' / ' + pages;
      prev.disabled = idx === 0; next.disabled = idx === pages - 1;
    }
    function go(n) { track.scrollTo({ left: Math.max(0, Math.min(pages - 1, n)) * track.clientWidth, behavior: 'smooth' }); }
    on(track, 'scroll', function () { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); }, { passive: true });
    on(prev, 'click', function () { go(idx - 1); });
    on(next, 'click', function () { go(idx + 1); });
    on(window, 'resize', function () { track.scrollLeft = idx * track.clientWidth; });
    update();
  });

  /* ======================================================================
     Подписи к картинкам: 2 строки, полный текст — по наведению
     ====================================================================== */
  var capBoxes = $$('.cap-box');
  function checkCap(box) {
    var t = $('.cap-text', box); if (!t) return;
    var full = $('.cap-full', box);
    if (!full) { full = doc.createElement('span'); full.className = 'cap-full'; box.appendChild(full); }
    full.textContent = t.textContent;
    box.classList.toggle('is-clamped', t.scrollHeight > t.clientHeight + 1);
  }
  function checkCaps() { capBoxes.forEach(checkCap); }
  if (capBoxes.length) {
    checkCaps();
    on(window, 'resize', checkCaps);
    on(window, 'load', checkCaps);
    $$('.carousel-caption').forEach(function (c) {
      if (window.MutationObserver) new MutationObserver(function () { checkCap(c.parentNode); }).observe(c, { childList: true, characterData: true, subtree: true });
    });
  }

  /* ======================================================================
     Слайдеры (carousel)
     ====================================================================== */
  $$('[data-carousel]').forEach(function (fig) {
    var track = $('.carousel-track', fig), slides = $$('.carousel-slide', fig);
    var prev = $('.carousel-prev', fig), next = $('.carousel-next', fig);
    var count = $('.carousel-count', fig), cap = $('.carousel-caption', fig);
    if (!track || slides.length < 2) return;
    prev.hidden = next.hidden = false;
    track.tabIndex = 0;
    track.setAttribute('role', 'group');
    track.setAttribute('aria-label', 'Фотографии');
    var idx = 0, ticking = false;
    function update() {
      var w = track.clientWidth || 1;
      idx = Math.max(0, Math.min(slides.length - 1, Math.round(track.scrollLeft / w)));
      if (count) count.textContent = (idx + 1) + ' / ' + slides.length;
      if (cap) { var im = $('img', slides[idx]); cap.textContent = im ? (im.getAttribute('data-caption') || '') : ''; }
      prev.disabled = idx === 0; next.disabled = idx === slides.length - 1;
    }
    function go(n) {
      n = Math.max(0, Math.min(slides.length - 1, n));
      track.scrollTo({ left: n * track.clientWidth, behavior: 'smooth' });
    }
    on(track, 'scroll', function () {
      if (ticking) return; ticking = true;
      requestAnimationFrame(function () { ticking = false; update(); });
    }, { passive: true });
    on(prev, 'click', function () { go(idx - 1); });
    on(next, 'click', function () { go(idx + 1); });
    on(track, 'keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(idx + 1); }
    });
    on(window, 'resize', function () { track.scrollLeft = idx * track.clientWidth; });
    update();
  });

  /* ======================================================================
     Просмотр картинок (lightbox): единая галерея на всю статью
     ====================================================================== */
  (function () {
    var imgs = $$('img[data-lightbox]');
    if (!imgs.length) return;
    var lb = null, el = {}, cur = 0, lastFocus = null, sx = 0, sy = 0;

    function build() {
      lb = doc.createElement('div');
      lb.className = 'lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-modal', 'true'); lb.setAttribute('aria-label', 'Просмотр изображения');
      lb.innerHTML =
        '<button class="lb-btn lb-close" type="button" aria-label="Закрыть"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
        '<button class="lb-btn lb-prev" type="button" aria-label="Предыдущее"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg></button>' +
        '<button class="lb-btn lb-next" type="button" aria-label="Следующее"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg></button>' +
        '<div class="lb-spinner" hidden></div><img class="lb-img" alt=""><div class="lb-cap"></div><div class="lb-count"></div>';
      el.img = $('.lb-img', lb); el.cap = $('.lb-cap', lb); el.count = $('.lb-count', lb); el.spin = $('.lb-spinner', lb);
      el.prev = $('.lb-prev', lb); el.next = $('.lb-next', lb); el.close = $('.lb-close', lb);
      on(el.close, 'click', close);
      on(el.prev, 'click', function (e) { e.stopPropagation(); step(-1); });
      on(el.next, 'click', function (e) { e.stopPropagation(); step(1); });
      on(lb, 'click', function (e) { if (e.target === lb) close(); });
      on(lb, 'touchstart', function (e) { sx = e.changedTouches[0].clientX; sy = e.changedTouches[0].clientY; }, { passive: true });
      on(lb, 'touchend', function (e) {
        var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.4) close();
      }, { passive: true });
    }
    function capOf(img) {
      if (img.getAttribute('data-caption')) return img.getAttribute('data-caption');
      var f = img.closest('figure'); var fc = f && $('figcaption', f);
      if (fc && !f.classList.contains('carousel')) return fc.textContent.replace(/\s+/g, ' ').trim();
      return img.alt || '';
    }
    function show(n) {
      cur = (n + imgs.length) % imgs.length;
      var im = imgs[cur];
      el.spin.hidden = false; el.img.style.opacity = '.35';
      var src = im.currentSrc || im.src;
      var loader = new Image();
      loader.onload = loader.onerror = function () {
        if (imgs[cur] !== im) return;
        el.img.src = src; el.img.alt = im.alt || ''; el.img.style.opacity = ''; el.spin.hidden = true;
      };
      loader.src = src;
      el.cap.textContent = capOf(im);
      el.count.textContent = imgs.length > 1 ? (cur + 1) + ' / ' + imgs.length : '';
      var multi = imgs.length > 1;
      el.prev.hidden = el.next.hidden = !multi;
      if (multi) { [1, -1].forEach(function (d) { var p = new Image(); p.src = imgs[(cur + d + imgs.length) % imgs.length].src; }); }
    }
    function step(d) { show(cur + d); }
    function onKey(e) {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Tab') { e.preventDefault(); el.close.focus(); }
    }
    function open(n) {
      if (!lb) build();
      lastFocus = doc.activeElement;
      doc.body.appendChild(lb);
      body.classList.add('lb-open');
      doc.addEventListener('keydown', onKey);
      show(n);
      el.close.focus();
    }
    function close() {
      if (!lb || !lb.parentNode) return;
      lb.parentNode.removeChild(lb);
      body.classList.remove('lb-open');
      doc.removeEventListener('keydown', onKey);
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    imgs.forEach(function (im, i) {
      im.tabIndex = 0;
      im.setAttribute('role', 'button');
      on(im, 'click', function (e) { e.preventDefault(); open(i); });
      on(im, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); } });
    });
  })();

  /* ======================================================================
     Комментарии: Cusdis (анонимные, бесплатные) или Telegram — грузим лениво
     ====================================================================== */
  (function () {
    var box = $('[data-comments-cusdis]') || $('[data-comments]');
    if (!box) return;
    var isCusdis = box.hasAttribute('data-comments-cusdis');
    var loaded = false;
    function load() {
      if (loaded) return; loaded = true;
      var btn = $('[data-comments-load]', box); if (btn) btn.remove();
      var dark = root.getAttribute('data-theme') === 'dark';
      var s = doc.createElement('script');
      s.async = true;
      if (isCusdis) {
        var th = $('#cusdis_thread', box);
        if (th) th.setAttribute('data-theme', dark ? 'dark' : 'light');
        s.src = 'https://cusdis.com/js/cusdis.es.js';
      } else {
        s.src = 'https://telegram.org/js/telegram-widget.js?22';
        s.setAttribute('data-telegram-discussion', box.getAttribute('data-channel'));
        s.setAttribute('data-comments-limit', '8');
        if (dark) s.setAttribute('data-dark', '1');
      }
      box.appendChild(s);
    }
    on($('[data-comments-load]', box), 'click', load);
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (en[0].isIntersecting) { io.disconnect(); load(); }
      }, { rootMargin: '300px 0px' });
      io.observe(box);
    }
  })();
})();
