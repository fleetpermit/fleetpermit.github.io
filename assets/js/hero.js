/* Home page hero: pauses the CSS animation when it is offscreen, the tab is hidden or the
 * visitor asks, and replays recorded lab decisions from data/results.json in a ticker.
 * The ticker never implies a live feed: every row is a call recorded during a lab run. */
(function () {
  'use strict';

  var hero = document.getElementById('hero');
  if (!hero) return;

  var pauseBtn = document.getElementById('fx-pause');
  var list = document.getElementById('ticker-list');
  var win = document.getElementById('ticker-window');
  var sub = document.getElementById('ticker-sub');

  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(reduceMQ && reduceMQ.matches);
  var visible = true;
  var userPaused = false;
  var timer = 0;
  var rows = 0;

  /* The hero runs continuously while it is on screen. It pauses only when it is offscreen,
   * when the tab is hidden, when the visitor presses pause, or under reduced motion. */
  function running() { return visible && !document.hidden && !userPaused && !reduced; }

  function sync() {
    var run = running();
    hero.classList.toggle('fx-paused', !run);
    hero.classList.toggle('fx-user-paused', userPaused);
    hero.classList.toggle('fx-static', reduced);
    if (pauseBtn) {
      pauseBtn.setAttribute('aria-pressed', String(userPaused));
      pauseBtn.querySelector('.lbl').textContent = userPaused ? 'Play motion' : 'Pause motion';
      var iPause = pauseBtn.querySelector('.i-pause'), iPlay = pauseBtn.querySelector('.i-play');
      if (userPaused) { iPause.setAttribute('hidden', ''); iPlay.removeAttribute('hidden'); }
      else { iPlay.setAttribute('hidden', ''); iPause.removeAttribute('hidden'); }
    }
    if (run && rows > 4) startTicker(); else stopTicker();
    if (run) startCountdown(); else stopCountdown();
  }

  if (pauseBtn) {
    pauseBtn.addEventListener('click', function () {
      userPaused = !userPaused;
      sync();
    });
  }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible = e.isIntersecting; });
      sync();
    }, { threshold: 0.02 }).observe(hero);
  }
  document.addEventListener('visibilitychange', sync);
  if (reduceMQ) {
    var onReduce = function () { reduced = reduceMQ.matches; sync(); };
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);
    else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
  }

  /* ---------- Lease countdown label, kept in step with the ring animation ---------- */
  var countEl = document.getElementById('flow-count');
  var countTimer = 0;
  var ringAnim = null;
  var DRAIN = 0.727, EXPIRED_END = 0.927, LEASE_S = 600;
  function findRing() {
    if (ringAnim && ringAnim.playState !== 'idle') return ringAnim;
    if (!document.getAnimations) return null;
    ringAnim = null;
    document.getAnimations().forEach(function (a) { if (a.animationName === 'rg-r') ringAnim = a; });
    return ringAnim;
  }
  function paintCount() {
    var a = findRing();
    if (!a || !countEl || a.currentTime === null) return;
    var dur = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().duration : 11000;
    var phase = (a.currentTime % dur) / dur;
    var text, cls = '';
    if (phase < DRAIN) {
      var left = Math.max(0, Math.round(LEASE_S * (1 - phase / DRAIN)));
      text = 'lease ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2);
    } else if (phase < EXPIRED_END) {
      text = 'lease expired'; cls = 'expired';
    } else {
      text = 'new lease'; cls = 'renew';
    }
    if (countEl.textContent !== text) countEl.textContent = text;
    countEl.classList.toggle('expired', cls === 'expired');
    countEl.classList.toggle('renew', cls === 'renew');
  }
  function startCountdown() {
    if (countTimer || !countEl) return;
    countTimer = window.setInterval(paintCount, 250);
    paintCount();
  }
  function stopCountdown() {
    if (countTimer) window.clearInterval(countTimer);
    countTimer = 0;
    if (reduced && countEl) { countEl.textContent = '10 min lease'; countEl.classList.remove('expired', 'renew'); }
  }

  /* "Star us" demos outside the hero animate only while visible. */
  if ('IntersectionObserver' in window) {
    Array.prototype.forEach.call(document.querySelectorAll('.star-demo'), function (sd) {
      if (hero.contains(sd)) return;
      sd.classList.add('sd-paused');
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { sd.classList.toggle('sd-paused', !e.isIntersecting || document.hidden); });
      }, { threshold: 0.1 }).observe(sd);
    });
  }

  /* ---------- Ticker ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function decisionsFrom(data) {
    var scen = data && data.e2e && Array.isArray(data.e2e.scenarios) ? data.e2e.scenarios : [];
    var matrix = null;
    scen.forEach(function (s) { if (s && s.id === 'MATRIX' && Array.isArray(s.evidence)) matrix = s; });
    var out = [];
    if (matrix) {
      matrix.evidence.forEach(function (r) {
        if (!r || !r.cluster || !r.tool || !r.observed) return;
        out.push({ agent: r.agent, cluster: r.cluster, tool: r.tool, decision: r.observed, ms: r.latencyMs, src: 'lease ' + (r.lease || '') });
      });
      return { rows: interleave(out), source: 'MATRIX' };
    }
    scen.forEach(function (s) {
      (Array.isArray(s.evidence) ? s.evidence : []).forEach(function (r) {
        if (!r || typeof r !== 'object' || !r.cluster || !r.tool || !r.decision) return;
        out.push({ agent: r.agent, cluster: r.cluster, tool: r.tool, decision: r.decision, ms: r.latencyMs, src: s.id });
      });
    });
    return { rows: out, source: 'scenarios' };
  }

  /* Alternate outcomes so the replay shows both answers; the recorded values are unchanged. */
  function interleave(rs) {
    var allow = rs.filter(function (r) { return r.decision === 'ALLOW'; });
    var other = rs.filter(function (r) { return r.decision !== 'ALLOW'; });
    var out = [];
    while (allow.length || other.length) {
      if (allow.length) out.push(allow.shift());
      if (other.length) out.push(other.shift());
      if (other.length && out.length % 3 === 0) out.push(other.shift());
    }
    return out;
  }

  function rowEl(r) {
    var li = el('li');
    var route = el('span', 't-route');
    if (r.agent) {
      route.appendChild(el('span', 't-agent' + (r.agent === 'sre-agent' ? '' : ' sec'), r.agent));
    } else {
      route.appendChild(el('span', 't-agent sec', 'scenario ' + r.src));
    }
    var arrow = el('span', 't-arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    route.appendChild(arrow);
    route.appendChild(el('span', 'visually-hidden', ' to '));
    route.appendChild(document.createTextNode(r.cluster));
    li.appendChild(route);
    li.appendChild(el('span', 't-tool', r.tool));
    var kind = r.decision === 'ALLOW' ? 'allow' : r.decision === 'DENY' ? 'deny' : 'error';
    li.appendChild(el('span', 'pill pill-' + kind, r.decision));
    var ms = el('span', 't-ms');
    if (typeof r.ms === 'number' && isFinite(r.ms)) {
      ms.title = 'Probe round trip for this call';
      ms.appendChild(el('span', 'visually-hidden', 'probe round trip '));
      ms.appendChild(document.createTextNode(r.ms + ' ms'));
    }
    li.appendChild(ms);
    li.appendChild(el('span', 't-src', r.agent ? r.src : ''));
    return li;
  }

  function startTicker() {
    if (timer || !list) return;
    timer = window.setInterval(step, 2400);
  }
  function stopTicker() {
    if (timer) window.clearInterval(timer);
    timer = 0;
  }
  function step() {
    var first = list.firstElementChild;
    if (!first) return;
    var h = first.getBoundingClientRect().height;
    list.style.transition = 'transform 520ms cubic-bezier(0.3, 0.7, 0.2, 1)';
    list.style.transform = 'translateY(' + (-h) + 'px)';
    window.setTimeout(function () {
      list.style.transition = 'none';
      list.appendChild(first);
      list.style.transform = 'none';
    }, 560);
  }

  /* Status pill and headline numbers, only from data/results.json; anything missing is left out. */
  function num(v) { return typeof v === 'number' && isFinite(v); }
  function renderPill(data) {
    var el2 = document.getElementById('fx-pill-text');
    var sm = data && data.e2e && data.e2e.summary;
    if (!el2 || !sm || !num(sm.passed) || !num(sm.total)) return;
    var env = data.e2e.environment;
    var commit = env && typeof env.fleetpermitCommit === 'string' ? env.fleetpermitCommit : '';
    /* A full line for wide screens and a short one for phones; every number comes from the file. */
    var long = [sm.passed + ' of ' + sm.total + ' lab scenarios passed'];
    var short = [sm.passed + '/' + sm.total + ' passed'];
    if (num(sm.failed)) { long.push(sm.failed + ' failed'); short.push(sm.failed + ' failed'); }
    if (num(sm.unsupported)) { long.push(sm.unsupported + ' unsupported upstream'); short.push(sm.unsupported + ' unsupported'); }
    if (commit) long.push('commit ' + commit);
    el2.textContent = '';
    el2.appendChild(el('span', 'pill-long', long.join(' · ')));
    el2.appendChild(el('span', 'pill-short', short.join(' · ')));
  }
  function renderNumbers(data) {
    var ul = document.getElementById('fx-numbers');
    if (!ul) return;
    var items = [];
    var scen = data && data.e2e && Array.isArray(data.e2e.scenarios) ? data.e2e.scenarios : [];
    scen.forEach(function (s) {
      if (!s || s.id !== 'MATRIX' || !Array.isArray(s.evidence) || !s.evidence.length) return;
      var ok = s.evidence.filter(function (r) { return r && (r.match === true || (r.match === undefined && r.expected && r.expected === r.observed)); }).length;
      items.push([ok + '/' + s.evidence.length, 'decision-matrix calls as expected']);
    });
    var lat = (data && data.latency) || {};
    if (lat.activationToAllowMs && num(lat.activationToAllowMs.p50)) items.push([lat.activationToAllowMs.p50 + ' ms', 'median, lease created to first ALLOW']);
    if (lat.expiryToDenyHubDownMs && num(lat.expiryToDenyHubDownMs.p50)) items.push([lat.expiryToDenyHubDownMs.p50 + ' ms', 'median, expiry to DENY with the hub down']);
    if (!items.length) return;
    ul.textContent = '';
    items.slice(0, 3).forEach(function (it) {
      var li = el('li');
      li.appendChild(el('b', null, it[0]));
      li.appendChild(el('span', null, it[1]));
      ul.appendChild(li);
    });
    ul.hidden = false;
  }

  function fail(msg) {
    list.textContent = '';
    var li = el('li');
    li.appendChild(el('span', 't-route', msg));
    list.appendChild(li);
  }

  if (list && window.fetch) {
    fetch('data/results.json', { cache: 'no-cache' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); })
      .then(function (data) {
        renderPill(data);
        renderNumbers(data);
        var d = decisionsFrom(data);
        if (!d.rows.length) { fail('No recorded decisions in this results file.'); return; }
        list.textContent = '';
        d.rows.forEach(function (r) { list.appendChild(rowEl(r)); });
        rows = d.rows.length;
        var when = data.e2e && data.e2e.finishedAt ? String(data.e2e.finishedAt).slice(0, 10) : '';
        if (sub) {
          sub.textContent = '';
          sub.appendChild(document.createTextNode(rows + ' real MCP calls through the lab gateways' + (when ? ', recorded ' + when : '') + ', replayed from '));
          var a = el('a', null, 'data/results.json');
          a.href = 'data/results.json';
          sub.appendChild(a);
          sub.appendChild(document.createTextNode('. Not a live feed. The time on each row is the probe\u2019s round trip for that call.'));
        }
        if (win) win.setAttribute('tabindex', '0');
        sync();
      })
      .catch(function () { fail('Recorded decisions could not be loaded. See the results page.'); });
  }

  sync();
})();
