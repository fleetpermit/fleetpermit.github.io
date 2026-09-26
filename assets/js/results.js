/* Renders data/results.json. Every number on the page comes from that file.
 * Used by the home page preview (#results-preview) and the dashboard (#results-root). */
(function () {
  'use strict';

  var preview = document.getElementById('results-preview');
  var root = document.getElementById('results-root');
  var answerStats = document.getElementById('answer-stats');
  if (!preview && !root && !answerStats) return;

  var DATA_URL = 'data/results.json';
  var DISCLAIMER = 'Measured on local kind clusters on one development host, except the GitHub-hosted reproduction and the envtest scale simulation. Not a production benchmark.';

  /* Minimal DOM builder; all JSON strings go through textContent. */
  function h(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : String(v));
      });
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return node;
  }
  function svgEl(tag, attrs, children) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    (children || []).forEach(function (c) {
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function fmt(v, unit) {
    if (!isNum(v)) return 'n/a';
    var s = Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
    return unit ? s + ' ' + unit : s;
  }
  function fmtDate(iso) {
    if (!iso || typeof iso !== 'string') return 'n/a';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z').replace(/:\d\dZ$/, ' UTC');
  }
  function statusLabel(s) {
    if (s === 'pass') return 'Pass';
    if (s === 'fail') return 'Fail';
    if (s === 'unsupported') return 'Unsupported upstream';
    return String(s || 'unknown');
  }
  function pill(status) {
    var safe = status === 'pass' || status === 'fail' || status === 'unsupported' ? status : 'unsupported';
    return h('span', { class: 'pill pill-' + safe, text: statusLabel(status) });
  }

  function sampleBanner(data) {
    if (!data || data.sample !== true) return null;
    return h('div', { class: 'banner', role: 'note' }, [
      h('div', null, [
        h('strong', { text: 'Sample data. ' }),
        'These figures come from a sample results file used while the site is developed. They will be replaced by the output of a full test run.'
      ])
    ]);
  }

  function statRow(summary) {
    var items = [
      ['pass', summary.passed, 'passed'],
      [isNum(summary.failed) && summary.failed > 0 ? 'fail' : '', summary.failed, 'failed'],
      ['unsupported', summary.unsupported, 'unsupported upstream'],
      ['', summary.total, 'scenarios in total']
    ];
    return h('div', { class: 'stat-row' }, items.map(function (it) {
      return h('div', { class: 'stat ' + it[0] }, [h('span', { class: 'v', text: isNum(it[1]) ? String(it[1]) : 'n/a' }), h('span', { class: 'k', text: it[2] })]);
    }));
  }

  function envSummary(env) {
    if (!env) return '';
    var parts = [];
    if (isNum(env.hub) && isNum(env.managedClusters)) parts.push(env.hub + ' hub + ' + env.managedClusters + ' managed clusters');
    if (env.kubernetes) parts.push('Kubernetes ' + env.kubernetes);
    if (env.openClusterManagement) parts.push('OCM ' + env.openClusterManagement);
    if (env.kubeAgenticNetworking) parts.push('kube-agentic-networking ' + env.kubeAgenticNetworking);
    if (env.envoy) parts.push('Envoy ' + env.envoy);
    if (env.os || env.arch) parts.push([env.os, env.arch].filter(Boolean).join(' '));
    return parts.join(', ');
  }

  /* ---------- Decision matrix (e2e scenario "MATRIX") ---------- */
  var PREFERRED = {
    cluster: ['cluster-east', 'cluster-west', 'cluster-edge'],
    tool: ['get_cluster_health', 'restart_workload', 'scale_workload', 'read_secret'],
    lease: ['active', 'expired']
  };
  function ordered(values, preferred) {
    var seen = [];
    values.forEach(function (v) { if (seen.indexOf(v) === -1) seen.push(v); });
    var out = (preferred || []).filter(function (v) { return seen.indexOf(v) !== -1; });
    seen.forEach(function (v) { if (out.indexOf(v) === -1) out.push(v); });
    return out;
  }
  function matrixModel(data) {
    var e2e = (data && data.e2e) || {};
    var scen = Array.isArray(e2e.scenarios) ? e2e.scenarios : [];
    var m = null;
    scen.forEach(function (x) { if (x && x.id === 'MATRIX' && Array.isArray(x.evidence)) m = x; });
    if (!m) return null;
    var rows = m.evidence.filter(function (r) { return r && typeof r === 'object' && r.agent && r.cluster && r.tool && r.lease; });
    if (!rows.length) return null;
    var agentNames = Array.isArray(e2e.agents) ? e2e.agents.map(function (a) { return a && a.name; }).filter(Boolean) : [];
    var map = {};
    rows.forEach(function (r) { map[[r.agent, r.cluster, r.tool, r.lease].join('|')] = r; });
    function matches(r) { return r.match === true || (r.match === undefined && r.expected && r.expected === r.observed); }
    var matched = rows.filter(matches).length;
    return {
      scenario: m,
      rows: rows,
      agents: ordered(rows.map(function (r) { return r.agent; }), agentNames),
      clusters: ordered(rows.map(function (r) { return r.cluster; }), PREFERRED.cluster),
      tools: ordered(rows.map(function (r) { return r.tool; }), PREFERRED.tool),
      leases: ordered(rows.map(function (r) { return r.lease; }), PREFERRED.lease),
      get: function (a, c, t, l) { return map[[a, c, t, l].join('|')] || null; },
      matches: matches,
      total: rows.length,
      matched: matched
    };
  }
  function obsKind(v) { return v === 'ALLOW' ? 'allow' : v === 'DENY' ? 'deny' : v ? 'error' : 'missing'; }
  function breakable(name) {
    var span = h('span');
    String(name).split('_').forEach(function (part, i, arr) {
      span.appendChild(document.createTextNode(part + (i < arr.length - 1 ? '_' : '')));
      if (i < arr.length - 1) span.appendChild(document.createElement('wbr'));
    });
    return span;
  }
  function matrixSummary(mm) {
    var bad = mm.total - mm.matched;
    return h('p', { class: 'matrix-summary' }, [
      h('span', null, [h('b', { text: String(mm.total) }), ' real calls,']),
      h('span', null, [h('b', { class: bad ? 'bad' : 'ok', text: String(mm.matched) }), ' matched expectation' + (bad ? ',' : '.')]),
      bad ? h('span', null, [h('b', { class: 'bad', text: String(bad) }), ' did not.']) : null
    ]);
  }
  function matrixGrid(mm, lease) {
    var thead = h('thead', null, [h('tr', null, [h('th', { scope: 'col', text: 'Agent' }), h('th', { scope: 'col', text: 'Cluster' })]
      .concat(mm.tools.map(function (t) { return h('th', { scope: 'col' }, [breakable(t)]); })))]);
    var table = h('table', { class: 'matrix-table' }, [
      h('caption', { class: 'visually-hidden', text: 'Lease ' + lease + ': observed and expected decision for each agent, cluster and tool' }),
      thead
    ]);
    mm.agents.forEach(function (agent) {
      var body = h('tbody');
      mm.clusters.forEach(function (cluster, ci) {
        var cells = [];
        if (ci === 0) cells.push(h('th', { scope: 'rowgroup', rowspan: String(mm.clusters.length), class: 'agent' }, [h('a', { href: '#agent-' + agent, text: agent })]));
        cells.push(h('th', { scope: 'row', text: cluster.replace(/^cluster-/, '') }));
        mm.tools.forEach(function (tool) {
          var r = mm.get(agent, cluster, tool, lease);
          if (!r) { cells.push(h('td', { class: 'o-missing' }, [h('span', { class: 'm-exp', text: 'not recorded' })])); return; }
          var ok = mm.matches(r);
          var title = (r.detail ? r.detail + ' ' : '') + (isNum(r.latencyMs) ? '(the call took ' + r.latencyMs + ' ms, measured inside the agent pod)' : '');
          cells.push(h('td', { class: 'o-' + obsKind(r.observed) + (ok ? '' : ' mismatch'), title: title.trim() || null }, [
            h('span', { class: 'm-obs' }, [
              h('span', { text: r.observed || 'n/a' }),
              h('span', { class: 'm-mark ' + (ok ? 'ok' : 'bad'), 'aria-hidden': 'true', text: ok ? '✓' : '✗' })
            ]),
            h('span', { class: 'm-exp', text: 'expected ' + (r.expected || 'n/a') }),
            h('span', { class: 'visually-hidden', text: ok ? ', matches expectation' : ', does not match expectation' })
          ]));
        });
        body.appendChild(h('tr', null, cells));
      });
      table.appendChild(body);
    });
    return h('div', { class: 'matrix-grid' }, [
      h('h4', null, ['Lease ', h('span', { class: 'pill ' + (lease === 'active' ? 'pill-lease' : 'pill-deny'), text: lease })]),
      h('div', { class: 'table-wrap' }, [table])
    ]);
  }
  function matrixLegend() {
    return h('p', { class: 'matrix-legend' }, [
      h('span', null, [h('span', { class: 'pill pill-allow', text: 'ALLOW' }), 'observed allow']),
      h('span', null, [h('span', { class: 'pill pill-deny', text: 'DENY' }), 'observed deny']),
      h('span', null, [h('span', { class: 'm-mark ok', 'aria-hidden': 'true', text: '✓' }), 'matches the expected decision']),
      h('span', null, [h('span', { class: 'm-mark bad', 'aria-hidden': 'true', text: '✗' }), 'differs from it'])
    ]);
  }
  function matrixSection(data) {
    var e2e = data.e2e || {};
    var mm = matrixModel(data);
    var agents = testAgentsBlock(data);
    if (!mm && !agents) return null;
    var kids = [];
    if (agents) kids.push(h('h3', { text: 'Meet the test agents' }), agents);
    if (mm) {
      kids.push(h('h3', { text: 'Expected vs observed, per call' }));
      kids.push(matrixSummary(mm));
      if (mm.scenario.expected) kids.push(h('p', { class: 'muted', style: 'max-width:75ch' }, ['Expected: ' + mm.scenario.expected + '.']));
      kids.push(matrixLegend());
      kids.push(h('div', { class: 'matrix-grids' }, mm.leases.map(function (l) { return matrixGrid(mm, l); })));
      kids.push(h('p', { class: 'matrix-note' }, ['Every cell is one real MCP call through the gateway on that cluster. The raw probe output for each call is in the ',
        h('a', { href: '#MATRIX', text: 'MATRIX scenario' }), '.']));
    }
    return section('matrix', 'Test agents and expected outcomes',
      'Two workload identities call four tools on three clusters, with the lease active and after it expired. The expected decision comes from the policy; the observed one from the gateway.', kids);
  }

  /* ---------- Meet the test agents ---------- */
  var BLOB = 'https://github.com/fleetpermit/fleetpermit/blob/main/';
  var AGENT_INFO = {
    'sre-agent': {
      kind: 'subject',
      one: 'A test client pod whose identity is listed in the policy, so it can hold leases.',
      expected: 'ALLOW only on cluster-east and cluster-west, only for the leased tools (get_cluster_health and restart_workload), and only while the lease is active. DENY for scale_workload (the policy permits it, but the lease does not), read_secret (not permitted), anything on cluster-edge (outside the placement), and every call after the lease expires.',
      links: [['Test client (probe)', BLOB + 'demo/tools/probe/main.go'], ['How the agent pods are deployed', BLOB + 'demo/scripts/render-agents.sh'], ['The lab policy that lists it (apply_policy)', BLOB + 'test/e2e/lib.sh']]
    },
    'security-agent': {
      kind: 'unlisted',
      one: 'The same test client with a different identity. The gateways trust its certificate, but no policy lists it.',
      expected: 'DENY for every call, on every cluster, for every tool, with or without a lease. It shows that a valid identity alone grants nothing.',
      links: [['Test client (probe)', BLOB + 'demo/tools/probe/main.go'], ['How the agent pods are deployed', BLOB + 'demo/scripts/render-agents.sh'], ['The scenarios that drive both agents', BLOB + 'test/e2e/run.sh']]
    }
  };
  /* Static markup for the lane animation (no data inside). */
  function laneStage(kind) {
    var sre = kind === 'subject';
    var st = function (lane) {
      if (sre && lane < 2) return '<span class="ag-st"><span class="al">ALLOW</span><span class="dn">DENY</span></span>';
      return '<span class="ag-st"><span class="dn">DENY</span></span>';
    };
    var names = ['east', 'west', 'edge'];
    var html = '<span class="ag-lbl ag-l-agent">agent pod</span><span class="ag-lbl ag-l-gate">gateway</span><span class="ag-lbl ag-l-cl">cluster</span>' +
      '<span class="ag-pod">pod<small>ns agents</small></span>';
    for (var i = 0; i < 3; i++) {
      html += '<span class="ag-lane n' + i + '"></span><span class="ag-lane2 n' + i + '"></span><span class="ag-gate n' + i + '"></span>' +
        '<span class="ag-cl n' + i + (i === 2 ? ' edge' : '') + '"><span>' + names[i] + '</span>' + st(i) + '</span>';
    }
    if (sre) {
      for (var t = 0; t < 8; t++) html += '<span class="ag-o ag-tick t' + t + '"></span>';
      html += '<span class="ag-o ag-lease">lease</span><span class="ag-o ag-lease-x">expired</span>';
      ['sa1', 'sa2', 'sa3', 'sa4', 'sa5'].forEach(function (n) { html += '<span class="ag-o ag-pk amber ' + n + '"></span>'; });
      html += '<span class="ag-o ag-ok sa1f"></span><span class="ag-o ag-ok sa2f"></span><span class="ag-o ag-x sa3f"></span><span class="ag-o ag-x sa4f"></span><span class="ag-o ag-x sa5f"></span>';
    } else {
      for (var k = 0; k < 3; k++) html += '<span class="ag-o ag-pk slate sc' + k + '"></span><span class="ag-o ag-x sc' + k + 'f"></span>';
    }
    var stage = h('div', { class: 'ag-stage ' + (sre ? 'sre' : 'sec'), 'aria-hidden': 'true' });
    stage.innerHTML = html;
    return stage;
  }
  var stageObserver = null;
  function observeStage(stage) {
    stage.classList.add('ag-paused');
    if (!('IntersectionObserver' in window)) { stage.classList.remove('ag-paused'); return; }
    if (!stageObserver) {
      stageObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.target.__fpVisible = e.isIntersecting; e.target.classList.toggle('ag-paused', !e.isIntersecting || document.hidden); });
      }, { threshold: 0.1 });
      document.addEventListener('visibilitychange', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.ag-stage'), function (st) { st.classList.toggle('ag-paused', document.hidden || !st.__fpVisible); });
      });
    }
    stageObserver.observe(stage);
  }
  function agentObserved(mm, name) {
    if (!mm) return null;
    var rows = mm.rows.filter(function (r) { return r.agent === name; });
    if (!rows.length) return null;
    var ok = rows.filter(mm.matches).length;
    var allow = rows.filter(function (r) { return r.observed === 'ALLOW'; }).length;
    var err = rows.filter(function (r) { return r.observed && r.observed !== 'ALLOW' && r.observed !== 'DENY'; }).length;
    return [h('b', { text: String(rows.length) }), ' calls, ', h('b', { text: String(ok) }), ' as expected, ', h('b', { text: String(allow) }), ' ALLOW' + (err ? ', ' + err + ' ERROR' : '') + '.'];
  }
  function testAgentsBlock(data) {
    var e2e = (data && data.e2e) || {};
    var mm = matrixModel(data);
    var list = Array.isArray(e2e.agents) && e2e.agents.length ? e2e.agents : null;
    if (!list && mm) list = mm.agents.map(function (n) { return { name: n }; });
    if (!list) return null;
    var wrap = h('div', { class: 'test-agents' });
    wrap.appendChild(h('div', { class: 'agents-intro' }, [
      h('p', { class: 'lead', text: 'Both are test clients from this repository, not third-party or AI agents.' }),
      h('p', { text: 'They are two ordinary pods in namespace agents on cluster-east. Both run the same small test client, the probe. Each run opens an MCP session over mTLS with one cluster’s gateway (initialize, then notifications/initialized), makes one tools/call and records the answer. The only difference between them is their identity.' }),
      h('p', { class: 'small' }, [h('a', { href: BLOB + 'demo/tools/mcp-server/main.go', text: 'The MCP tool server they call' }), '. ',
        h('a', { href: BLOB + 'test/e2e/run.sh', text: 'The scenarios that drive them' }), '. Identity background: ',
        h('a', { href: 'https://github.com/kubernetes/enhancements/tree/master/keps/sig-auth/4317-pod-certificates', text: 'Kubernetes Pod Certificates' }), ' and ',
        h('a', { href: 'https://spiffe.io/docs/latest/spiffe-about/overview/', text: 'SPIFFE' }), '.'])
    ]));
    wrap.appendChild(h('details', { class: 'agents-own' }, [
      h('summary', { text: 'Using your own agent' }),
      h('div', null, [
        h('p', { text: 'Any agent, in any framework or language, works the same way. FleetPermit never sees the agent’s code. The agent needs three things:' }),
        h('ol', null, [
          h('li', { text: 'A SPIFFE X.509 identity that the gateways trust. In the lab the cluster issues it. Across organisations, use a federated trust domain, for example SPIRE federation.' }),
          h('li', { text: 'Network reach to a cluster’s gateway.' }),
          h('li', { text: 'To be listed as a subject in a FleetAccessPolicy and to hold an active lease.' })
        ]),
        h('p', { text: 'An agent without a trusted certificate is rejected during the mTLS handshake, before any MCP message. An agent with a trusted but unlisted identity is denied, like security-agent.' }),
        h('p', null, ['See the ', h('a', { href: 'https://github.com/kubernetes-sigs/kube-agentic-networking/tree/v0.2.0/site-src/guides/quickstart', text: 'kube-agentic-networking quickstart' }), ', section “Bring your own agent”.'])
      ])
    ]));
    var ul = h('ul', { class: 'agent-cards2', 'aria-label': 'Test agents' });
    list.forEach(function (ag) {
      ag = ag || {};
      var name = String(ag.name || '');
      var info = AGENT_INFO[name] || { kind: '', one: ag.role ? ag.role.charAt(0).toUpperCase() + ag.role.slice(1) + '.' : '', expected: '', links: [] };
      var sid = ag.spiffeID || (name ? 'spiffe://cluster.local/ns/agents/sa/' + name : '');
      var obs = agentObserved(mm, name);
      var dl = h('dl');
      if (info.expected) { dl.appendChild(h('dt', { text: 'Expected' })); dl.appendChild(h('dd', { text: info.expected })); }
      if (obs) { dl.appendChild(h('dt', { text: 'Observed in the lab' })); dl.appendChild(h('dd', { class: 'obs' }, obs)); }
      var card = h('li', { class: 'agent-card2 ' + info.kind, id: 'agent-' + name }, [
        h('h4', { text: name }),
        info.one ? h('p', { class: 'one', text: info.one }) : null,
        info.kind ? laneStage(info.kind) : null,
        sid ? h('code', { class: 'sid', text: sid }) : null,
        dl,
        info.links.length ? h('ul', { class: 'src', 'aria-label': 'Source for ' + name }, info.links.map(function (l) { return h('li', null, [h('a', { href: l[1], text: l[0] })]); })) : null
      ]);
      ul.appendChild(card);
    });
    wrap.appendChild(ul);
    Array.prototype.forEach.call(wrap.querySelectorAll('.ag-stage'), observeStage);
    return wrap;
  }

  /* Compact matrix for the home page. */
  function labVerified(data) {
    var mm = matrixModel(data);
    if (!mm) return null;
    var head = h('tr', null, [h('th', { scope: 'col', text: 'Agent and lease' })].concat(mm.clusters.map(function (c) { return h('th', { scope: 'col', text: c }); })));
    var body = h('tbody');
    mm.agents.forEach(function (agent) {
      mm.leases.forEach(function (lease) {
        var cells = [h('th', { scope: 'row' }, [h('a', { href: '#agent-' + agent, text: agent }), h('small', { text: 'lease ' + lease })])];
        mm.clusters.forEach(function (cluster) {
          var parts = [], allOk = true;
          var dots = h('span', { class: 'dots', 'aria-hidden': 'true' }, mm.tools.map(function (tool) {
            var r = mm.get(agent, cluster, tool, lease);
            var k = r ? obsKind(r.observed) : 'missing';
            var ok = r ? mm.matches(r) : false;
            if (!ok) allOk = false;
            parts.push(tool + ' ' + (r ? r.observed : 'not recorded'));
            return h('span', { class: 'dot ' + k + (ok ? '' : ' bad'), title: tool + ': ' + (r ? r.observed + ', expected ' + r.expected : 'not recorded') }, [k === 'allow' ? '✓' : k === 'deny' ? '' : '?']);
          }));
          cells.push(h('td', null, [dots, h('span', { class: 'visually-hidden', text: parts.join(', ') + (allOk ? '; all as expected.' : '; at least one differs from the expected decision.') })]));
        });
        body.appendChild(h('tr', null, cells));
      });
    });
    return h('div', { class: 'lab-verified' }, [
      h('h3', { text: 'What the lab verified' }),
      h('p', null, [mm.total + ' real calls, ' + mm.matched + ' matched expectation. Squares, left to right: ' + mm.tools.join(', ') + '. Filled teal is ALLOW; outlined coral is DENY.']),
      h('div', { class: 'table-wrap', style: 'border:0;background:none' }, [h('table', { class: 'mini-matrix' }, [
        h('caption', { class: 'visually-hidden', text: 'Recorded decisions per agent, lease state and cluster' }),
        h('thead', null, [head]), body
      ])]),
      h('p', { class: 'small', style: 'margin:10px 0 0' }, [h('a', { href: 'results.html#matrix', text: 'Every call with expected and observed decisions' })])
    ]);
  }

  /* Headline numbers for "FleetPermit in five answers". Missing values are simply left out. */
  function renderAnswers(data) {
    var items = [];
    var e2e = data.e2e || {}, sum = e2e.summary || {};
    if (isNum(sum.passed) && isNum(sum.total)) {
      items.push([sum.passed + ' of ' + sum.total, 'end-to-end scenarios passed' + (isNum(sum.unsupported) && sum.unsupported ? ' (' + sum.unsupported + ' unsupported upstream)' : ''), sum.failed === 0]);
    }
    var mm = matrixModel(data);
    if (mm) items.push([mm.matched + ' of ' + mm.total, 'matrix calls matched the expected decision', mm.matched === mm.total]);
    var rep = Array.isArray(data.reproductions) && data.reproductions[0] ? data.reproductions[0] : null;
    if (rep && rep.summary && isNum(rep.summary.passed) && isNum(rep.summary.total)) {
      items.push([rep.summary.passed + ' of ' + rep.summary.total, 'passed again' + (rep.runner ? ' on ' + rep.runner : ' on a GitHub-hosted runner'), rep.summary.failed === 0]);
    }
    var lat = data.latency || {};
    [['activationToAllowMs', 'median, lease created to first ALLOW'], ['revocationToDenyMs', 'median, lease deleted to first DENY'], ['expiryToDenyHubDownMs', 'median, expiry to DENY with the hub disconnected']].forEach(function (x) {
      var m = lat[x[0]];
      if (m && isNum(m.p50)) items.push([fmt(m.p50, m.unit || 'ms'), x[1], false]);
    });
    if (!items.length) return;
    answerStats.textContent = '';
    items.forEach(function (it) {
      answerStats.appendChild(h('li', { class: it[2] ? 'ok' : '' }, [h('b', { text: it[0] }), h('span', { text: it[1] })]));
    });
    answerStats.hidden = false;
  }

  /* Reproductions of the end-to-end suite on a GitHub-hosted runner. */
  function reproductionsBlock(reps) {
    if (!Array.isArray(reps) || !reps.length) return null;
    return h('div', { class: 'repro' }, reps.map(function (r) {
      r = r || {};
      var env = r.environment || {}, sm = r.summary || {};
      var envText = [[env.os, env.arch].filter(Boolean).join(' '), env.containerEngine, env.kubernetes ? 'Kubernetes ' + env.kubernetes : '', env.fleetpermitCommit ? 'commit ' + env.fleetpermitCommit : ''].filter(Boolean).join(', ');
      return h('article', { class: 'repro-card' }, [
        h('h3', { text: r.runner || 'Reproduction run' }),
        h('p', null, [envText ? envText + '. ' : '', r.finishedAt ? 'Finished ' + fmtDate(r.finishedAt) + '. ' : '',
          r.runURL ? h('a', { href: r.runURL, text: 'View the run' }) : null]),
        isNum(sm.passed) && isNum(sm.total) ? h('p', { class: 'score' }, [sm.passed + ' of ' + sm.total, h('small', { text: 'passed' + (isNum(sm.failed) ? ', ' + sm.failed + ' failed' : '') + (isNum(sm.unsupported) && sm.unsupported ? ', ' + sm.unsupported + ' unsupported' : '') })]) : null
      ]);
    }));
  }



  /* ---------- Home page preview ---------- */
  function renderPreview(data) {
    preview.textContent = '';
    var e2e = data.e2e || {};
    var banner = sampleBanner(data);
    if (banner) preview.appendChild(banner);
    var lv = labVerified(data);
    if (lv) preview.appendChild(lv);
    var ta = testAgentsBlock(data);
    if (ta) preview.appendChild(h('div', { class: 'lab-agents' }, [h('h3', { text: 'Meet the test agents' }), ta]));
    if (e2e.summary) preview.appendChild(statRow(e2e.summary));
    var lat = data.latency || {};
    var keys = ['activationToAllowMs', 'revocationToDenyMs', 'expiryToDenyHubDownMs'].filter(function (k) { return lat[k] && typeof lat[k] === 'object'; });
    if (keys.length) {
      var list = h('ul', { class: 'limits' }, keys.map(function (k) {
        var m = lat[k] || {};
        return h('li', null, [
          h('strong', { text: m.label || k }),
          h('span', null, ['median ', h('b', { text: fmt(m.p50, m.unit) }), ', p95 ', h('b', { text: fmt(m.p95, m.unit) }), isNum((m.samples || []).length) ? ' across ' + m.samples.length + ' samples' : ''])
        ]);
      }));
      preview.appendChild(list);
    }
    var envText = envSummary(e2e.environment);
    preview.appendChild(h('p', { class: 'small muted', style: 'margin-top:14px' }, [
      envText ? envText + '. ' : '',
      e2e.finishedAt ? 'Run finished ' + fmtDate(e2e.finishedAt) + '. ' : '',
      DISCLAIMER
    ]));
  }

  /* ---------- Dashboard ---------- */
  function section(id, title, intro, children) {
    var s = h('section', { id: id, class: 'doc-section', 'aria-labelledby': id + '-h', style: 'margin-bottom:56px' }, [
      h('h2', { id: id + '-h', text: title }),
      intro ? h('p', { class: 'muted', style: 'max-width:70ch' }, [intro]) : null
    ]);
    children.forEach(function (c) { if (c) s.appendChild(c); });
    return s;
  }

  function envBlock(e2e) {
    var env = e2e.environment || {};
    var rows = [
      ['Kubernetes', env.kubernetes],
      ['Open Cluster Management', env.openClusterManagement],
      ['kube-agentic-networking', env.kubeAgenticNetworking],
      ['Gateway API', env.gatewayAPI],
      ['Envoy', env.envoy],
      ['Clusters', isNum(env.hub) && isNum(env.managedClusters) ? env.hub + ' hub + ' + env.managedClusters + ' managed' : null],
      ['Cluster names', Array.isArray(env.clusterNames) ? env.clusterNames.join(', ') : null],
      ['kind', env.kind],
      ['Container engine', env.containerEngine],
      ['OS and architecture', [env.os, env.arch].filter(Boolean).join(' ') || null],
      ['FleetPermit commit', env.fleetpermitCommit],
      ['Run started', e2e.startedAt ? fmtDate(e2e.startedAt) : null],
      ['Run finished', e2e.finishedAt ? fmtDate(e2e.finishedAt) : null]
    ].filter(function (r) { return r[1]; });
    return h('dl', { class: 'env-list' }, rows.map(function (r) {
      return h('div', null, [h('dt', { text: r[0] }), h('dd', { text: String(r[1]) })]);
    }));
  }

  function evidenceText(ev) {
    return ev.map(function (x) {
      if (typeof x === 'string') return x;
      try { return JSON.stringify(x, null, 2); } catch (e) { return String(x); }
    }).join('\n\n');
  }

  function metricsList(metrics) {
    var keys = Object.keys(metrics || {});
    if (!keys.length) return null;
    return h('p', { class: 'small muted', style: 'margin:6px 0 0' }, keys.map(function (k, i) {
      var v = metrics[k];
      return h('span', null, [(i ? '; ' : ''), h('code', { text: k }), ' ', typeof v === 'object' ? JSON.stringify(v) : String(v)]);
    }));
  }

  function scenarioTable(scenarios) {
    var tbody = h('tbody');
    scenarios.forEach(function (s) {
      var id = String(s.id || '');
      var ev = Array.isArray(s.evidence) ? s.evidence : [];
      tbody.appendChild(h('tr', { id: id, tabindex: '-1', class: 'scenario-row' }, [
        h('td', { 'data-label': 'ID' }, [h('a', { class: 'anchor', href: '#' + id, text: id })]),
        h('td', { 'data-label': 'Scenario' }, [s.name || '']),
        h('td', { 'data-label': 'Status' }, [pill(s.status)]),
        h('td', { 'data-label': 'Expected' }, [s.expected || '']),
        h('td', { 'data-label': 'Observed', class: 'obs' }, [s.observed || '', metricsList(s.metrics)])
      ]));
      tbody.appendChild(h('tr', { class: 'evidence-row' }, [
        h('td', { colspan: '5' }, [ev.length
          ? h('details', { class: 'evidence' }, [
              h('summary', null, ['Raw evidence for ' + id + ' (' + ev.length + (ev.length === 1 ? ' item' : ' items') + ')']),
              h('pre', { tabindex: '0' }, [evidenceText(ev)])
            ])
          : h('span', { class: 'small muted', text: 'No raw evidence recorded for ' + id + '.' })])
      ]));
    });
    var table = h('table', { class: 'data-table scenario-table' }, [
      h('caption', { class: 'visually-hidden', text: 'End-to-end scenarios with expected and observed outcomes, each followed by its raw evidence' }),
      h('thead', null, [h('tr', null, ['ID', 'Scenario', 'Status', 'Expected', 'Observed'].map(function (c) { return h('th', { scope: 'col', text: c }); }))]),
      tbody
    ]);
    return h('div', { class: 'table-wrap' }, [table]);
  }

  /* Accessible inline bar chart of samples, with p50 and p95 guides. */
  function latencyChart(m, label, cardWidth) {
    var samples = (m.samples || []).filter(isNum);
    /* The viewBox follows the card width (320 to 480), so the axis labels stay near 12 px. */
    var W = Math.max(320, Math.min(480, Math.round(cardWidth || 480))), H = W < 400 ? 170 : 150, padL = 44, padB = 22, padT = 10, padR = 10;
    var max = Math.max.apply(null, samples.concat([m.max || 0, m.p95 || 0, 1]));
    var top = niceCeil(max);
    var iw = W - padL - padR, ih = H - padT - padB;
    var n = samples.length || 1;
    var bw = Math.min(40, Math.max(2, iw / n - 4));
    var g = [];
    [0, 0.5, 1].forEach(function (f) {
      var y = padT + ih - ih * f;
      g.push(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, class: 'axis', 'stroke-width': f === 0 ? 1.2 : 0.6 }));
      g.push(svgEl('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end' }, [String(Math.round(top * f))]));
    });
    samples.forEach(function (v, i) {
      var bh = ih * (v / top);
      g.push(svgEl('rect', { class: 'bar', x: (padL + i * (iw / n) + 2).toFixed(1), y: (padT + ih - bh).toFixed(1), width: bw.toFixed(1), height: Math.max(1, bh).toFixed(1), rx: 2 }));
    });
    var y50 = isNum(m.p50) ? padT + ih - ih * (m.p50 / top) : null;
    var y95 = isNum(m.p95) ? padT + ih - ih * (m.p95 / top) : null;
    var close = y50 !== null && y95 !== null && Math.abs(y50 - y95) < 14;
    [['p50', y50, 'var(--text)', close ? W - padR - 40 : W - padR], ['p95', y95, 'var(--lease)', W - padR]].forEach(function (q) {
      if (q[1] === null) return;
      g.push(svgEl('line', { x1: padL, x2: W - padR, y1: q[1], y2: q[1], stroke: q[2], 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
      g.push(svgEl('text', { x: q[3], y: Math.max(11, q[1] - 4), 'text-anchor': 'end', style: 'fill:' + q[2] + ';font-weight:700' }, [q[0]]));
    });
    g.push(svgEl('text', { x: padL, y: H - 4 }, ['samples, sorted by value (' + (m.unit || '') + ')']));
    var desc = label + ': ' + samples.length + ' samples from ' + fmt(m.min, m.unit) + ' to ' + fmt(m.max, m.unit) + '; median ' + fmt(m.p50, m.unit) + ', p95 ' + fmt(m.p95, m.unit) + '.';
    return svgEl('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': desc }, g);
  }
  function niceCeil(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 2, 2.5, 5, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * p >= v) return steps[i] * p;
    return 10 * p;
  }

  /* Inner width of a latency card: one column up to 800 px, two above (see site.css). */
  function cardWidth() {
    if (!root) return 480;
    var w = root.clientWidth;
    var twoCols = !(window.matchMedia && window.matchMedia('(max-width: 800px)').matches);
    return twoCols ? (w - 16) / 2 - 36 : w - 36;
  }
  var chartState = { width: null, latency: null };
  function redrawCharts() {
    if (!chartState.latency) return;
    var width = cardWidth();
    if (Math.abs(width - chartState.width) < 24) return;
    chartState.width = width;
    Object.keys(chartState.latency).forEach(function (k) {
      var card = document.getElementById('lat-' + k);
      var old = card && card.querySelector('svg.chart');
      var m = chartState.latency[k] || {};
      if (old) old.parentNode.replaceChild(latencyChart(m, m.label || k, width), old);
    });
  }
  var chartTimer = 0;
  window.addEventListener('resize', function () {
    window.clearTimeout(chartTimer);
    chartTimer = window.setTimeout(redrawCharts, 150);
  });

  function latencyBlock(latency) {
    var keys = Object.keys(latency || {});
    if (!keys.length) return h('p', { class: 'state', text: 'This results file has no latency measurements.' });
    chartState.latency = latency;
    chartState.width = cardWidth();
    return h('div', { class: 'latency-grid' }, keys.map(function (k) {
      var m = latency[k] || {};
      var label = m.label || k;
      var samples = (m.samples || []).filter(isNum);
      return h('article', { class: 'latency-card', id: 'lat-' + k }, [
        h('h3', { text: label }),
        h('p', { class: 'nums' }, [
          h('span', null, ['p50 ', h('b', { text: fmt(m.p50, m.unit) })]),
          h('span', null, ['p95 ', h('b', { text: fmt(m.p95, m.unit) })]),
          h('span', null, ['min ', h('b', { text: fmt(m.min, m.unit) })]),
          h('span', null, ['max ', h('b', { text: fmt(m.max, m.unit) })]),
          h('span', null, ['samples ', h('b', { text: String(samples.length) })])
        ]),
        latencyChart(m, label, chartState.width),
        h('details', { class: 'evidence' }, [
          h('summary', null, ['All samples', h('span', { class: 'visually-hidden', text: ' for ' + label })]),
          h('pre', { tabindex: '0' }, [samples.map(function (v) { return fmt(v, m.unit); }).join('\n')])
        ])
      ]);
    }));
  }

  function scaleBlock(scale) {
    if (!scale || !Array.isArray(scale.rows) || !scale.rows.length) {
      return h('p', { class: 'state', text: 'This results file has no simulated scale rows.' });
    }
    var cols = [['clusters', 'Simulated clusters', ''], ['activationMs', 'Activation', 'ms'], ['revocationMs', 'Revocation', 'ms'], ['reconciles', 'Reconciles', ''], ['reconcilesPerSecond', 'Reconciles per second', '']];
    var table = h('table', { class: 'data-table' }, [
      h('caption', { class: 'visually-hidden', text: 'Simulated controller scale on envtest, no real clusters' }),
      h('thead', null, [h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', text: c[1] + (c[2] ? ' (' + c[2] + ')' : '') }); }))]),
      h('tbody', null, scale.rows.map(function (r) {
        return h('tr', null, cols.map(function (c, i) {
          var v = r[c[0]];
          return i === 0 ? h('th', { scope: 'row', text: isNum(v) ? String(v) : 'n/a' }) : h('td', { text: isNum(v) ? fmt(v) : 'n/a' });
        }));
      }))
    ]);
    // Horizontal bars: activation time by cluster count.
    var rows = scale.rows.filter(function (r) { return isNum(r.clusters) && isNum(r.activationMs); });
    var chart = null;
    if (rows.length) {
      var W = 560, rowH = 28, padL = 60, padR = 70, H = rows.length * rowH + 30;
      var top = niceCeil(Math.max.apply(null, rows.map(function (r) { return r.activationMs; })));
      var g = [];
      rows.forEach(function (r, i) {
        var y = 8 + i * rowH;
        var w = (W - padL - padR) * (r.activationMs / top);
        g.push(svgEl('text', { x: padL - 8, y: y + 16, 'text-anchor': 'end' }, [String(r.clusters)]));
        g.push(svgEl('rect', { class: 'bar', x: padL, y: y + 3, width: Math.max(1, w).toFixed(1), height: 18, rx: 3 }));
        g.push(svgEl('text', { x: padL + w + 6, y: y + 16 }, [fmt(r.activationMs, 'ms')]));
      });
      g.push(svgEl('text', { x: padL, y: H - 4 }, ['activation time by simulated cluster count']));
      var desc = 'Simulated activation time by cluster count: ' + rows.map(function (r) { return r.clusters + ' clusters ' + fmt(r.activationMs, 'ms'); }).join('; ') + '.';
      chart = h('div', { class: 'latency-card', style: 'margin-top:16px' }, [svgEl('svg', { class: 'chart chart-h', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': desc }, g)]);
    }
    return h('div', null, [h('div', { class: 'table-wrap' }, [table]), chart]);
  }

  function testsBlock(tests) {
    if (!tests) return h('p', { class: 'state', text: 'This results file has no unit or integration test counts.' });
    var u = tests.unit || {}, it = tests.integration || {};
    var items = [
      ['pass', u.passed, 'unit tests passed'],
      [isNum(u.failed) && u.failed > 0 ? 'fail' : '', u.failed, 'unit tests failed'],
      ['', u.coverage, 'unit statement coverage'],
      ['pass', it.passed, 'integration tests passed (envtest)']
    ];
    var row = h('div', { class: 'stat-row' }, items.map(function (x) {
      var v = x[1];
      return h('div', { class: 'stat ' + x[0] }, [h('span', { class: 'v', text: v === undefined || v === null ? 'n/a' : String(v) }), h('span', { class: 'k', text: x[2] })]);
    }));
    var extra = isNum(it.failed) ? h('p', { class: 'small muted', text: 'Integration tests failed: ' + it.failed + '.' }) : null;
    var skipped = isNum(it.skipped) && it.skipped > 0
      ? h('p', { class: 'small muted', text: 'Integration tests skipped: ' + it.skipped + '. The scale simulation is skipped unless make benchmark runs it.' })
      : null;
    return h('div', null, [row, extra, skipped]);
  }

  function coverageBlock(cov) {
    if (!cov || !cov.internalPackages) return null;
    return h('p', null, [h('strong', { text: 'Combined statement coverage: ' + cov.internalPackages }), ' (' + (cov.scope || '') + ').']);
  }

  function conformanceBlock(conf) {
    var suites = conf && Array.isArray(conf.suites) ? conf.suites : [];
    if (!suites.length) return h('p', { class: 'state', text: 'No upstream conformance results in this file.' });
    return h('div', null, suites.map(function (s) {
      return h('div', { class: 'callout' }, [
        h('strong', { text: s.suite + ' ' + s.version }),
        h('p', null, ['Target: ' + s.target + '. Result: ', h('strong', { text: s.result }), '. Run ' + fmtDate(s.date) + '.']),
        s.note ? h('p', { class: 'small muted', text: s.note }) : null,
        s.command ? h('pre', { tabindex: '0' }, [h('code', { text: s.command })]) : null
      ]);
    }));
  }

  function renderDashboard(data) {
    root.textContent = '';
    var e2e = data.e2e || {};
    var banner = sampleBanner(data);
    if (banner) root.appendChild(banner);

    root.appendChild(h('div', { class: 'callout' }, [
      h('strong', { text: DISCLAIMER }),
      h('span', null, ['Results file generated ', fmtDate(data.generatedAt), '. ', data.source ? h('a', { href: data.source, text: 'Raw results in the repository' }) : '', '.'])
    ]));

    var ms = matrixSection(data);
    if (ms) root.appendChild(ms);

    var scen = Array.isArray(e2e.scenarios) ? e2e.scenarios : [];
    root.appendChild(section('e2e', 'Real multi-cluster end-to-end scenarios',
      'Every decision is an MCP call from a test pod\u2019s SPIFFE identity through a cluster\u2019s Envoy gateway.', [
        h('h3', { text: 'Verified environment' }),
        envBlock(e2e),
        e2e.environment && e2e.environment.description ? h('p', { class: 'small muted', text: 'Environment: ' + e2e.environment.description + '.' }) : null,
        h('h3', { text: 'Summary' }),
        e2e.summary ? statRow(e2e.summary) : h('p', { class: 'state', text: 'No summary in this results file.' }),
        h('h3', { text: 'Scenarios' }),
        scen.length ? scenarioTable(scen) : h('p', { class: 'state', text: 'No scenarios in this results file.' })
      ]));

    var rb = reproductionsBlock(data.reproductions);
    if (rb) root.appendChild(section('reproductions', 'Reproductions',
      'The same end-to-end suite, run from a clean checkout on a GitHub-hosted runner.', [rb]));

    var method = data.benchmarkEnvironment && data.benchmarkEnvironment.method;
    root.appendChild(section('latency', 'Latency on the local lab',
      method ? 'Method: ' + method + '.' : 'Measured by polling the gateways with real MCP calls, every affected cluster concurrently from the same start time, so each value includes the polling granularity.', [latencyBlock(data.latency)]));

    root.appendChild(section('scale', 'Simulated controller scale (envtest, no real clusters)',
      data.scale && data.scale.environment && data.scale.environment.description ? data.scale.environment.description + '.' : '', [scaleBlock(data.scale)]));

    root.appendChild(section('conformance', 'Upstream conformance',
      'The kube-agentic-networking conformance suite, run unmodified from the upstream repository against a lab cluster.', [conformanceBlock(data.conformance)]));

    root.appendChild(section('tests', 'Unit and integration tests', 'Integration tests run against a real kube-apiserver and etcd (envtest).', [testsBlock(data.tests), coverageBlock(data.coverage)]));
  }

  /* Content arrives after the fetch, so the browser's own jump to #id happens too early.
   * Rows and short targets are centred; larger sections start at the top, below the
   * sticky header (html has scroll-padding-top). */
  function focusHash() {
    var id = decodeURIComponent((window.location.hash || '').slice(1));
    if (!id) return;
    var target = document.getElementById(id);
    if (!target || !(root && root.contains(target)) && !(preview && preview.contains(target))) return;
    Array.prototype.forEach.call(document.querySelectorAll('.is-target'), function (n) { n.classList.remove('is-target'); });
    target.classList.add('is-target');
    var small = target.tagName === 'TR' || target.getBoundingClientRect().height < window.innerHeight * 0.6;
    target.scrollIntoView({ block: small ? 'center' : 'start' });
    if (target.tagName === 'TR') target.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', focusHash);

  function renderError(where, err) {
    where.textContent = '';
    where.appendChild(h('div', { class: 'state error', role: 'alert' }, [
      h('strong', { text: 'Results are not available. ' }),
      'The page could not load ', h('code', { text: DATA_URL }), ' (' + err + '). ',
      'Run the suite with ', h('code', { text: 'make test-e2e' }), ' and ', h('code', { text: 'make results' }),
      ', or read the raw files in the ', h('a', { href: 'https://github.com/fleetpermit/fleetpermit/tree/main/test-results', text: 'repository test-results directory' }), '.'
    ]));
  }

  function announce(msg) {
    var live = document.getElementById('live-status');
    if (!live) return;
    live.textContent = '';
    window.setTimeout(function () { live.textContent = msg; }, 30);
  }
  function done() {
    [preview, root].forEach(function (w) { if (w) w.removeAttribute('aria-busy'); });
    /* site.js makes overflowing tables, code and figures keyboard-scrollable. */
    document.dispatchEvent(new CustomEvent('fp:rendered'));
  }

  function load() {
    if (!window.fetch) {
      [preview, root].forEach(function (w) { if (w) renderError(w, 'this browser cannot fetch data'); });
      done();
      return;
    }
    /* One request per page: site.js shares it with the hero and the other scripts. */
    var request = window.FleetPermitData ? window.FleetPermitData.load() : fetch(DATA_URL, { cache: 'no-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
    request
      .then(function (data) {
        if (!data || typeof data !== 'object') throw new Error('unexpected format');
        if (preview) renderPreview(data);
        if (root) renderDashboard(data);
        if (answerStats) renderAnswers(data);
        done();
        if (preview || root) announce('Results loaded');
        focusHash();
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : 'unknown error';
        [preview, root].forEach(function (w) { if (w) renderError(w, msg); });
        done();
      });
  }

  load();
})();
