/* "Every flow, animated" on the architecture page (#flows).
 * Each tested flow gets a small scene: the hub with FleetPermit, the three managed
 * clusters with their gateways, and the calling agent pod. A single clock drives the
 * selected flow through a pure render(step, progress), so any moment can be shown by
 * jumping to a step. Only the selected flow runs, and only while it is on screen and the
 * browser tab is visible. With reduced motion every scene is static and the step list
 * selects moments. Scenario results and timings are read from data/results.json at
 * runtime; the captions live in the page and follow test/e2e/run.sh. */
(function () {
  'use strict';

  var app = document.getElementById('flows-app');
  if (!app) return;
  var panelEls = Array.prototype.slice.call(app.querySelectorAll('.fl-panel[data-flow]'));
  if (!panelEls.length) return;

  var NS = 'http://www.w3.org/2000/svg';
  var DATA_URL = 'data/results.json';
  var TICKET = 'M-13-8H13A3 3 0 0 1 16-5V-3A3 3 0 0 0 16 3V5A3 3 0 0 1 13 8H-13A3 3 0 0 1-16 5V3A3 3 0 0 0-16-3V-5A3 3 0 0 1-13-8Z';
  var NAMES = ['cluster-east', 'cluster-west', 'cluster-edge'];
  var E = 0, W = 1, X = 2;
  var NARROW_BELOW = 600;
  var data = null;

  /* ---------- helpers ---------- */
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; }
  function seg(v, a, b) { return clamp((v - a) / (b - a)); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v, unit) {
    var s = Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
    return unit ? s + ' ' + unit : s;
  }
  /* Progress of step k while the clock is in step i at progress p. */
  function P(i, p, k) { return i > k ? 1 : i < k ? 0 : p; }

  /* DOM writes only when a value changes. */
  function attr(node, name, value) {
    if (!node) return;
    var c = node.__fl || (node.__fl = {});
    if (c[name] === value) return;
    c[name] = value;
    node.setAttribute(name, value);
  }
  function text(node, value) {
    if (!node || node.__flText === value) return;
    node.__flText = value;
    node.textContent = value;
  }
  function sv(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function st_(parent, x, y, str, cls, extra) {
    var a = { x: x, y: y };
    if (cls) a['class'] = cls;
    Object.keys(extra || {}).forEach(function (k) { a[k] = extra[k]; });
    var n = sv('text', a, parent);
    n.textContent = str;
    return n;
  }
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v === true ? '' : String(v));
    });
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  /* ---------- scene geometry ---------- */
  function geometry(narrow, chips) {
    var g = { W: narrow ? 360 : 720, H: 414, narrow: narrow };
    g.hub = narrow ? { x: 6, y: 10, w: 348, h: 132 } : { x: 150, y: 10, w: 420, h: 132 };
    var cw = narrow ? 112 : 220, gap = narrow ? 8 : 20, m = narrow ? 4 : 10;
    g.cl = [0, 1, 2].map(function (k) {
      var x = m + k * (cw + gap);
      return { x: x, y: 192, w: cw, h: 124, cx: x + cw / 2 };
    });
    g.agent = narrow ? { x: 6, y: 356, w: 190, h: 48 } : { x: 200, y: 356, w: 280, h: 48 };
    g.agent.cx = g.agent.x + g.agent.w / 2;
    g.meas = narrow ? { x: 204, y: 356, w: 150, h: 48 } : { x: 494, y: 356, w: 216, h: 48 };
    var hx = g.hub.x, hw = g.hub.w, pad = narrow ? 10 : 16;
    if (chips === 2) g.chips = [{ x: hx + pad, w: (hw - 2 * pad - 8) / 2 }, { x: hx + pad + (hw - 2 * pad - 8) / 2 + 8, w: (hw - 2 * pad - 8) / 2 }];
    else if (chips === 1) g.chips = [{ x: hx + pad, w: hw - 2 * pad }];
    else g.chips = [];
    g.chips.forEach(function (c) { c.y = 60; c.h = 46; });
    var dx = narrow ? 70 : 110, hcx = hx + hw / 2;
    g.wd = g.cl.map(function (c, k) { return [hcx + (k - 1) * dx, g.hub.y + g.hub.h, c.cx, c.y]; });
    g.wc = g.cl.map(function (c) { return [g.agent.cx, g.agent.y, c.cx, c.y + c.h]; });
    g.gwY = 192 + 82 + 15;
    g.lastY = 339;
    return g;
  }

  function spinner(parent, cx, cy) {
    var g = sv('g', { 'class': 'spin-g fade off' }, parent);
    sv('circle', { cx: cx, cy: cy, r: 5.5, 'class': 'spin-bg' }, g);
    sv('circle', { cx: cx, cy: cy, r: 5.5, 'class': 'spin', 'stroke-dasharray': '11 24' }, g);
    return g;
  }

  function build(def, narrow, title) {
    var G = geometry(narrow, def.chips);
    var root = sv('svg', {
      viewBox: '0 0 ' + G.W + ' ' + G.H, 'class': 'fl-svg', role: 'img', focusable: 'false',
      'aria-label': 'Animated scene, ' + title + ': the hub with FleetPermit, cluster-east, cluster-west and cluster-edge with their gateways, and the calling agent pod. The numbered steps below describe each moment.'
    });
    var S = { root: root, G: G, cl: [], wd: [], wc: [], dv: [], calls: [], chips: [] };

    G.wd.forEach(function (w) { S.wd.push(sv('path', { d: 'M' + w[0] + ' ' + w[1] + 'L' + w[2] + ' ' + w[3], 'class': 'wire' }, root)); });
    G.wc.forEach(function (w) { S.wc.push(sv('path', { d: 'M' + w[0] + ' ' + w[1] + 'L' + w[2] + ' ' + w[3], 'class': 'wire call' }, root)); });

    /* hub */
    var hb = G.hub;
    S.hub = sv('g', { 'class': 'hub' }, root);
    sv('rect', { 'class': 'box', x: hb.x, y: hb.y, width: hb.w, height: hb.h, rx: 14 }, S.hub);
    st_(S.hub, hb.x + 14, hb.y + 20, 'Hub cluster', 'dim');
    S.place = st_(S.hub, hb.x + hb.w - 14, hb.y + 20, '', 'mono dimmer tiny', { 'text-anchor': 'end' });
    st_(S.hub, hb.x + 14, hb.y + 40, 'fleetpermit-controller', 'mono ctrl');
    S.hubSpin = spinner(S.hub, hb.x + 14 + 184, hb.y + 35.5);
    var small = narrow && G.chips.length === 2;
    G.chips.forEach(function (c) {
      var g = sv('g', { 'class': 'chip dim', opacity: '0' }, S.hub);
      sv('rect', { x: c.x, y: c.y, width: c.w, height: c.h, rx: 9 }, g);
      var t1 = st_(g, c.x + 12, c.y + 19, '', 'mono chip-t1');
      var t2 = st_(g, c.x + 12, c.y + 36, '', 'chip-t2');
      var d = sv('tspan', {}, t2), ph = sv('tspan', { 'class': 'ph' }, t2);
      /* Two chips side by side on a phone: smaller ring so the tool name keeps clear of it. */
      var rr = small ? 8 : 10, rcx = c.x + c.w - (small ? 15 : 20), rcy = c.y + c.h / 2, circ = 2 * Math.PI * rr;
      var ringG = sv('g', { 'class': 'ringg', opacity: '0' }, g);
      sv('circle', { cx: rcx, cy: rcy, r: rr, 'class': 'ring-bg' }, ringG);
      var ring = sv('circle', { cx: rcx, cy: rcy, r: rr, 'class': 'ring', 'stroke-dasharray': circ.toFixed(2), 'stroke-dashoffset': 0, transform: 'rotate(-90 ' + rcx + ' ' + rcy + ')' }, ringG);
      if (small) t1.setAttribute('class', 'mono chip-t1 sm');
      S.chips.push({ g: g, t1: t1, d: d, ph: ph, ringG: ringG, ring: ring, circ: circ });
    });
    S.status = st_(S.hub, hb.x + 14, hb.y + hb.h - 12, '', 'st dim');
    /* The badge sits outside the hub group so it stays bright while the hub is dimmed. */
    S.badge = sv('g', { 'class': 'badge fade off' }, root);
    sv('rect', { x: hb.x + hb.w - 14 - 62, y: hb.y + 27, width: 62, height: 19, rx: 9.5 }, S.badge);
    st_(S.badge, hb.x + hb.w - 14 - 31, hb.y + 40.5, 'PAUSED', '', { 'text-anchor': 'middle' });

    /* clusters */
    G.cl.forEach(function (c, k) {
      var g = sv('g', { 'class': 'cl' }, root);
      sv('rect', { 'class': 'box', x: c.x, y: c.y, width: c.w, height: c.h, rx: 12 }, g);
      st_(g, c.x + 10, c.y + 21, NAMES[k], 'mono cname');
      var env = st_(g, c.x + 10, c.y + 38, '', 'env');
      var spin = spinner(g, c.x + c.w - 16, c.y + 34.5);
      var slot = sv('g', { 'class': 'slot' }, g);
      sv('rect', { x: c.x + 8, y: c.y + 47, width: c.w - 16, height: 26, rx: 6 }, slot);
      var slotT = st_(slot, c.x + 16, c.y + 64, '', '');
      var gx = c.x + 8, gy = c.y + 82, gw = c.w - 16, gh = 30;
      var layers = {};
      [['idle', narrow ? 'gateway' : 'Envoy gateway'], ['allow', 'ALLOW'], ['deny', 'DENY']].forEach(function (L) {
        var lg = sv('g', { 'class': 'gw gw-' + L[0] + ' fade' + (L[0] === 'idle' ? '' : ' off') }, g);
        sv('rect', { x: gx, y: gy, width: gw, height: gh, rx: 8 }, lg);
        st_(lg, gx + gw / 2, gy + 19.5, L[1], '', { 'text-anchor': 'middle' });
        layers[L[0]] = lg;
      });
      var pulse = sv('rect', { 'class': 'pulse', x: gx, y: gy, width: gw, height: gh, rx: 8, opacity: '0' }, g);
      S.cl.push({ g: g, env: env, spin: spin, slot: slot, slotT: slotT, layers: layers, pulse: pulse, cx: c.cx, cy: gy + gh / 2 });
    });
    G.cl.forEach(function (c, k) {
      S.cl[k].last = st_(root, c.cx, G.lastY, '', 'mono last', { 'text-anchor': 'middle' });
    });

    /* agent pod and the measurement chip */
    var a = G.agent;
    S.agent = sv('g', { 'class': 'agent sre' }, root);
    sv('rect', { 'class': 'box', x: a.x, y: a.y, width: a.w, height: a.h, rx: 12 }, S.agent);
    st_(S.agent, a.x + 12, a.y + 18, 'agent pod, SPIFFE identity', 'dim tiny');
    S.agentName = st_(S.agent, a.x + 12, a.y + 37, 'sre-agent', 'mono aname');
    var m = G.meas;
    S.meas = sv('g', { 'class': 'meas fade off' }, root);
    sv('rect', { x: m.x, y: m.y, width: m.w, height: m.h, rx: 12 }, S.meas);
    S.measL = st_(S.meas, m.x + 12, m.y + 18, '', 'dim tiny');
    S.measV = st_(S.meas, m.x + 12, m.y + 37, '', 'mono mval');

    /* moving tokens, drawn last so they pass over everything */
    G.wd.forEach(function () {
      var g = sv('g', { opacity: '0' }, root);
      var grant = sv('g', {}, g);
      sv('path', { d: TICKET, 'class': 'tk-grant' }, grant);
      sv('line', { x1: 6, y1: -5.5, x2: 6, y2: 5.5, 'class': 'tk-perf' }, grant);
      var withdraw = sv('g', { opacity: '0' }, g);
      sv('path', { d: TICKET, 'class': 'tk-withdraw' }, withdraw);
      sv('line', { x1: 6, y1: -5.5, x2: 6, y2: 5.5, 'class': 'tk-perf' }, withdraw);
      S.dv.push({ g: g, grant: grant, withdraw: withdraw });
    });
    G.wc.forEach(function () {
      var g = sv('g', { 'class': 'call', opacity: '0' }, root);
      var r = sv('rect', { x: -40, y: -11, width: 80, height: 22, rx: 11 }, g);
      var t = st_(g, 0, 3.5, '', 'mono', { 'text-anchor': 'middle' });
      S.calls.push({ g: g, r: r, t: t });
    });
    return S;
  }

  /* ---------- state ---------- */
  function defaults() {
    function cl(placed, env, slot) {
      return { placed: placed, env: env, envTone: 'dim', slot: slot, slotTone: 'dim', gw: 'idle', pulse: -1, last: null, restarting: false, hot: false };
    }
    return {
      hub: { status: '', tone: 'dim', place: 'Placement: env=production', paused: false, hot: false, restarting: false },
      chips: [{ on: false }, { on: false }],
      cl: [cl(true, 'env=production', 'no grant'), cl(true, 'env=production', 'no grant'), cl(false, 'env=staging', 'anchor only')],
      wd: ['', '', 'none'],
      wc: ['', '', ''],
      dv: [null, null, null],
      calls: [null, null, null],
      agent: { who: 'sre', hot: false },
      meas: { on: false, key: '', label: '' }
    };
  }
  function normalize(st) {
    st.cl.forEach(function (c, k) {
      if (st.wd[k] === '' && c.placed === false) st.wd[k] = 'none';
      else if (st.wd[k] === 'none' && c.placed !== false) st.wd[k] = '';
    });
  }

  /* A tool call from the agent to cluster k, travelling while q goes from a to b. */
  function callAt(st, k, tool, res, q, a, b, who) {
    var f = seg(q, a, b);
    if (f <= 0) return;
    var c = st.cl[k];
    if (f < 1) {
      st.calls[k] = { f: f, tool: tool, who: who || 'sre' };
      st.wc[k] = 'on';
      c.gw = 'idle';
      c.last = null;
      c.pulse = -1;
      return;
    }
    st.calls[k] = null;
    c.gw = res;
    c.last = { tool: tool, res: res };
    var z = seg(q, b, Math.min(1, b + 0.2));
    c.pulse = z > 0 && z < 1 ? z : -1;
  }
  /* A ManifestWork change travelling from the hub to cluster k; true once it has arrived. */
  function sendAt(st, k, kind, q, a, b) {
    var f = seg(q, a, b);
    if (f > 0 && f < 1) st.dv[k] = { f: f, kind: kind };
    return f >= 1;
  }
  function grantOn(st, k, label) { st.cl[k].slot = label || 'grant active'; st.cl[k].slotTone = 'teal'; st.wd[k] = 'on'; }
  function grantOff(st, k) { st.cl[k].slot = 'no grant'; st.cl[k].slotTone = 'dim'; st.wd[k] = ''; }
  function idle(st, k) { st.cl[k].gw = 'idle'; st.cl[k].last = null; st.cl[k].pulse = -1; }
  function slot(st, k, label, tone) { st.cl[k].slot = label; st.cl[k].slotTone = tone; }
  function chip(st, k, o) {
    var c = st.chips[k];
    c.on = true;
    Object.keys(o).forEach(function (key) { c[key] = o[key]; });
  }
  function status(st, str, tone) { st.hub.status = str; st.hub.tone = tone || 'dim'; }
  function measure(st, key, label) { st.meas = { on: true, key: key, label: label }; }
  function steps(i, p, n) { var q = []; for (var k = 0; k < n; k++) q.push(P(i, p, k)); return q; }

  /* ---------- the flows ----------
   * steps: milliseconds per step, one per caption in the page. still: the step shown
   * (at its end) when motion is reduced. render(st, i, p) edits a fresh default state. */
  var FLOWS = {
    activation: {
      chips: 1, still: 5, steps: [2800, 3600, 3800, 4000, 3200, 3600],
      render: function (st, i, p) {
        var q = steps(i, p, 6);
        var active = q[2] >= 0.8, ready = q[4] >= 0.5;
        chip(st, 0, { a: ease(seg(q[0], 0, 0.3)), t1: 'restart_workload, get_cluster_health', t2: 'sre-agent · 5 min', phase: ready ? 'Active, Ready' : active ? 'Active' : 'new', tone: active ? 'teal' : 'dim' });
        var placed = q[2] > 0.12;
        st.cl[E].placed = st.cl[W].placed = placed ? true : null;
        st.cl[X].placed = placed ? false : null;
        if (i === 0) status(st, q[0] > 0.35 ? 'New lease received' : '');
        if (i === 1) {
          st.hub.hot = true;
          var s = 'Checking:';
          if (q[1] > 0.2) s += ' subject ✓';
          if (q[1] > 0.45) s += ' tools ✓';
          if (q[1] > 0.7) s += ' duration ✓';
          status(st, s, q[1] > 0.7 ? 'teal' : 'dim');
        }
        if (i === 2) { st.hub.hot = true; status(st, q[2] < 0.3 ? 'Selected: cluster-east, cluster-west' : 'Sending one ManifestWork per cluster', 'teal'); }
        [E, W].forEach(function (k, n) { if (sendAt(st, k, 'grant', q[2], 0.3 + n * 0.03, 0.78 + n * 0.03)) grantOn(st, k); });
        callAt(st, E, 'restart_workload', 'allow', q[3], 0.05, 0.5);
        callAt(st, W, 'restart_workload', 'allow', q[3], 0.08, 0.53);
        if (q[3] > 0.6) measure(st, 'activationToAllowMs', 'lease → first ALLOW');
        if (i === 3) status(st, 'Grants delivered to east and west', 'teal');
        if (i === 4) status(st, ready ? 'Lease Ready on both clusters' : 'Waiting for OCM status feedback', ready ? 'teal' : 'dim');
        if (i === 5) { st.cl[X].hot = true; status(st, 'Nothing rendered for cluster-edge'); }
        callAt(st, X, 'restart_workload', 'deny', q[5], 0.1, 0.55);
      }
    },

    denied: {
      chips: 1, still: 4, steps: [3400, 3400, 3000, 3600, 4200, 3600],
      render: function (st, i, p) {
        var q = steps(i, p, 6);
        if (i === 0) {
          chip(st, 0, { t1: 'No lease yet', t2: 'sre-agent is listed in the policy', tone: 'ghost' });
          status(st, 'No lease for sre-agent');
        }
        if (i >= 1 && i <= 3) {
          chip(st, 0, { a: i === 1 ? ease(seg(q[1], 0, 0.25)) : 1, t1: 'restart_workload, get_cluster_health', t2: 'sre-agent · 5 min', phase: 'Active', tone: 'teal' });
          status(st, 'Lease Active on east and west', 'teal');
        }
        [E, W].forEach(function (k) { if (sendAt(st, k, 'grant', q[1], 0.04, 0.26)) grantOn(st, k); });
        callAt(st, E, 'restart_workload', 'deny', q[0], 0.15, 0.6);
        callAt(st, E, 'read_secret', 'deny', q[1], 0.32, 0.74);
        callAt(st, E, 'scale_workload', 'deny', q[2], 0.12, 0.55);
        if (i === 3) { st.agent.who = 'sec'; st.agent.hot = q[3] < 0.35; }
        callAt(st, E, 'restart_workload', 'deny', q[3], 0.25, 0.68, 'sec');
        if (i === 4) {
          var d4 = q[4] > 0.3;
          chip(st, 0, { a: ease(seg(q[4], 0, 0.2)), t1: 'restart_workload, read_secret', t2: 'sre-agent · 2 min', phase: d4 ? 'Denied' : 'new', tone: d4 ? 'coral' : 'dim' });
          status(st, d4 ? 'Denied: PermissionNotAllowed' : 'Checking the new lease', d4 ? 'coral' : 'dim');
        }
        callAt(st, E, 'read_secret', 'deny', q[4], 0.45, 0.85);
        if (i === 5) {
          var d5 = q[5] > 0.35;
          chip(st, 0, { a: ease(seg(q[5], 0, 0.2)), t1: 'restart_workload', t2: 'sre-agent · 1 hour', phase: d5 ? 'Denied' : 'new', tone: d5 ? 'coral' : 'dim' });
          status(st, d5 ? 'Denied: DurationExceedsMaximum' : 'Checking the new lease', d5 ? 'coral' : 'dim');
        }
      }
    },

    revocation: {
      chips: 1, still: 3, steps: [3000, 3000, 3600, 4000],
      render: function (st, i, p) {
        var q = steps(i, p, 4);
        var del = q[1] > 0.2;
        chip(st, 0, { a: 1 - 0.5 * ease(seg(q[1], 0.45, 0.95)), t1: 'restart_workload, get_cluster_health', t2: 'sre-agent · 5 min', phase: del ? 'deleted' : 'Active', tone: del ? 'coral' : 'teal' });
        [E, W].forEach(function (k, n) {
          grantOn(st, k);
          if (sendAt(st, k, 'withdraw', q[2], 0.15 + n * 0.03, 0.7 + n * 0.03)) grantOff(st, k);
        });
        status(st, 'Lease Active on east and west', 'teal');
        if (i === 1 && del) status(st, 'Lease deleted', 'coral');
        if (i === 2) { st.hub.hot = true; status(st, 'Rendering without the lease rule'); }
        if (i === 3) status(st, 'No grant left for sre-agent');
        callAt(st, E, 'restart_workload', 'deny', q[3], 0.05, 0.5);
        callAt(st, W, 'restart_workload', 'deny', q[3], 0.08, 0.53);
        if (q[3] > 0.6) measure(st, 'revocationToDenyMs', 'delete → first DENY');
      }
    },

    expiry: {
      chips: 2, still: 4, steps: [3200, 3600, 4000, 3800, 3200, 3600],
      render: function (st, i, p) {
        var q = steps(i, p, 6);
        /* Remaining share of the 40 s lease, shown sped up; the 100 s lease drains at 40/100 of that rate. */
        var r0 = i === 0 ? 1 - 0.04 * p : i === 1 ? 0.96 - 0.08 * p : i === 2 ? 0.88 - 0.85 * p : i === 3 ? 0.03 * (1 - seg(p, 0, 0.3)) : 0;
        var extra = i === 4 ? 2 * p : i === 5 ? 2 + 3 * p : 0;
        var r1 = 1 - ((1 - r0) * 40 + extra) / 100;
        var active = q[0] > 0.8, past = q[3] > 0.3, expired = q[5] > 0.25;
        chip(st, 0, { a: ease(seg(q[0], 0, 0.3)), t1: 'get_cluster_health', t2: '40 s', ring: r0,
          phase: expired ? 'Expired' : past ? 'past expiry' : active ? 'Active' : 'new', tone: expired ? 'coral' : past ? 'amber' : active ? 'teal' : 'dim' });
        chip(st, 1, { a: ease(seg(q[0], 0.1, 0.4)), t1: 'restart_workload', t2: '100 s', ring: r1, phase: active ? 'Active' : 'new', tone: active ? 'teal' : 'dim' });
        [E, W].forEach(function (k, n) {
          if (sendAt(st, k, 'grant', q[0], 0.35 + n * 0.03, 0.78 + n * 0.03)) grantOn(st, k, '2 grants');
          if (past) slot(st, k, '1 of 2 expired', 'amber');
          if (sendAt(st, k, 'grant', q[5], 0.35 + n * 0.03, 0.78 + n * 0.03)) grantOn(st, k, '1 grant');
        });
        status(st, active ? 'Two leases Active' : q[0] > 0.3 ? 'Two new leases' : '', active ? 'teal' : 'dim');
        if (i === 5) { st.hub.hot = true; if (expired) status(st, 'Lease Expired, its rule removed', 'coral'); }
        callAt(st, W, 'get_cluster_health', 'allow', q[1], 0.05, 0.4);
        callAt(st, W, 'restart_workload', 'allow', q[1], 0.5, 0.85);
        callAt(st, W, 'get_cluster_health', 'allow', q[2], 0.06, 0.3);
        callAt(st, W, 'get_cluster_health', 'allow', q[2], 0.38, 0.62);
        callAt(st, W, 'get_cluster_health', 'allow', q[2], 0.7, 0.94);
        callAt(st, W, 'get_cluster_health', 'deny', q[3], 0.38, 0.7);
        if (q[3] > 0.75) measure(st, 'expiryToDenyMs', 'expiry → first DENY');
        callAt(st, W, 'restart_workload', 'allow', q[4], 0.1, 0.5);
      }
    },

    hubdown: {
      chips: 1, still: 4, steps: [3800, 3800, 4000, 4000, 3600],
      render: function (st, i, p) {
        var q = steps(i, p, 5);
        var r = i === 0 ? 1 - 0.1 * p : i === 1 ? 0.9 - 0.4 * p : i === 2 ? 0.5 * (1 - seg(p, 0, 0.3)) : 0;
        var active = q[0] > 0.45, past = q[2] > 0.3, expired = q[3] > 0.35;
        chip(st, 0, { a: ease(seg(q[0], 0, 0.25)), t1: 'restart_workload', t2: 'sre-agent · 50 s', ring: r,
          phase: expired ? 'Expired' : past ? 'past expiry' : active ? 'Active' : 'new', tone: expired ? 'coral' : past ? 'amber' : active ? 'teal' : 'dim' });
        var paused = (i === 1 && p > 0.15) || i === 2 || (i === 3 && p < 0.12);
        st.hub.paused = paused;
        [E, W].forEach(function (k, n) {
          if (sendAt(st, k, 'grant', q[0], 0.18 + n * 0.03, 0.45 + n * 0.03)) grantOn(st, k);
          if (past) slot(st, k, 'grant expired', 'amber');
          if (sendAt(st, k, 'withdraw', q[3], 0.45 + n * 0.03, 0.85 + n * 0.03)) grantOff(st, k);
          if (paused) st.wd[k] = 'cut';
        });
        if (i === 0) status(st, active ? 'Lease Active' : 'New lease', active ? 'teal' : 'dim');
        if (paused) status(st, 'Hub paused: API unreachable', 'amber');
        if (i === 3 && !paused) { st.hub.hot = true; status(st, expired ? 'Lease Expired, withdrawing grants' : 'Hub resumed', expired ? 'coral' : 'teal'); }
        if (i === 4) status(st, 'Stale grants withdrawn');
        callAt(st, E, 'restart_workload', 'allow', q[0], 0.52, 0.85);
        callAt(st, W, 'restart_workload', 'allow', q[0], 0.55, 0.88);
        callAt(st, E, 'restart_workload', 'allow', q[1], 0.45, 0.85);
        callAt(st, E, 'restart_workload', 'deny', q[2], 0.38, 0.72);
        callAt(st, W, 'restart_workload', 'deny', q[2], 0.42, 0.76);
        if (q[2] > 0.8) measure(st, 'expiryToDenyHubDownMs', 'expiry → DENY, hub down');
        callAt(st, E, 'restart_workload', 'deny', q[4], 0.05, 0.45);
        callAt(st, W, 'restart_workload', 'deny', q[4], 0.08, 0.48);
        if (q[4] > 0.55) measure(st, 'reconnectConvergenceMs', 'resume → grants gone');
      }
    },

    placement: {
      chips: 1, still: 3, steps: [3800, 3400, 4000, 3800, 3600],
      render: function (st, i, p) {
        var q = steps(i, p, 5);
        var active = q[0] > 0.45;
        chip(st, 0, { a: ease(seg(q[0], 0, 0.25)), t1: 'restart_workload', t2: 'sre-agent · 10 min', phase: active ? 'Active' : 'new', tone: active ? 'teal' : 'dim' });
        var relabel = i >= 1 && !(i === 4 && p > 0.15);
        if (relabel && q[1] > 0.25) { st.cl[W].env = 'env=staging'; st.cl[W].envTone = 'amber'; }
        if (relabel && q[1] > 0.5) { st.cl[X].env = 'env=production'; st.cl[X].envTone = 'amber'; }
        var moved = q[2] > 0.12 && !(i === 4 && p > 0.35);
        if (moved) { st.cl[W].placed = false; st.cl[X].placed = true; }
        [E, W].forEach(function (k, n) { if (sendAt(st, k, 'grant', q[0], 0.15 + n * 0.03, 0.42 + n * 0.03)) grantOn(st, k); });
        if (sendAt(st, W, 'withdraw', q[2], 0.25, 0.7)) grantOff(st, W);
        if (sendAt(st, X, 'grant', q[2], 0.28, 0.73)) grantOn(st, X);
        if (sendAt(st, W, 'grant', q[4], 0.45, 0.85)) grantOn(st, W);
        if (sendAt(st, X, 'withdraw', q[4], 0.48, 0.88)) grantOff(st, X);
        callAt(st, W, 'restart_workload', 'allow', q[0], 0.5, 0.82);
        callAt(st, X, 'restart_workload', 'deny', q[0], 0.55, 0.87);
        callAt(st, W, 'restart_workload', 'deny', q[3], 0.05, 0.45);
        callAt(st, X, 'restart_workload', 'allow', q[3], 0.08, 0.48);
        if (q[3] > 0.55) measure(st, 'placementChangeMs', 'label change → moved');
        if (i === 2 || i === 4) [W, X].forEach(function (k) { idle(st, k); });
        if (i === 0) status(st, active ? 'Lease Active' : 'New lease', active ? 'teal' : 'dim');
        if (i === 1) status(st, q[1] > 0.25 ? 'Cluster labels changed on the hub' : 'Lease Active', q[1] > 0.25 ? 'amber' : 'teal');
        if (i === 2 || i === 3) { st.hub.hot = i === 2; status(st, moved ? 'Selected: cluster-east, cluster-edge' : 'Cluster labels changed on the hub', moved ? 'teal' : 'amber'); }
        if (i === 4) status(st, p > 0.15 ? 'Labels restored' : 'Selected: cluster-east, cluster-edge', p > 0.15 ? 'dim' : 'teal');
      }
    },

    drift: {
      chips: 1, still: 4, steps: [3000, 3200, 3600, 4200, 3800],
      render: function (st, i, p) {
        var q = steps(i, p, 5);
        chip(st, 0, { t1: 'restart_workload', t2: 'sre-agent · 10 min', phase: 'Active', tone: 'teal' });
        grantOn(st, E); grantOn(st, W);
        status(st, 'Lease Active on east and west', 'teal');
        if (i <= 2) st.cl[W].hot = true;
        if (q[1] > 0.35) slot(st, W, 'policy deleted', 'coral');
        if (q[2] > 0) slot(st, W, 'anchor only', 'amber');
        if (i === 3) { st.hub.hot = true; status(st, q[3] < 0.5 ? 'OCM: object missing on west' : 'Re-apply requested', q[3] < 0.5 ? 'amber' : 'teal'); }
        if (sendAt(st, W, 'grant', q[3], 0.55, 0.92)) grantOn(st, W);
        callAt(st, W, 'restart_workload', 'deny', q[2], 0.15, 0.55);
        if (i === 3 && q[3] >= 0.92) idle(st, W);
        callAt(st, W, 'restart_workload', 'allow', q[4], 0.1, 0.5);
        if (q[4] > 0.55) measure(st, 'driftRecoveryMs', 'delete → ALLOW again');
      }
    },

    anchor: {
      chips: 1, still: 3, steps: [3600, 3200, 3800, 4000],
      render: function (st, i, p) {
        var q = steps(i, p, 4);
        chip(st, 0, { t1: 'No lease in this scenario', t2: 'cluster-edge is outside the Placement', tone: 'ghost' });
        status(st, 'No grant for cluster-edge');
        st.cl[X].hot = true;
        if (q[1] > 0.35) slot(st, X, 'no policy', 'coral');
        if (q[3] > 0.2) slot(st, X, 'anchor only', 'dim');
        callAt(st, X, 'read_secret', 'allow', q[2], 0.15, 0.6);
        callAt(st, X, 'read_secret', 'deny', q[3], 0.4, 0.8);
      }
    },

    restarts: {
      chips: 2, still: 2, steps: [3200, 4600, 4600, 3200, 4000],
      render: function (st, i, p) {
        var q = steps(i, p, 5);
        chip(st, 0, { t1: 'restart_workload', t2: '10 min', phase: 'Active', tone: 'teal' });
        var act = q[4] > 0.55;
        if (q[4] > 0) chip(st, 1, { a: ease(seg(q[4], 0, 0.2)), t1: 'get_cluster_health', t2: '2 min', phase: act ? 'Active' : 'new', tone: act ? 'teal' : 'dim' });
        grantOn(st, E); grantOn(st, W);
        [E, W].forEach(function (k, n) { sendAt(st, k, 'grant', q[4], 0.25 + n * 0.03, 0.52 + n * 0.03); });
        st.hub.restarting = i === 1 && p > 0.06;
        st.cl[E].restarting = i === 2 && p > 0.06;
        if (st.cl[E].restarting) { st.cl[E].env = 'restarting'; st.cl[E].envTone = 'amber'; }
        status(st, 'Lease Active', 'teal');
        if (st.hub.restarting) status(st, 'Controller pod restarting', 'amber');
        if (i === 2) status(st, 'FleetPermit controller running again', 'teal');
        if (i === 4) status(st, act ? 'New lease Active' : 'New lease', act ? 'teal' : 'dim');
        callAt(st, E, 'restart_workload', 'allow', q[0], 0.15, 0.6);
        [1, 2].forEach(function (k) {
          callAt(st, E, 'restart_workload', 'allow', q[k], 0.1, 0.33);
          callAt(st, E, 'restart_workload', 'allow', q[k], 0.4, 0.63);
          callAt(st, E, 'restart_workload', 'allow', q[k], 0.7, 0.93);
        });
        callAt(st, E, 'get_cluster_health', 'allow', q[4], 0.6, 0.92);
      }
    }
  };

  /* ---------- state to DOM ---------- */
  function measureValue(key) {
    var m = data && data.latency && data.latency[key];
    if (!m || !isNum(m.p50)) return '';
    return 'median ' + fmt(m.p50, m.unit || 'ms');
  }

  function apply(S, st) {
    var G = S.G, hub = st.hub;
    attr(S.hub, 'class', 'hub' + (hub.paused ? ' paused' : '') + (hub.hot ? ' hot' : '') + (hub.restarting ? ' restarting' : ''));
    text(S.place, hub.place);
    text(S.status, hub.status);
    attr(S.status, 'class', 'st ' + hub.tone);
    attr(S.badge, 'class', 'badge fade' + (hub.paused ? '' : ' off'));
    attr(S.hubSpin, 'class', 'spin-g fade' + (hub.restarting ? '' : ' off'));

    S.chips.forEach(function (c, k) {
      var o = st.chips[k];
      var a = o && o.on ? clamp(o.a === undefined ? 1 : o.a) : 0;
      attr(c.g, 'opacity', a.toFixed(3));
      attr(c.g, 'transform', 'translate(0 ' + ((1 - a) * -6).toFixed(2) + ')');
      if (!o || !o.on) return;
      attr(c.g, 'class', 'chip ' + (o.tone || 'dim'));
      text(c.t1, o.t1 || '');
      text(c.d, (o.t2 || '') + (o.phase ? ' · ' : ''));
      text(c.ph, o.phase || '');
      var ring = isNum(o.ring);
      attr(c.ringG, 'opacity', ring ? '1' : '0');
      if (ring) {
        attr(c.ringG, 'class', 'ringg' + (o.ring <= 0.001 ? ' out' : ''));
        attr(c.ring, 'stroke-dashoffset', (c.circ * (1 - clamp(o.ring))).toFixed(2));
      }
    });

    S.cl.forEach(function (c, k) {
      var o = st.cl[k];
      attr(c.g, 'class', 'cl ' + (o.placed === true ? 'placed' : o.placed === false ? 'unplaced' : 'neutral') + (o.hot ? ' hot' : ''));
      text(c.env, o.env);
      attr(c.env, 'class', 'env ' + o.envTone);
      text(c.slotT, o.slot);
      attr(c.slot, 'class', 'slot ' + o.slotTone);
      ['idle', 'allow', 'deny'].forEach(function (L) { attr(c.layers[L], 'class', 'gw gw-' + L + ' fade' + (o.gw === L ? '' : ' off')); });
      if (o.pulse > 0 && o.pulse < 1 && o.gw !== 'idle') {
        var sx = (1 + 0.05 * o.pulse).toFixed(3), sy = (1 + 0.4 * o.pulse).toFixed(3);
        attr(c.pulse, 'class', 'pulse ' + o.gw);
        attr(c.pulse, 'opacity', (1 - o.pulse).toFixed(3));
        attr(c.pulse, 'transform', 'translate(' + c.cx + ' ' + c.cy + ') scale(' + sx + ' ' + sy + ') translate(' + (-c.cx) + ' ' + (-c.cy) + ')');
      } else {
        attr(c.pulse, 'opacity', '0');
      }
      text(c.last, o.last ? o.last.tool : '');
      attr(c.last, 'class', 'mono last' + (o.last ? ' ' + o.last.res : ''));
      attr(c.spin, 'class', 'spin-g fade' + (o.restarting ? '' : ' off'));
    });

    S.wd.forEach(function (w, k) { attr(w, 'class', 'wire' + (st.wd[k] ? ' ' + st.wd[k] : '')); });
    S.wc.forEach(function (w, k) { attr(w, 'class', 'wire call' + (st.wc[k] ? ' ' + st.wc[k] : '')); });

    S.dv.forEach(function (d, k) {
      var o = st.dv[k];
      if (!o || !(o.f > 0 && o.f < 1)) { attr(d.g, 'opacity', '0'); return; }
      var w = G.wd[k], e = ease(o.f);
      attr(d.g, 'transform', 'translate(' + (w[0] + (w[2] - w[0]) * e).toFixed(1) + ' ' + (w[1] + (w[3] - w[1]) * e).toFixed(1) + ')');
      attr(d.g, 'opacity', Math.min(1, o.f / 0.12, (1 - o.f) / 0.12).toFixed(3));
      attr(d.grant, 'opacity', o.kind === 'withdraw' ? '0' : '1');
      attr(d.withdraw, 'opacity', o.kind === 'withdraw' ? '1' : '0');
    });

    S.calls.forEach(function (c, k) {
      var o = st.calls[k];
      if (!o || !(o.f > 0 && o.f < 1)) { attr(c.g, 'opacity', '0'); return; }
      var x0 = G.agent.cx, y0 = G.agent.y, x1 = G.cl[k].cx, y1 = G.gwY, e = ease(o.f);
      if (c.g.__flTool !== o.tool) {
        c.g.__flTool = o.tool;
        text(c.t, o.tool);
        var w = o.tool.length * 6.1 + 14;
        attr(c.r, 'x', (-w / 2).toFixed(1));
        attr(c.r, 'width', w.toFixed(1));
      }
      attr(c.g, 'class', 'call ' + o.who);
      attr(c.g, 'transform', 'translate(' + (x0 + (x1 - x0) * e).toFixed(1) + ' ' + (y0 + (y1 - y0) * e).toFixed(1) + ')');
      attr(c.g, 'opacity', Math.min(1, o.f / 0.1, (1 - o.f) / 0.14).toFixed(3));
    });

    attr(S.agent, 'class', 'agent ' + st.agent.who + (st.agent.hot ? ' hot' : ''));
    text(S.agentName, st.agent.who === 'sec' ? 'security-agent' : 'sre-agent');

    var val = st.meas.on ? measureValue(st.meas.key) : '';
    attr(S.meas, 'class', 'meas fade' + (val ? '' : ' off'));
    if (val) { text(S.measL, st.meas.label); text(S.measV, val); }
  }

  /* ---------- one player per flow ---------- */
  var ICON_PAUSE = '<svg class="i-pause" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3.5" height="11" rx="1" fill="currentColor"/></svg>';
  var ICON_PLAY = '<svg class="i-play" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false" hidden><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
  var ICON_REPLAY = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.7-4"/><path d="M2.5 2.5v3h3"/></svg>';

  function Flow(panel, index) {
    var self = this;
    this.panel = panel;
    this.index = index;
    this.name = panel.getAttribute('data-flow');
    this.def = FLOWS[this.name];
    this.title = panel.getAttribute('data-tab') || this.name;
    var list = panel.querySelector('.fl-steps');
    var items = list ? Array.prototype.slice.call(list.children) : [];
    this.n = Math.min(items.length, this.def.steps.length);
    this.durs = this.def.steps.slice(0, this.n);
    this.starts = [];
    this.total = 0;
    this.durs.forEach(function (d) { self.starts.push(self.total); self.total += d; });
    this.t = 0;
    this.cur = -1;
    this.scene = null;
    this.narrow = null;
    this.visible = false;

    /* Caption bar copies of the step texts; the list below stays the accessible version. */
    this.capItems = [];
    var caps = h('span', { 'class': 'fl-caps' });
    this.btns = [];
    items.slice(0, this.n).forEach(function (li, k) {
      var span = li.querySelector('.fl-step');
      if (!span) return;
      var inner = span.firstElementChild || span;
      var copy = inner.cloneNode(true);
      caps.appendChild(copy);
      self.capItems.push(copy);
      var btn = h('button', { type: 'button', 'class': 'fl-step' });
      while (span.firstChild) btn.appendChild(span.firstChild);
      span.parentNode.replaceChild(btn, span);
      btn.addEventListener('click', function () { self.jump(k); });
      self.btns.push(btn);
    });

    this.count = h('b', { 'class': 'fl-count' });
    this.stage = h('div', { 'class': 'fl-stage' });
    this.progBar = h('span');
    this.toggle = h('button', { type: 'button', 'class': 'player-btn', 'aria-label': 'Pause animation' });
    this.toggle.innerHTML = ICON_PAUSE + ICON_PLAY + '<span class="lbl">Pause</span>';
    this.replay = h('button', { type: 'button', 'class': 'player-btn' });
    this.replay.innerHTML = ICON_REPLAY + '<span>Replay</span>';
    this.note = h('p', { 'class': 'fl-note', hidden: true, text: 'Motion is reduced on this device, so the scene is static. Select a step to show that moment.' });
    this.player = h('div', { 'class': 'plate player fl-player' }, [
      this.stage,
      h('div', { 'class': 'fl-bar' }, [
        h('div', { 'class': 'fl-prog', 'aria-hidden': 'true' }, [this.progBar]),
        h('p', { 'class': 'fl-cap', 'aria-hidden': 'true' }, [this.count, caps]),
        h('div', { 'class': 'fl-ctl' }, [this.toggle, this.replay])
      ]),
      this.note
    ]);
    if (list) panel.insertBefore(this.player, list);
    else panel.appendChild(this.player);

    this.toggle.addEventListener('click', function () {
      if (self.t >= self.total) { self.t = 0; self.cur = -1; }
      playing = !playing;
      self.paint();
      sync();
      update();
    });
    this.replay.addEventListener('click', function () {
      self.t = 0;
      self.cur = -1;
      playing = !reduced;
      self.paint();
      sync();
      update();
    });
  }
  Flow.prototype.stillT = function () {
    var k = Math.min(this.def.still, this.n - 1);
    return this.starts[k] + this.durs[k] - 0.5;
  };
  Flow.prototype.jump = function (k) {
    if (reduced || !playing) this.t = this.starts[k] + this.durs[k] - 0.5;
    else this.t = this.starts[k];
    this.cur = -1;
    this.paint();
    sync();
    update();
  };
  Flow.prototype.ensureScene = function () {
    var narrow = app.clientWidth > 0 && app.clientWidth < NARROW_BELOW;
    if (this.scene && this.narrow === narrow) return;
    this.narrow = narrow;
    if (this.scene) this.stage.removeChild(this.scene.root);
    this.scene = build(this.def, narrow, this.title);
    this.stage.classList.toggle('narrow', narrow);
    this.stage.appendChild(this.scene.root);
    this.cur = -1;
  };
  Flow.prototype.locate = function () {
    if (this.t >= this.total) return { i: this.n - 1, p: 1 };
    for (var k = this.n - 1; k >= 0; k--) {
      if (this.t >= this.starts[k]) return { i: k, p: clamp((this.t - this.starts[k]) / this.durs[k]) };
    }
    return { i: 0, p: 0 };
  };
  Flow.prototype.paint = function () {
    if (!this.scene) return;
    var at = this.locate();
    var st = defaults();
    this.def.render(st, at.i, at.p);
    normalize(st);
    apply(this.scene, st);
    var frac = (this.total ? Math.min(1, this.t / this.total) : 0).toFixed(3);
    if (this.progVal !== frac) { this.progVal = frac; this.progBar.style.transform = 'scaleX(' + frac + ')'; }
    if (at.i !== this.cur) {
      this.cur = at.i;
      this.count.textContent = 'Step ' + (at.i + 1) + ' of ' + this.n;
      this.capItems.forEach(function (c, k) { c.classList.toggle('on', k === at.i); });
      this.btns.forEach(function (b, k) {
        if (k === at.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.classList.toggle('done', k < at.i);
      });
    }
  };

  var flows = [];
  panelEls.forEach(function (p) { if (FLOWS[p.getAttribute('data-flow')]) flows.push(new Flow(p, flows.length)); });
  if (!flows.length) return;

  /* ---------- tabs ---------- */
  var tablist = h('div', { 'class': 'fl-tabs', role: 'tablist', 'aria-label': 'Tested flows' });
  flows.forEach(function (f, k) {
    var ids = (f.panel.getAttribute('data-ids') || '').split(/\s+/).filter(Boolean).join(' · ');
    var tab = h('button', { type: 'button', 'class': 'fl-tab', role: 'tab', id: 'fl-tab-' + f.name, 'aria-controls': f.panel.id, 'aria-selected': 'false', tabindex: '-1' }, [
      h('span', { 'class': 'fl-tn', 'aria-hidden': 'true', text: String(k + 1) }),
      h('span', { 'class': 'fl-tt', text: f.title }),
      ids ? h('span', { 'class': 'fl-ti' }, [h('span', { 'class': 'visually-hidden', text: 'Scenarios ' }), ids]) : null
    ]);
    tab.addEventListener('click', function () { select(k); });
    tab.addEventListener('keydown', function (e) {
      var n = flows.length, next = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (k + 1) % n;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (k - 1 + n) % n;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = n - 1;
      if (next < 0) return;
      e.preventDefault();
      select(next, true);
    });
    f.tab = tab;
    f.panel.setAttribute('role', 'tabpanel');
    f.panel.setAttribute('aria-labelledby', tab.id);
    f.panel.setAttribute('tabindex', '0');
    tablist.appendChild(tab);
  });
  app.insertBefore(tablist, app.firstChild);

  /* ---------- clock ---------- */
  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(reduceMQ && reduceMQ.matches);
  var current = null;
  var playing = false;
  var raf = 0;
  var last = 0;

  function running() { return !!current && playing && current.visible && !document.hidden && !reduced && current.t < current.total; }
  function frame(now) {
    raf = 0;
    if (!running()) { update(); return; }
    var dt = last ? Math.min(now - last, 100) : 16;
    last = now;
    current.t += dt;
    if (current.t >= current.total) {
      current.t = current.total;
      playing = false;
      current.paint();
      sync();
      update();
      return;
    }
    current.paint();
    raf = window.requestAnimationFrame(frame);
  }
  function update() {
    var run = running();
    if (run && !raf) { last = 0; raf = window.requestAnimationFrame(frame); }
    else if (!run && raf) { window.cancelAnimationFrame(raf); raf = 0; }
    app.classList.toggle('fl-paused', !run);
  }
  function sync() {
    app.classList.toggle('fl-reduced', reduced);
    flows.forEach(function (f) {
      var mine = f === current;
      var ended = f.t >= f.total;
      var showPause = mine && playing && !ended;
      f.toggle.querySelector('.lbl').textContent = showPause ? 'Pause' : 'Play';
      f.toggle.setAttribute('aria-label', showPause ? 'Pause animation' : 'Play animation');
      var iPause = f.toggle.querySelector('.i-pause'), iPlay = f.toggle.querySelector('.i-play');
      if (showPause) { iPause.removeAttribute('hidden'); iPlay.setAttribute('hidden', ''); }
      else { iPlay.removeAttribute('hidden'); iPause.setAttribute('hidden', ''); }
      f.toggle.hidden = reduced;
      f.replay.hidden = reduced;
      f.note.hidden = !reduced;
    });
  }
  function select(k, focus) {
    var f = flows[k];
    if (!f) return;
    flows.forEach(function (g) {
      var on = g === f;
      g.tab.setAttribute('aria-selected', on ? 'true' : 'false');
      g.tab.tabIndex = on ? 0 : -1;
      g.panel.hidden = !on;
    });
    current = f;
    f.ensureScene();
    f.t = reduced ? f.stillT() : 0;
    f.cur = -1;
    playing = !reduced;
    f.paint();
    sync();
    update();
    if (focus) f.tab.focus();
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.target.__flFlow) e.target.__flFlow.visible = e.isIntersecting; });
      update();
    }, { threshold: 0.15 });
    flows.forEach(function (f) { f.player.__flFlow = f; io.observe(f.player); });
  } else {
    flows.forEach(function (f) { f.visible = true; });
  }
  document.addEventListener('visibilitychange', update);
  if (reduceMQ) {
    var onReduce = function () {
      reduced = reduceMQ.matches;
      playing = false;
      if (current) {
        if (reduced) current.t = current.stillT();
        current.cur = -1;
        current.paint();
      }
      sync();
      update();
    };
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);
    else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
  }
  var resizing = 0;
  window.addEventListener('resize', function () {
    if (resizing) return;
    resizing = window.requestAnimationFrame(function () {
      resizing = 0;
      if (!current) return;
      var before = current.scene;
      current.ensureScene();
      if (current.scene !== before) current.paint();
    });
  });

  function fromHash() {
    var id = decodeURIComponent((window.location.hash || '').slice(1));
    for (var k = 0; id && k < flows.length; k++) if (flows[k].panel.id === id) return k;
    return -1;
  }
  var initial = fromHash();
  select(initial >= 0 ? initial : 0);
  if (initial >= 0) window.requestAnimationFrame(function () { tablist.scrollIntoView({ block: 'start' }); });
  window.addEventListener('hashchange', function () {
    var k = fromHash();
    if (k < 0) return;
    select(k);
    tablist.scrollIntoView({ block: 'start' });
  });

  /* ---------- results and timings from data/results.json ---------- */
  function statusLabel(s) {
    if (s === 'pass') return 'Pass';
    if (s === 'fail') return 'Fail';
    if (s === 'unsupported') return 'Unsupported upstream';
    return String(s || 'unknown');
  }
  function pill(status) {
    var safe = status === 'pass' || status === 'fail' || status === 'unsupported' ? status : 'unsupported';
    return h('span', { 'class': 'pill pill-' + safe, text: statusLabel(status) });
  }
  function metricBlock(key, m) {
    if (!m || typeof m !== 'object') return null;
    var unit = m.unit || 'ms';
    var samples = Array.isArray(m.samples) ? m.samples.filter(isNum) : [];
    var sub = [];
    if (isNum(m.p95)) sub.push(h('span', null, ['p95 ', h('b', { text: fmt(m.p95, unit) })]));
    if (isNum(m.min) && isNum(m.max)) sub.push(h('span', null, ['range ', h('b', { text: fmt(m.min, unit) }), ' to ', h('b', { text: fmt(m.max, unit) })]));
    if (samples.length) sub.push(h('span', null, [h('b', { text: String(samples.length) }), samples.length === 1 ? ' sample' : ' samples']));
    if (!isNum(m.p50) && !sub.length) return null;
    return h('div', { 'class': 'fl-m' }, [
      h('p', { 'class': 'fl-ml' }, [h('a', { href: 'results.html#lat-' + key, text: m.label || key })]),
      isNum(m.p50) ? h('p', { 'class': 'fl-mv' }, [h('span', { 'class': 'fl-big' }, [h('b', { text: fmt(m.p50, unit) }), h('small', { text: 'median' })])]) : null,
      sub.length ? h('p', { 'class': 'fl-mx' }, sub) : null,
      m.source ? h('p', { 'class': 'fl-ms', text: 'Source: ' + m.source }) : null
    ]);
  }
  function fill(d) {
    var byId = {};
    var list = d.e2e && Array.isArray(d.e2e.scenarios) ? d.e2e.scenarios : [];
    list.forEach(function (x) { if (x && x.id) byId[String(x.id)] = x; });
    var lat = d.latency && typeof d.latency === 'object' ? d.latency : {};
    flows.forEach(function (f) {
      Array.prototype.forEach.call(f.panel.querySelectorAll('.fl-scen li[data-id]'), function (li) {
        var x = byId[li.getAttribute('data-id')];
        if (!x || li.__flFilled) return;
        li.__flFilled = true;
        li.appendChild(pill(x.status));
        if (x.name) li.appendChild(h('span', { 'class': 'fl-name', text: String(x.name) }));
        var obs = typeof x.observed === 'string' ? x.observed.trim() : '';
        if (obs) li.appendChild(h('span', { 'class': 'fl-obs' }, [h('span', { 'class': 'fl-k', text: 'Recorded: ' }), obs]));
      });
      var box = f.panel.querySelector('.fl-metrics');
      if (!box || box.__flFilled) return;
      var blocks = (box.getAttribute('data-keys') || '').split(/\s+/).filter(Boolean)
        .map(function (key) { return metricBlock(key, lat[key]); }).filter(Boolean);
      if (!blocks.length) return;
      box.__flFilled = true;
      box.textContent = '';
      box.appendChild(h('h4', { text: 'Measured in the lab' }));
      blocks.forEach(function (b) { box.appendChild(b); });
      box.appendChild(h('p', { 'class': 'fl-mnote', text: 'Local kind clusters on one development host. Not a production benchmark.' }));
      box.hidden = false;
      var facts = f.panel.querySelector('.fl-facts');
      if (facts) facts.classList.add('has-metrics');
    });
  }
  function noData() {
    flows.forEach(function (f) {
      var box = f.panel.querySelector('.fl-tested');
      if (box && !box.querySelector('.fl-nodata')) {
        box.appendChild(h('p', { 'class': 'fl-nodata' }, ['Results could not be loaded here. They are on the ', h('a', { href: 'results.html', text: 'results page' }), '.']));
      }
    });
  }
  if (window.fetch) {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (d) {
        if (!d || typeof d !== 'object') throw new Error('unexpected format');
        data = d;
        fill(d);
        if (current) current.paint();
      })
      .catch(noData);
  } else {
    noData();
  }
})();
