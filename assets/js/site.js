/* FleetPermit site: theme toggle, mobile navigation, copy buttons. No dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'fp-theme';
  var THEME_COLOR = { dark: '#0c1728', light: '#f3f6fa' };

  /* One request for data/results.json per page, shared by every script that needs it. */
  var dataPromise = null;
  window.FleetPermitData = {
    load: function () {
      if (!dataPromise) {
        dataPromise = window.fetch('data/results.json', { cache: 'no-cache' }).then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        });
      }
      return dataPromise;
    }
  };

  function storedTheme() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch (e) {
      return null;
    }
  }

  function storeTheme(v) {
    try {
      window.localStorage.setItem(STORAGE_KEY, v);
    } catch (e) {
      /* Storage can be unavailable (private mode, blocked site data). The toggle still works for this page view. */
    }
  }

  /* Dark unless the visitor chose light; the system colour-scheme preference is not used for the default. */
  function effectiveTheme() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  /* The browser UI colour follows the chosen theme. */
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[effectiveTheme()]);
  }

  function syncToggle() {
    syncThemeColor();
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    btn.setAttribute('title', 'Switch to ' + next + ' theme');
  }

  root.setAttribute('data-theme', storedTheme() || 'dark');

  function onReady() {
    syncToggle();

    var toggle = document.querySelector('.theme-toggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        storeTheme(next);
        syncToggle();
      });
    }
    /* Mobile navigation (disclosure pattern). */
    var menuBtn = document.querySelector('.menu-toggle');
    var nav = document.getElementById('site-nav');
    if (menuBtn && nav) {
      menuBtn.addEventListener('click', function () {
        var open = menuBtn.getAttribute('aria-expanded') === 'true';
        menuBtn.setAttribute('aria-expanded', String(!open));
        nav.classList.toggle('is-open', !open);
        if (!open) {
          var first = nav.querySelector('a');
          if (first) first.focus();
        }
      });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') {
          menuBtn.setAttribute('aria-expanded', 'false');
          nav.classList.remove('is-open');
          menuBtn.focus();
        }
      });
    }

    /* Copy buttons on code blocks. */
    var live = document.getElementById('live-status');
    function announce(msg) {
      if (!live) return;
      live.textContent = '';
      window.setTimeout(function () { live.textContent = msg; }, 30);
    }

    function copyText(text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
      }
      return new Promise(function (resolve, reject) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        ta.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        document.body.removeChild(ta);
        if (ok) resolve(); else reject(new Error('copy failed'));
      });
    }

    var blocks = document.querySelectorAll('.code-block');
    Array.prototype.forEach.call(blocks, function (block) {
      var pre = block.querySelector('pre');
      if (!pre || block.hasAttribute('data-no-copy')) return;
      var title = block.querySelector('.code-title');
      var label = title ? (title.getAttribute('data-label') || title.textContent.trim()) : 'code';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn' + (title ? '' : ' floating');
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy ' + label);
      btn.addEventListener('click', function () {
        var text = pre.innerText.replace(/^\$ /gm, '').replace(/\n$/, '');
        if (block.hasAttribute('data-commands-only')) {
          text = pre.innerText.split('\n').filter(function (l) { return /^\$ /.test(l); }).map(function (l) { return l.slice(2); }).join('\n');
        }
        copyText(text).then(function () {
          btn.textContent = 'Copied';
          btn.setAttribute('data-state', 'copied');
          announce('Copied ' + label + ' to the clipboard');
          window.setTimeout(function () {
            btn.textContent = 'Copy';
            btn.removeAttribute('data-state');
          }, 1800);
        }, function () {
          btn.textContent = 'Select and copy';
          announce('Copy is not available here. Select the text and copy it manually.');
        });
      });
      if (title) title.appendChild(btn); else block.appendChild(btn);
      if (pre.scrollWidth > pre.clientWidth) {
        pre.setAttribute('tabindex', '0');
      }
    });

    scrollAreas();
    document.addEventListener('fp:rendered', scrollAreas);
    followHash();
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(scrollAreas, 200);
    });
  }

  /* A #section link can land too low when content above it renders after the page loads
   * (results, flows). Scroll to the target again after each render and on load, unless the
   * visitor has scrolled or interacted since. The results and flows scripts position their
   * own targets (rows, cards, flow tabs), so those are left to them. */
  function followHash() {
    var id = decodeURIComponent((window.location.hash || '').slice(1));
    if (!id) return;
    var moved = false;
    var stop = function () { moved = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
      window.addEventListener(ev, stop, { once: true, passive: true });
    });
    var again = function () {
      if (moved) return;
      var target = document.getElementById(id);
      if (!target || target.closest('#results-root, #results-preview, .fl-panel')) return;
      target.scrollIntoView({ block: 'start' });
    };
    document.addEventListener('fp:rendered', again);
    window.addEventListener('load', function () { window.setTimeout(again, 50); });
    window.setTimeout(function () { document.removeEventListener('fp:rendered', again); }, 10000);
  }

  /* Areas that scroll sideways (tables, code, wide diagrams) get keyboard focus and a
   * name so they can be scrolled without a mouse. It runs again after scripts render
   * content (the fp:rendered event) and after a resize. */
  function scrollAreas() {
    var areas = document.querySelectorAll('.table-wrap, .fig-scroll, .code-block pre, details.evidence pre, .callout pre');
    Array.prototype.forEach.call(areas, function (w) {
      var scrolls = w.scrollWidth > w.clientWidth + 1;
      var ours = w.hasAttribute('data-fp-scroll');
      if (scrolls) {
        if (!w.hasAttribute('tabindex')) { w.setAttribute('tabindex', '0'); w.setAttribute('data-fp-scroll', ''); }
        if (w.tagName !== 'PRE' && !w.hasAttribute('aria-label')) {
          var cap = w.querySelector('caption');
          var named = w.getAttribute('data-label') || (cap ? cap.textContent.trim() : '') || 'Scrollable area';
          w.setAttribute('role', 'region');
          w.setAttribute('aria-label', named);
          w.setAttribute('data-fp-scroll', '');
        }
      } else if (ours) {
        w.removeAttribute('tabindex');
        w.removeAttribute('role');
        w.removeAttribute('aria-label');
        w.removeAttribute('data-fp-scroll');
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
