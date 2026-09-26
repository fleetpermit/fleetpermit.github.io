/* Animated architecture on the home page.
 * A single clock drives a deterministic render(step, progress), so every state can be
 * reached by jumping to a step. The clock runs only while the player is playing, on
 * screen and the tab is visible. With reduced motion the diagram is static and the
 * step list selects discrete states. */
(function () {
  'use strict';

  var player = document.getElementById('player');
  var svg = document.getElementById('scene');
  if (!player || !svg) return;

  var STEPS = [
    { d: 2200, text: 'The agent sre-agent has a SPIFFE identity issued by Kubernetes Pod Certificates.' },
    { d: 2600, text: 'An on-call engineer creates ToolAccessLease incident-42: restart_workload for 10 minutes.' },
    { d: 3800, text: 'FleetPermit checks WHO, WHERE, WHAT and HOW LONG against the policy. All four pass.' },
    { d: 2600, text: 'The OCM Placement selects env=production: cluster-east and cluster-west, not cluster-edge.' },
    { d: 3000, text: 'FleetPermit renders an XAccessPolicy with a CEL time bound and delivers it with ManifestWork.' },
    { d: 2600, text: 'sre-agent calls restart_workload on cluster-east through the gateway. ALLOW.' },
    { d: 3800, text: 'cluster-edge has no grant: DENY. read_secret is not in the lease: DENY.' },
    { d: 3200, text: 'Ten minutes pass, sped up. The lease reaches its expiry time, 10:15:00Z.' },
    { d: 3200, text: 'The same call is now denied by Envoy itself: request.time is past the expiry.' },
    { d: 2800, text: 'FleetPermit marks the lease Expired and withdraws the grant.' }
  ];
  var starts = [];
  var TOTAL = 0;
  STEPS.forEach(function (s) { starts.push(TOTAL); TOTAL += s.d; });

  var RING = 175.93;
  var $ = function (id) { return document.getElementById(id); };
  var el = {};
  ['w-lease', 'w-policy', 'w-east', 'w-west', 'w-edge', 'c-east', 'c-west', 'c-edge',
   'g-lease', 'g-policy', 'g-hub', 'g-ocm', 'g-agent', 'lease-status', 'ring', 'timer',
   'q-who', 'q-where', 'q-what', 'q-howlong', 'check-detail', 'ocm-result',
   'cl-east', 'cl-west', 'cl-edge', 'gw-east-r', 'gw-east-t', 'gw-west-r', 'gw-west-t', 'gw-edge-r', 'gw-edge-t',
   'an-east', 'an-west', 'x-east', 'x-west', 'x-east-r', 'x-west-r', 'x-east-t', 'x-west-t',
   'tok-lease', 'tok-east', 'tok-west', 'tok-call', 'tok-call-t', 'tok-call2'].forEach(function (id) { el[id] = $(id); });

  /* Write an attribute only when it changes. */
  function attr(node, name, value) {
    if (!node) return;
    node.__fp = node.__fp || {};
    if (node.__fp[name] === value) return;
    node.__fp[name] = value;
    node.setAttribute(name, value);
  }
  function text(node, value) {
    if (!node || node.__fpText === value) return;
    node.__fpText = value;
    node.textContent = value;
  }
  function cls(node, base, extra) { attr(node, 'class', extra ? base + ' ' + extra : base); }

  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function ease(v) { v = clamp(v); return v < 0.5 ? 2 * v * v : 1 - Math.pow(-2 * v + 2, 2) / 2; }
  function seg(p, a, b) { return clamp((p - a) / (b - a)); }
  function place(node, x1, y1, x2, y2, f) {
    var k = ease(f);
    attr(node, 'transform', 'translate(' + (x1 + (x2 - x1) * k).toFixed(1) + ' ' + (y1 + (y2 - y1) * k).toFixed(1) + ')');
  }
  function show(node, on) {
    if (!node) return;
    var c = node.getAttribute('class') || '';
    var has = /(^|\s)hide(\s|$)/.test(c);
    if (on && has) node.setAttribute('class', c.replace(/(^|\s)hide(\s|$)/, ' ').trim());
    else if (!on && !has) node.setAttribute('class', (c + ' hide').trim());
  }
  function hot(g, on, color) {
    if (!g) return;
    var r = g.querySelector('rect.box');
    if (r) r.setAttribute('class', on ? 'box ' + (color === 'teal' ? 'hot' : 'active-box') : 'box');
  }
  function gateway(which, state) {
    var r = el['gw-' + which + '-r'];
    var t = el['gw-' + which + '-t'];
    if (state === 'allow') {
      attr(r, 'fill', '#0F3B3A'); attr(r, 'stroke', '#2DD4BF');
      attr(t, 'fill', '#2DD4BF'); attr(t, 'font-weight', '800'); text(t, 'ALLOW');
    } else if (state === 'deny') {
      attr(r, 'fill', '#4A1D27'); attr(r, 'stroke', '#FF7A7A');
      attr(t, 'fill', '#FF7A7A'); attr(t, 'font-weight', '800'); text(t, 'DENY');
    } else {
      attr(r, 'fill', '#0F1E33'); attr(r, 'stroke', '#2E4468');
      attr(t, 'fill', '#E6EDF6'); attr(t, 'font-weight', '400'); text(t, 'Envoy gateway');
    }
  }
  function grant(which, state) {
    var g = el['x-' + which], r = el['x-' + which + '-r'], t = el['x-' + which + '-t'], an = el['an-' + which];
    if (state === 'none') { show(g, false); show(an, true); return; }
    show(g, true); show(an, false);
    if (state === 'expired') {
      attr(r, 'fill', '#4A1D27'); attr(r, 'stroke', '#FF7A7A'); attr(t, 'fill', '#FF9A9A');
      text(t, 'grant: expired at 10:15Z');
    } else {
      attr(r, 'fill', '#0F3B3A'); attr(r, 'stroke', '#2DD4BF'); attr(t, 'fill', '#2DD4BF');
      text(t, 'grant: restart_workload < 10:15Z');
    }
  }

  /* Pure state for (step i, progress p). */
  function render(i, p) {
    function prog(k) { return i > k ? 1 : i < k ? 0 : p; }

    // Highlight the actor that matters in this step.
    hot(el['g-agent'], i === 0 || i === 5 || i === 6 || i === 8);
    hot(el['g-lease'], i === 1 || i === 7);
    hot(el['g-hub'], i === 2 || i === 9, 'teal');
    hot(el['g-ocm'], i === 3, 'teal');
    hot(el['g-policy'], i === 2, 'teal');

    // Lease request travelling to the controller.
    cls(el['w-lease'], 'wire', i === 1 ? 'on' : '');
    cls(el['w-policy'], 'wire', i === 2 ? 'on' : '');
    var lp = prog(1);
    show(el['tok-lease'], i === 1 && lp < 0.85);
    place(el['tok-lease'], 236, 108, 380, 150, seg(lp, 0.1, 0.75));

    // Checks.
    var cp = prog(2);
    var qs = [['q-who', 0.06], ['q-where', 0.3], ['q-what', 0.54], ['q-howlong', 0.78]];
    qs.forEach(function (q) { attr(el[q[0]], 'class', cp >= q[1] ? 'q-on' : ''); });
    var detail = 'Waiting for a lease';
    if (i === 1) detail = lp > 0.75 ? 'Evaluating incident-42' : '';
    if (i === 2) {
      detail = 'Evaluating incident-42';
      if (cp >= 0.06) detail = 'WHO: sre-agent is a subject of the policy';
      if (cp >= 0.3) detail = 'WHERE: clusters come from the OCM Placement';
      if (cp >= 0.54) detail = 'WHAT: restart_workload is a permitted tool';
      if (cp >= 0.78) detail = 'HOW LONG: 10m is within the 1h maximum';
    }
    if (i === 3) detail = 'All four checks passed';
    if (i >= 4 && i <= 7) detail = 'Rendered one XAccessPolicy per selected cluster';
    if (i === 8) detail = 'Lease expired at 10:15:00Z';
    if (i === 9) detail = prog(9) > 0.35 ? 'Grant withdrawn from east and west' : 'Lease expired at 10:15:00Z';
    text(el['check-detail'], detail);

    // Placement.
    var sel = prog(3) > 0.35;
    show(el['ocm-result'], sel);
    cls(el['cl-east'], 'cl', sel ? 'sel' : '');
    cls(el['cl-west'], 'cl', sel ? 'sel' : '');
    cls(el['cl-edge'], 'cl', sel ? 'unsel' : '');
    cls(el['w-edge'], 'wire', sel ? 'off' : '');

    // Delivery.
    var dp = prog(4);
    var withdrawn = i === 9 && prog(9) > 0.35;
    var wireState = dp > 0 ? (withdrawn ? 'gone' : 'on') : '';
    cls(el['w-east'], 'wire', wireState);
    cls(el['w-west'], 'wire', wireState);
    var moving = i === 4 && dp < 0.72;
    show(el['tok-east'], moving);
    show(el['tok-west'], moving);
    place(el['tok-east'], 440, 250, 170, 320, seg(dp, 0.05, 0.7));
    place(el['tok-west'], 500, 250, 500, 320, seg(dp, 0.05, 0.7));
    var delivered = dp >= 0.72;
    var expired = i >= 8 && prog(8) > 0.2;
    var gstate = !delivered || withdrawn ? 'none' : expired ? 'expired' : 'active';
    grant('east', gstate);
    grant('west', gstate);

    // Lease status.
    var status = 'Status: Pending';
    if (delivered) status = 'Status: Active';
    if (expired) status = 'Status: Expired';
    text(el['lease-status'], status);
    var statusColor = expired ? '#FF9A9A' : delivered ? '#2DD4BF' : '#A9B8CD';
    if (el['lease-status'].style.fill !== statusColor) el['lease-status'].style.fill = statusColor;

    // Timer.
    var tp = seg(prog(7), 0.08, 0.9);
    var remaining = Math.round(600 * (1 - tp));
    var mm = Math.floor(remaining / 60), ss = remaining % 60;
    text(el['timer'], (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss);
    attr(el['ring'], 'stroke-dashoffset', (RING * tp).toFixed(2));
    attr(el['ring'], 'stroke', tp >= 1 ? '#FF7A7A' : '#F5B544');
    attr(el['timer'], 'fill', tp >= 1 ? '#FF7A7A' : '#F5B544');

    // Calls from the agent.
    var callTok = el['tok-call'], call2 = el['tok-call2'];
    var gwEast = 'idle', gwEdge = 'idle';
    var callOn = false, call2On = false;
    cls(el['c-east'], 'wire', '');
    cls(el['c-edge'], 'wire', '');
    if (i === 5) {
      var a = seg(p, 0.05, 0.6);
      text(el['tok-call-t'], 'restart_workload');
      callOn = p < 0.64;
      place(callTok, 440, 540, 101, 406, a);
      cls(el['c-east'], 'wire', 'on');
      if (p >= 0.62) gwEast = 'allow';
    } else if (i === 6) {
      call2On = p < 0.4;
      place(call2, 560, 540, 761, 406, seg(p, 0.02, 0.36));
      if (p >= 0.38) gwEdge = 'deny';
      gwEast = p < 0.5 ? 'allow' : 'idle';
      if (p >= 0.46) {
        text(el['tok-call-t'], 'read_secret');
        callOn = p < 0.86;
        place(callTok, 440, 540, 101, 406, seg(p, 0.48, 0.82));
        cls(el['c-east'], 'wire', 'on');
        if (p >= 0.84) gwEast = 'deny';
      }
      cls(el['c-edge'], 'wire', p < 0.5 ? 'off' : '');
    } else if (i === 8) {
      text(el['tok-call-t'], 'restart_workload');
      callOn = p >= 0.22 && p < 0.72;
      place(callTok, 440, 540, 101, 406, seg(p, 0.24, 0.7));
      cls(el['c-east'], 'wire', p >= 0.22 ? 'on' : '');
      if (p >= 0.7) gwEast = 'deny';
    } else if (i === 9) {
      gwEast = 'deny';
    }
    show(callTok, callOn);
    show(call2, call2On);
    gateway('east', gwEast);
    gateway('west', 'idle');
    gateway('edge', gwEdge);
  }

  /* ---------- Player ---------- */
  var caption = $('player-text');
  var counter = $('player-count');
  var captionBox = $('player-caption');
  var toggle = $('player-toggle');
  var replay = $('player-replay');
  var note = $('player-note');
  var stepBtns = Array.prototype.slice.call(document.querySelectorAll('#player-steps .step-btn'));

  var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = !!(reduceMQ && reduceMQ.matches);
  var t = 0;
  var playing = !reduced;
  var visible = false;
  var raf = 0;
  var last = 0;
  var currentStep = -1;
  var STATIC_STEP = 6;

  function locate(time) {
    for (var k = STEPS.length - 1; k >= 0; k--) {
      if (time >= starts[k]) return { i: k, p: clamp((time - starts[k]) / STEPS[k].d) };
    }
    return { i: 0, p: 0 };
  }

  function paint() {
    var at = locate(Math.min(t, TOTAL - 1));
    if (t >= TOTAL) at = { i: STEPS.length - 1, p: 1 };
    render(at.i, at.p);
    if (at.i !== currentStep) {
      currentStep = at.i;
      text(counter, 'Step ' + (at.i + 1) + ' of ' + STEPS.length);
      text(caption, STEPS[at.i].text);
      stepBtns.forEach(function (b, k) {
        if (k === at.i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.classList.toggle('done', k < at.i);
      });
    }
  }

  function syncControls() {
    var ended = t >= TOTAL;
    var lbl = toggle.querySelector('.lbl');
    var iPause = toggle.querySelector('.i-pause');
    var iPlay = toggle.querySelector('.i-play');
    var showPause = playing && !ended;
    lbl.textContent = showPause ? 'Pause' : 'Play';
    toggle.setAttribute('aria-label', showPause ? 'Pause animation' : 'Play animation');
    /* SVG elements have no hidden property, so toggle the attribute. */
    if (showPause) { iPause.removeAttribute('hidden'); iPlay.setAttribute('hidden', ''); }
    else { iPlay.removeAttribute('hidden'); iPause.setAttribute('hidden', ''); }
    player.setAttribute('data-state', ended ? 'ended' : playing ? 'playing' : 'paused');
  }

  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(now - last, 100);
    last = now;
    t += dt;
    if (t >= TOTAL) {
      t = TOTAL;
      playing = false;
      paint();
      stop();
      syncControls();
      return;
    }
    paint();
    raf = window.requestAnimationFrame(frame);
  }
  function start() { if (raf) return; last = 0; raf = window.requestAnimationFrame(frame); }
  function stop() { if (raf) window.cancelAnimationFrame(raf); raf = 0; }
  function update() {
    if (playing && visible && !document.hidden && !reduced) start(); else stop();
  }

  function applyMotionMode() {
    toggle.hidden = reduced;
    replay.hidden = reduced;
    note.hidden = !reduced;
    if (reduced) {
      playing = false;
      stop();
      /* A summary moment: grants delivered, east ALLOW, edge DENY, timer full. */
      t = starts[STATIC_STEP] + STEPS[STATIC_STEP].d * 0.45;
      currentStep = -1;
      paint();
    }
    syncControls();
  }

  toggle.addEventListener('click', function () {
    if (t >= TOTAL) t = 0;
    playing = !playing;
    syncControls();
    update();
  });
  replay.addEventListener('click', function () {
    t = 0;
    playing = true;
    currentStep = -1;
    paint();
    syncControls();
    update();
  });
  stepBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var k = parseInt(b.getAttribute('data-step'), 10);
      captionBox.setAttribute('aria-live', 'polite');
      if (reduced || !playing) {
        t = starts[k] + STEPS[k].d - 1;
      } else {
        t = starts[k];
      }
      currentStep = -1;
      paint();
      syncControls();
      update();
    });
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible = e.isIntersecting; });
      update();
    }, { threshold: 0.2 });
    io.observe(player);
  } else {
    visible = true;
  }
  document.addEventListener('visibilitychange', update);
  if (reduceMQ) {
    var onReduce = function () { reduced = reduceMQ.matches; if (!reduced) { playing = false; } applyMotionMode(); update(); };
    if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', onReduce);
    else if (reduceMQ.addListener) reduceMQ.addListener(onReduce);
  }

  applyMotionMode();
  paint();
  syncControls();
  update();
})();
