/* Renders data/results.json. Every number on the page comes from that file.
 * Used by the home page preview (#results-preview) and the dashboard (#results-root). */
(function () {
  'use strict';

  var preview = document.getElementById('results-preview');
  var root = document.getElementById('results-root');
  if (!preview && !root) return;

  var DATA_URL = 'data/results.json';
  var DISCLAIMER = 'Local kind clusters on one development host — not a production benchmark.';

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

  /* ---------- Home page preview ---------- */
  function renderPreview(data) {
    preview.textContent = '';
    var e2e = data.e2e || {};
    var banner = sampleBanner(data);
    if (banner) preview.appendChild(banner);
    if (e2e.summary) preview.appendChild(statRow(e2e.summary));
    var lat = data.latency || {};
    var keys = Object.keys(lat).slice(0, 3);
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
  function latencyChart(m, label) {
    var samples = (m.samples || []).filter(isNum);
    var W = 480, H = 150, padL = 44, padB = 22, padT = 10, padR = 10;
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
    g.push(svgEl('text', { x: padL, y: H - 4 }, ['samples in run order (' + (m.unit || '') + ')']));
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

  function latencyBlock(latency) {
    var keys = Object.keys(latency || {});
    if (!keys.length) return h('p', { class: 'state', text: 'This results file has no latency measurements.' });
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
        latencyChart(m, label),
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
    return h('div', null, [row, extra]);
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
        s.command ? h('pre', null, [h('code', { text: s.command })]) : null
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

    var scen = Array.isArray(e2e.scenarios) ? e2e.scenarios : [];
    root.appendChild(section('e2e', 'Real multi-cluster end-to-end scenarios',
      'Every decision is a real MCP call from a real SPIFFE identity through a real Envoy gateway on a managed cluster.', [
        h('h3', { text: 'Verified environment' }),
        envBlock(e2e),
        e2e.environment && e2e.environment.description ? h('p', { class: 'small muted', text: 'Environment: ' + e2e.environment.description + '.' }) : null,
        h('h3', { text: 'Summary' }),
        e2e.summary ? statRow(e2e.summary) : h('p', { class: 'state', text: 'No summary in this results file.' }),
        h('h3', { text: 'Scenarios' }),
        scen.length ? scenarioTable(scen) : h('p', { class: 'state', text: 'No scenarios in this results file.' })
      ]));

    root.appendChild(section('latency', 'Latency on the local lab',
      'Measured by polling the gateway with real MCP calls roughly every 250 ms, so each value includes that polling granularity.', [latencyBlock(data.latency)]));

    root.appendChild(section('scale', 'Simulated controller scale (envtest, no real clusters)',
      (data.scale && data.scale.environment && data.scale.environment.description ? data.scale.environment.description + '. ' : '') +
      'These rows measure the controller against a simulated work agent. They are not measurements of real managed clusters.', [scaleBlock(data.scale)]));

    root.appendChild(section('conformance', 'Upstream conformance',
      'The kube-agentic-networking conformance suite, run unmodified from the upstream repository against a lab cluster.', [conformanceBlock(data.conformance)]));

    root.appendChild(section('tests', 'Unit and integration tests', 'Integration tests run against a real kube-apiserver and etcd (envtest).', [testsBlock(data.tests), coverageBlock(data.coverage)]));

    focusHash();
  }

  function focusHash() {
    var id = decodeURIComponent((window.location.hash || '').slice(1));
    if (!id) return;
    Array.prototype.forEach.call(document.querySelectorAll('.is-target'), function (n) { n.classList.remove('is-target'); });
    var target = document.getElementById(id);
    if (!target) return;
    target.classList.add('is-target');
    target.scrollIntoView({ block: 'center' });
    if (target.tagName === 'TR') target.focus({ preventScroll: true });
  }
  window.addEventListener('hashchange', function () { if (root) focusHash(); });

  function renderError(where, err) {
    where.textContent = '';
    where.appendChild(h('div', { class: 'state error', role: 'alert' }, [
      h('strong', { text: 'Results are not available. ' }),
      'The page could not load ', h('code', { text: DATA_URL }), ' (' + err + '). ',
      'Run the suite with ', h('code', { text: 'make test-e2e' }), ' and ', h('code', { text: 'make results' }),
      ', or read the raw files in the ', h('a', { href: 'https://github.com/fleetpermit/fleetpermit/tree/main/test-results', text: 'repository test-results directory' }), '.'
    ]));
  }

  function load() {
    if (!window.fetch) {
      [preview, root].forEach(function (w) { if (w) renderError(w, 'this browser cannot fetch data'); });
      return;
    }
    fetch(DATA_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || typeof data !== 'object') throw new Error('unexpected format');
        if (preview) renderPreview(data);
        if (root) renderDashboard(data);
      })
      .catch(function (err) {
        var msg = err && err.message ? err.message : 'unknown error';
        [preview, root].forEach(function (w) { if (w) renderError(w, msg); });
      });
  }

  load();
})();
