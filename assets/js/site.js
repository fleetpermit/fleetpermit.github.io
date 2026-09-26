/* FleetPermit site: theme toggle, mobile navigation, copy buttons. No dependencies. */
(function () {
  'use strict';

  var root = document.documentElement;
  var STORAGE_KEY = 'fp-theme';

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

  function syncToggle() {
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

    /* Scrollable tables get keyboard focus so they can be scrolled without a mouse. */
    Array.prototype.forEach.call(document.querySelectorAll('.table-wrap'), function (w) {
      if (w.scrollWidth > w.clientWidth) {
        w.setAttribute('tabindex', '0');
        if (!w.hasAttribute('aria-label')) {
          var cap = w.querySelector('caption');
          w.setAttribute('role', 'region');
          w.setAttribute('aria-label', cap ? cap.textContent.trim() : 'Scrollable table');
        }
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();
})();
