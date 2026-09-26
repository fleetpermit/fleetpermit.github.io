/* Demo page: the policy playground and graceful fallbacks for demo videos.
 * The playground is an educational model of FleetPermit's checks. It does not contact a cluster. */
(function () {
  'use strict';

  /* ---------- Policy playground ----------
   * Models the gateway's decision for one call under one active lease, with the checks in
   * the controller's order: WHO, WHAT, HOW LONG, WHERE. It does not model lease admission. */
  var form = document.getElementById('pg-form');
  if (form) {
    var MODEL = {
      subjects: ['sre-agent'],
      selected: ['cluster-east', 'cluster-west'],
      permissions: ['get_cluster_health', 'restart_workload', 'scale_workload'],
      leaseTools: ['get_cluster_health', 'restart_workload'],
      expiresAt: '2026-09-26T10:15:00Z'
    };
    var SCENARIO = {
      allow: { id: 'S1', text: 'S1: permitted tool with an active lease' },
      who: { id: 'S3', text: 'S3: wrong SPIFFE identity' },
      where: { id: 'S6', text: 'S6: cluster outside the placement' },
      what: { id: 'S2', text: 'S2: prohibited tool and tool outside the lease' },
      howlong: { id: 'S5', text: 'S5: lease expiry' }
    };

    var verdict = document.getElementById('pg-verdict');
    var verdictText = document.getElementById('pg-verdict-text');
    var summary = document.getElementById('pg-summary');
    var checks = document.getElementById('pg-checks');
    var rule = document.getElementById('pg-rule');
    var ruleWrap = document.getElementById('pg-rule-wrap');
    var link = document.getElementById('pg-link');
    var recBox = document.getElementById('pg-recorded');
    var recLine = document.getElementById('pg-rec-line');
    var recDetail = document.getElementById('pg-rec-detail');
    var recorded = null; /* agent|cluster|tool|lease -> MATRIX evidence row, from data/results.json */

    var ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var ICON_NO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

    function value(name) {
      var el = form.querySelector('input[name="' + name + '"]:checked');
      return el ? el.value : '';
    }

    function evaluate(s) {
      var short = s.cluster.replace('cluster-', '');
      var list = [
        {
          key: 'who', q: 'WHO?',
          ok: MODEL.subjects.indexOf(s.agent) !== -1,
          pass: s.agent + ' is a subject of policy sre-remediation.',
          fail: s.agent + ' is not a subject of the policy. No rule matches its SPIFFE ID, so the gateway denies.',
          note: 'spiffe://cluster.local/ns/agents/sa/' + s.agent
        },
        {
          key: 'what', q: 'WHAT?',
          ok: MODEL.leaseTools.indexOf(s.tool) !== -1,
          pass: s.tool + ' is granted by the active lease.',
          fail: MODEL.permissions.indexOf(s.tool) === -1
            ? s.tool + ' is not in the policy permissions, so no lease can grant it. The rendered rule does not list it.'
            : s.tool + ' is permitted by the policy but not granted by the active lease.',
          note: ''
        },
        {
          key: 'howlong', q: 'HOW LONG?',
          ok: s.lease === 'active',
          pass: 'The lease has not expired: request.time is before ' + MODEL.expiresAt + '.',
          fail: 'The lease expired at ' + MODEL.expiresAt + '. The CEL rule compares request.time with that timestamp, so Envoy denies.',
          note: ''
        },
        {
          key: 'where', q: 'WHERE?',
          ok: MODEL.selected.indexOf(s.cluster) !== -1,
          pass: s.cluster + ' is selected by the Placement (env=production).',
          fail: s.cluster + ' is env=staging, so the Placement does not select it. It never receives a grant, and its default-deny anchor denies every call.',
          note: ''
        }
      ];
      var firstFail = -1;
      for (var i = 0; i < list.length; i++) { if (!list[i].ok) { firstFail = i; break; } }
      return { list: list, firstFail: firstFail, short: short };
    }

    function render() {
      var s = { agent: value('agent'), tool: value('tool'), cluster: value('cluster'), lease: value('lease') };
      var r = evaluate(s);
      var allowed = r.firstFail === -1;

      verdict.className = 'verdict ' + (allowed ? 'allow' : 'deny');
      verdict.querySelector('.mark').innerHTML = allowed ? ICON_OK : ICON_NO;
      verdictText.textContent = allowed ? 'ALLOW' : 'DENY';

      var failed = allowed ? null : r.list[r.firstFail];
      summary.textContent = allowed
        ? s.agent + ' may call ' + s.tool + ' on ' + s.cluster + ' while the lease is active.'
        : 'Denied: the ' + failed.q.replace('?', '') + ' check fails' + (r.firstFail < r.list.length - 1 ? ' first, so the later checks are not evaluated.' : '.');

      checks.textContent = '';
      r.list.forEach(function (c, i) {
        var li = document.createElement('li');
        var state = allowed || i < r.firstFail ? 'ok' : i === r.firstFail ? 'bad' : 'skip';
        li.className = state;
        var q = document.createElement('span');
        q.className = 'q';
        q.textContent = c.q;
        var d = document.createElement('span');
        d.className = 'detail';
        var label = document.createElement('span');
        label.className = 'visually-hidden';
        label.textContent = state === 'ok' ? 'Passed: ' : state === 'bad' ? 'Failed: ' : 'Not evaluated: ';
        d.appendChild(label);
        d.appendChild(document.createTextNode(state === 'ok' ? c.pass : state === 'bad' ? c.fail : 'Not evaluated after the first failed check.'));
        if (state !== 'skip' && c.note) {
          var small = document.createElement('small');
          small.textContent = c.note;
          d.appendChild(small);
        }
        li.appendChild(q);
        li.appendChild(d);
        checks.appendChild(li);
      });

      var toolsList = MODEL.leaseTools.map(function (t) { return "'" + t + "'"; }).join(', ');
      var grantRule = "request.mcp.tool_name in [" + toolsList + "] && request.time < timestamp('" + MODEL.expiresAt + "')";
      if (MODEL.selected.indexOf(s.cluster) === -1) {
        rule.textContent = 'none on ' + s.cluster + ': only the default-deny anchor, whose rule is "false"';
      } else if (s.lease === 'expired') {
        rule.textContent = grantRule + '   (now false: request.time is past the expiry)';
      } else if (MODEL.subjects.indexOf(s.agent) === -1) {
        rule.textContent = grantRule + '   (bound to sre-agent only)';
      } else {
        rule.textContent = grantRule;
      }
      ruleWrap.hidden = false;

      var sc = allowed ? SCENARIO.allow : SCENARIO[failed.key];
      link.href = 'results.html#' + sc.id;
      link.textContent = 'See the matching real scenario, ' + sc.text;

      renderRecorded(s, allowed ? 'ALLOW' : 'DENY');
    }

    function pillEl(text) {
      var kind = text === 'ALLOW' ? 'allow' : text === 'DENY' ? 'deny' : 'error';
      var p = document.createElement('span');
      p.className = 'pill pill-' + kind;
      p.textContent = text;
      return p;
    }

    function renderRecorded(s, modelSays) {
      if (!recBox) return;
      var r = recorded ? recorded[[s.agent, s.cluster, s.tool, s.lease].join('|')] : null;
      if (!r) { recBox.hidden = true; return; }
      recBox.hidden = false;
      recLine.textContent = '';
      recLine.appendChild(pillEl(r.observed || 'n/a'));
      var agree = r.observed === modelSays;
      var note = document.createElement('span');
      note.textContent = (agree ? 'Same as the policy model.' : 'Differs from the policy model.') +
        (r.httpStatus ? ' HTTP ' + r.httpStatus + '.' : '') +
        (typeof r.latencyMs === 'number' ? ' The call took ' + r.latencyMs + ' ms, measured inside the agent pod.' : '');
      recLine.appendChild(note);
      recDetail.textContent = '';
      recDetail.appendChild(document.createTextNode('Gateway response: '));
      var code = document.createElement('code');
      code.textContent = r.detail || 'no detail recorded';
      recDetail.appendChild(code);
      recDetail.appendChild(document.createTextNode(' '));
      var a = document.createElement('a');
      a.href = 'results.html#outcomes';
      a.textContent = 'Every recorded call in the matrix';
      recDetail.appendChild(a);
    }

    if (window.fetch) {
      (window.FleetPermitData ? window.FleetPermitData.load() : fetch('data/results.json', { cache: 'no-cache' })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.json(); }))
        .then(function (data) {
          var scen = data && data.e2e && Array.isArray(data.e2e.scenarios) ? data.e2e.scenarios : [];
          scen.forEach(function (x) {
            if (!x || x.id !== 'MATRIX' || !Array.isArray(x.evidence)) return;
            recorded = {};
            x.evidence.forEach(function (r) {
              if (r && r.agent && r.cluster && r.tool && r.lease) recorded[[r.agent, r.cluster, r.tool, r.lease].join('|')] = r;
            });
          });
          render();
        })
        .catch(function () { /* Without recorded results the playground shows the policy model only. */ });
    }

    form.addEventListener('change', render);
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    /* Fallback styling for browsers without :has(). */
    var supportsHas = false;
    try { supportsHas = CSS.supports('selector(:has(*))'); } catch (e) { supportsHas = false; }
    if (!supportsHas) {
      var sync = function () {
        Array.prototype.forEach.call(form.querySelectorAll('.seg label'), function (l) {
          var input = l.querySelector('input');
          l.classList.toggle('checked', input.checked);
          l.classList.toggle('focus', document.activeElement === input);
        });
      };
      form.addEventListener('change', sync);
      form.addEventListener('focusin', sync);
      form.addEventListener('focusout', function () { window.setTimeout(sync, 0); });
      sync();
    }
    render();
  }

  /* ---------- Demo videos: text fallback when a recording is missing ---------- */
  var RUN_SH = 'https://github.com/fleetpermit/fleetpermit/blob/main/demo/run.sh';
  var videos = document.querySelectorAll('.video-card video');
  Array.prototype.forEach.call(videos, function (video) {
    var replaced = false;
    function fallback() {
      if (replaced) return;
      replaced = true;
      var box = document.createElement('div');
      box.className = 'video-fallback';
      box.setAttribute('role', 'note');
      var p1 = document.createElement('p');
      p1.style.margin = '0';
      p1.textContent = 'This recording is not available here.';
      var p2 = document.createElement('p');
      p2.style.margin = '0';
      var src0 = video.getAttribute('src') || '';
      var mode = /security/.test(src0) ? 'security' : /disconnect/.test(src0) ? 'disconnect' : 'overview';
      p2.appendChild(document.createTextNode('Run the same demo on the lab with '));
      var a = document.createElement('a');
      a.href = RUN_SH;
      a.textContent = 'demo/run.sh ' + mode;
      p2.appendChild(a);
      p2.appendChild(document.createTextNode(mode === 'overview' ? ' (make demo-run runs this one).' : '.'));
      box.appendChild(p1);
      box.appendChild(p2);
      if (video.getAttribute('aria-describedby')) box.setAttribute('aria-describedby', video.getAttribute('aria-describedby'));
      video.parentNode.replaceChild(box, video);
    }
    video.addEventListener('error', fallback);
    if (video.error) fallback();
    /* preload="none" means the error only surfaces on play; a HEAD request finds a
     * missing file up front without downloading the video. */
    var src = video.currentSrc || video.getAttribute('src');
    if (src && window.fetch) {
      fetch(src, { method: 'HEAD', cache: 'no-cache' }).then(function (res) {
        if (!res.ok) fallback();
      }).catch(function () { /* Network errors are left to the video element's own error event. */ });
    }
  });
})();
