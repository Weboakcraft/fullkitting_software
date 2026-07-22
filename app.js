/* ============================================================
   APP — state, routing, boot, dashboard & reports (charts)
   ============================================================ */
window.APP = (function () {
  var cfg = window.KMS_CONFIG;

  var state = {
    data: { orders: [], bom: [], inventory: [], purchaseOrders: [], purchaseOrderItems: [], settings: {} },
    view: 'dashboard',
    search: '',
    loadedAt: null,
    searchHandlers: []
  };

  var charts = []; // live Chart.js instances (destroyed on re-render)

  var TITLES = {
    dashboard: 'Dashboard', orders: 'Tab 1 — Order Form', bom: 'Tab 2 — Kitting Master',
    fg: 'Tab 3 — FG Status', inventory: 'Tab 4 — Live Inventory', kitting: 'Tab 5 — Full Kitting Status',
    pr: 'Purchase Requirements', reports: 'Reports & Analysis', settings: 'Settings'
  };

  /* ---------------- theme + chart tokens ---------------- */
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function chartTokens() {
    return {
      s1: cssVar('--s1'), s2: cssVar('--s2'), s3: cssVar('--s3'),
      good: cssVar('--good'), warning: cssVar('--warning'), critical: cssVar('--critical'),
      ink2: cssVar('--ink-2'), muted: cssVar('--muted'), grid: cssVar('--grid'), baseline: cssVar('--baseline')
    };
  }
  function tuneChartDefaults() {
    if (typeof Chart === 'undefined') return; // chart CDN blocked — app still works
    var t = chartTokens();
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = t.muted;
    Chart.defaults.borderColor = t.grid;
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
  }

  /* ---------------- busy / sync indicators ---------------- */
  function busy(on) {
    document.getElementById('refreshBtn').textContent = on ? '…' : '⟳';
    document.getElementById('refreshBtn').disabled = !!on;
  }
  function setSyncInfo() {
    var elx = document.getElementById('syncInfo');
    elx.textContent = state.loadedAt ? ('Synced ' + state.loadedAt.toLocaleTimeString('en-IN')) : '—';
  }

  /* ---------------- data loading ---------------- */
  async function reload(silent) {
    try {
      if (!silent) busy(true);
      state.data = await API.bootstrap();
      state.loadedAt = new Date();
      setSyncInfo();
      updateCounts();
      render(); // re-render current view with fresh data
    } catch (err) {
      if (!silent) U.toast('Sync failed: ' + err.message, 'bad');
    } finally {
      if (!silent) busy(false);
    }
  }

  function updateCounts() {
    var d = state.data;
    var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    set('cnt-orders', ENGINE.activeOrders(d.orders).length);
    set('cnt-bom', ENGINE.bomProducts(d.bom).length);
    set('cnt-inv', (d.inventory || []).length);
    set('cnt-pr', (d.purchaseOrders || []).filter(function (p) { return p['Status'] === 'Pending'; }).length);
  }

  /* ---------------- routing / rendering ---------------- */
  function navigate(view) {
    state.view = view;
    document.querySelectorAll('.nav button').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    document.getElementById('viewTitle').textContent = TITLES[view] || view;
    document.getElementById('sidebar').classList.remove('open');
    render();
  }

  function render() {
    charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    charts = [];
    state.searchHandlers = [];
    var root = document.getElementById('content');
    root.innerHTML = '';
    var v = state.view;
    if (v === 'dashboard') renderDashboard(root);
    else if (v === 'orders') VIEWS.renderOrders(root);
    else if (v === 'bom') VIEWS.renderBom(root);
    else if (v === 'fg') VIEWS.renderFg(root);
    else if (v === 'inventory') VIEWS.renderInventory(root);
    else if (v === 'kitting') VIEWS.renderKitting(root);
    else if (v === 'pr') VIEWS.renderPr(root);
    else if (v === 'reports') renderReports(root);
    else if (v === 'settings') VIEWS.renderSettings(root);
  }

  function onSearch(fn) { state.searchHandlers.push(fn); }

  /* ============================================================
     DASHBOARD
     ============================================================ */
  function chart(canvas, config) {
    if (typeof Chart === 'undefined') {
      canvas.parentNode.innerHTML = '<div class="empty">Chart library not loaded (check internet/CDN access).</div>';
      return null;
    }
    var c = new Chart(canvas.getContext('2d'), config);
    charts.push(c);
    return c;
  }

  function stat(label, value, color, hint) {
    return '<div class="card stat"><div class="label"><span class="dot" style="background:' + color + '"></span>' + label + '</div>' +
      '<div class="value">' + value + '</div><div class="hint">' + hint + '</div></div>';
  }

  function renderDashboard(root) {
    var d = state.data, t = chartTokens();
    var active = ENGINE.activeOrders(d.orders);
    var evals = ENGINE.evaluateAll(d.orders, d.bom, d.inventory);
    var complete = evals.filter(function (e) { return e.result.status === 'COMPLETE'; });
    var pending = evals.filter(function (e) { return e.result.status === 'PENDING'; });
    var noBom = evals.filter(function (e) { return e.result.status === 'NO_BOM'; });
    var shortages = ENGINE.aggregateShortages(evals);
    var pendingPRs = (d.purchaseOrders || []).filter(function (p) { return p['Status'] === 'Pending'; });

    root.insertAdjacentHTML('beforeend',
      '<div class="grid cols-4">' +
      stat('Active Orders', active.length, t.s1, d.orders.length + ' total orders in system') +
      stat('Full Kitting Completed', complete.length, t.good, 'ready for production') +
      stat('Full Kitting Pending', pending.length, t.critical, shortages.length + ' materials short') +
      stat('Pending Purchase Reqs', pendingPRs.length, t.warning, (d.purchaseOrders || []).length + ' PRs total') +
      '</div>');

    root.insertAdjacentHTML('beforeend',
      '<div class="grid cols-2 mt">' +
      '  <div class="card"><h2>Kitting Readiness <span class="sub">active orders by kitting state</span></h2><div class="chartbox"><canvas id="chReady"></canvas></div></div>' +
      '  <div class="card"><h2>Orders by Status</h2><div class="chartbox"><canvas id="chStatus"></canvas></div></div>' +
      '</div>' +
      '<div class="grid cols-2">' +
      '  <div class="card"><h2>Top Shortage Materials <span class="sub">merged across pending orders</span></h2><div class="chartbox"><canvas id="chShort"></canvas></div></div>' +
      '  <div class="card"><h2>Orders per Month <span class="sub">last 6 months</span></h2><div class="chartbox"><canvas id="chTrend"></canvas></div></div>' +
      '</div>');

    // Kitting readiness — state → status palette (with legend + counts in labels)
    chart(root.querySelector('#chReady'), {
      type: 'doughnut',
      data: {
        labels: ['Completed (' + complete.length + ')', 'Pending (' + pending.length + ')', 'No BOM (' + noBom.length + ')'],
        datasets: [{
          data: [complete.length, pending.length, noBom.length],
          backgroundColor: [t.good, t.critical, t.warning],
          borderColor: cssVar('--surface'), borderWidth: 2
        }]
      },
      options: { maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'right' } } }
    });

    // Orders by status — single measure, one hue
    var statusCounts = {};
    cfg.ORDER_STATUSES.forEach(function (s) { statusCounts[s] = 0; });
    d.orders.forEach(function (o) { statusCounts[o['Order Status']] = (statusCounts[o['Order Status']] || 0) + 1; });
    chart(root.querySelector('#chStatus'), {
      type: 'bar',
      data: {
        labels: Object.keys(statusCounts),
        datasets: [{ label: 'Orders', data: Object.keys(statusCounts).map(function (k) { return statusCounts[k]; }),
          backgroundColor: t.s1, borderRadius: 4, maxBarThickness: 34, borderSkipped: 'bottom' }]
      },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: t.grid } }, x: { grid: { display: false } } } }
    });

    // Top shortages — horizontal bar, one hue (orange = "act on this")
    var topShort = shortages.slice(0, 8);
    chart(root.querySelector('#chShort'), {
      type: 'bar',
      data: {
        labels: topShort.map(function (s) { return s.materialName || s.materialCode; }),
        datasets: [{ label: 'Shortage qty', data: topShort.map(function (s) { return s.shortageQty; }),
          backgroundColor: t.s2, borderRadius: 4, maxBarThickness: 22, borderSkipped: 'left' }]
      },
      options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grid: { color: t.grid } }, y: { grid: { display: false } } } }
    });

    // Monthly trend — line
    var months = [], counts = [];
    for (var i = 5; i >= 0; i--) {
      var dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - i);
      var key = dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2);
      months.push(dt.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }));
      counts.push(d.orders.filter(function (o) { return String(o['Order Date']).indexOf(key) === 0; }).length);
    }
    chart(root.querySelector('#chTrend'), {
      type: 'line',
      data: { labels: months, datasets: [{ label: 'Orders', data: counts, borderColor: t.s1,
        backgroundColor: t.s1, borderWidth: 2, pointRadius: 4, tension: 0.25, fill: false }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: t.grid } }, x: { grid: { display: false } } } }
    });

    // Upcoming deliveries
    var upcoming = active.slice().filter(function (o) { return o['Required Delivery Date']; })
      .sort(function (a, b) { return String(a['Required Delivery Date']).localeCompare(String(b['Required Delivery Date'])); })
      .slice(0, 8);
    var evMap = {};
    evals.forEach(function (e) { evMap[e.order['Order ID']] = e.result; });
    root.insertAdjacentHTML('beforeend',
      '<div class="card"><h2>⏰ Upcoming Deliveries</h2><div class="tablewrap">' +
      (!upcoming.length ? '<div class="empty">No upcoming deliveries.</div>' :
        '<table class="tbl"><thead><tr><th>Order</th><th>Customer</th><th>Product</th><th class="num">Qty</th><th>Delivery Date</th><th>Days Left</th><th>Kitting</th></tr></thead><tbody>' +
        upcoming.map(function (o) {
          var days = Math.ceil((new Date(o['Required Delivery Date']) - new Date()) / 86400000);
          var r = evMap[o['Order ID']] || { status: 'NO_BOM' };
          var kit = r.status === 'COMPLETE' ? '<span class="kit-complete">✔ Completed</span>'
            : r.status === 'PENDING' ? '<span class="kit-pending">✖ Pending</span>' : '<span class="muted">No BOM</span>';
          return '<tr><td><b>' + U.esc(o['Order ID']) + '</b></td><td>' + U.esc(o['Customer Name']) + '</td>' +
            '<td>' + U.esc(o['Product Name']) + '</td><td class="num">' + U.fmtQty(o['Quantity']) + '</td>' +
            '<td>' + U.fmtDate(o['Required Delivery Date']) + '</td>' +
            '<td>' + (days < 0 ? '<b style="color:var(--critical)">Overdue ' + (-days) + 'd</b>' : days + ' days') + '</td>' +
            '<td>' + kit + '</td></tr>';
        }).join('') + '</tbody></table>') +
      '</div></div>');
  }

  /* ============================================================
     REPORTS
     ============================================================ */
  function renderReports(root) {
    var d = state.data, t = chartTokens();
    var evals = ENGINE.evaluateAll(d.orders, d.bom, d.inventory);
    var shortages = ENGINE.aggregateShortages(evals);

    /* ---- Product-wise analysis ---- */
    var prodAgg = {};
    d.orders.forEach(function (o) {
      var k = String(o['Product Name'] || '').trim();
      if (!k) return;
      if (!prodAgg[k]) prodAgg[k] = { product: k, category: o['Product Category'], orders: 0, qty: 0 };
      prodAgg[k].orders++;
      prodAgg[k].qty += U.num(o['Quantity']);
    });
    var prodRows = Object.keys(prodAgg).map(function (k) { return prodAgg[k]; })
      .sort(function (a, b) { return b.qty - a.qty; });

    root.insertAdjacentHTML('beforeend',
      '<div class="card"><h2>📊 Product-wise Analysis <span class="sub">all orders</span>' +
      '<span style="float:right"><button class="btn btn-sm" id="expProd">⬇ Excel</button></span></h2>' +
      '<div class="chartbox"><canvas id="chProd"></canvas></div>' +
      '<div class="tablewrap mt"><table class="tbl"><thead><tr><th data-sort>Product</th><th data-sort>Category</th><th data-sort class="num">Orders</th><th data-sort class="num">Total Qty</th></tr></thead><tbody>' +
      prodRows.map(function (p) {
        return '<tr><td><b>' + U.esc(p.product) + '</b></td><td>' + U.esc(p.category) + '</td>' +
          '<td class="num">' + p.orders + '</td><td class="num">' + U.fmtQty(p.qty) + '</td></tr>';
      }).join('') + '</tbody></table></div></div>');

    var topProd = prodRows.slice(0, 10);
    chart(root.querySelector('#chProd'), {
      type: 'bar',
      data: { labels: topProd.map(function (p) { return p.product; }),
        datasets: [{ label: 'Units ordered', data: topProd.map(function (p) { return p.qty; }),
          backgroundColor: t.s1, borderRadius: 4, maxBarThickness: 30 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, grid: { color: t.grid } }, x: { grid: { display: false } } } }
    });
    document.getElementById('expProd').onclick = function () {
      U.exportExcel('Product_Analysis.xlsx', [{ name: 'Products', headers: ['Product', 'Category', 'Orders', 'Total Qty'],
        rows: prodRows.map(function (p) { return [p.product, p.category, p.orders, p.qty]; }) }]);
    };

    /* ---- Raw material consumption ---- */
    var cons = ENGINE.consumption(ENGINE.activeOrders(d.orders), d.bom);
    root.insertAdjacentHTML('beforeend',
      '<div class="card"><h2>🧱 Raw Material Consumption <span class="sub">total requirement from active orders</span>' +
      '<span style="float:right"><button class="btn btn-sm" id="expCons">⬇ Excel</button></span></h2>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th data-sort>Code</th><th data-sort>Material</th><th data-sort class="num">Required Qty</th><th data-sort>Unit</th></tr></thead><tbody>' +
      (cons.length ? cons.map(function (c) {
        return '<tr><td>' + U.esc(c.materialCode) + '</td><td>' + U.esc(c.materialName) + '</td>' +
          '<td class="num"><b>' + U.fmtQty(c.qty) + '</b></td><td>' + U.esc(c.unit) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="empty">No consumption — no active orders with BOM.</td></tr>') +
      '</tbody></table></div></div>');
    document.getElementById('expCons').onclick = function () {
      U.exportExcel('Material_Consumption.xlsx', [{ name: 'Consumption', headers: ['Code', 'Material', 'Required Qty', 'Unit'],
        rows: cons.map(function (c) { return [c.materialCode, c.materialName, c.qty, c.unit]; }) }]);
    };

    /* ---- Inventory availability (low stock) ---- */
    var lows = (d.inventory || []).filter(function (r) {
      var q = U.num(r['Available Qty']), m = U.num(r['Min Stock Level']);
      return q <= 0 || (m > 0 && q < m);
    });
    root.insertAdjacentHTML('beforeend',
      '<div class="card"><h2>📉 Inventory Availability — Low Stock <span class="sub">' + lows.length + ' materials below minimum / out of stock</span>' +
      '<span style="float:right"><button class="btn btn-sm" id="expLow">⬇ Excel</button></span></h2>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>Code</th><th>Material</th><th class="num">Available</th><th class="num">Min Level</th><th>Unit</th><th>State</th></tr></thead><tbody>' +
      (lows.length ? lows.map(function (r) {
        var q = U.num(r['Available Qty']);
        return '<tr><td>' + U.esc(r['Material Code']) + '</td><td>' + U.esc(r['Material Name']) + '</td>' +
          '<td class="num">' + U.fmtQty(q) + '</td><td class="num">' + U.fmtQty(r['Min Stock Level']) + '</td>' +
          '<td>' + U.esc(r['Unit']) + '</td><td>' + (q <= 0 ? U.pill('Out of stock', 'bad') : U.pill('Low', 'warn')) + '</td></tr>';
      }).join('') : '<tr><td colspan="6" class="empty">All materials are above minimum levels. 👍</td></tr>') +
      '</tbody></table></div></div>');
    document.getElementById('expLow').onclick = function () {
      U.exportExcel('Low_Stock.xlsx', [{ name: 'Low Stock', headers: ['Code', 'Material', 'Available', 'Min Level', 'Unit'],
        rows: lows.map(function (r) { return [r['Material Code'], r['Material Name'], r['Available Qty'], r['Min Stock Level'], r['Unit']]; }) }]);
    };

    /* ---- Shortage analysis ---- */
    root.insertAdjacentHTML('beforeend',
      '<div class="card"><h2>🚨 Shortage Analysis <span class="sub">across all pending orders</span>' +
      '<span style="float:right"><button class="btn btn-sm" id="expShort">⬇ Excel</button> <button class="btn btn-sm" id="pdfShort">⬇ PDF</button></span></h2>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>Code</th><th>Material</th><th class="num">Required</th><th class="num">Available</th><th class="num">Shortage</th><th>Unit</th><th>Affected Orders</th></tr></thead><tbody>' +
      (shortages.length ? shortages.map(function (s) {
        return '<tr><td>' + U.esc(s.materialCode) + '</td><td>' + U.esc(s.materialName) + '</td>' +
          '<td class="num">' + U.fmtQty(s.requiredQty) + '</td><td class="num">' + U.fmtQty(s.availableQty) + '</td>' +
          '<td class="num"><b style="color:var(--critical)">' + U.fmtQty(s.shortageQty) + '</b></td>' +
          '<td>' + U.esc(s.unit) + '</td><td class="small">' + U.esc(s.orders.join(', ')) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">No shortages — every pending order is fully covered. 🎉</td></tr>') +
      '</tbody></table></div></div>');
    document.getElementById('expShort').onclick = function () {
      U.exportExcel('Shortage_Analysis.xlsx', [{ name: 'Shortages',
        headers: ['Code', 'Material', 'Required', 'Available', 'Shortage', 'Unit', 'Affected Orders'],
        rows: shortages.map(function (s) { return [s.materialCode, s.materialName, s.requiredQty, s.availableQty, s.shortageQty, s.unit, s.orders.join(', ')]; }) }]);
    };
    document.getElementById('pdfShort').onclick = function () {
      var p = U.pdfDoc('Shortage Analysis Report', ['Generated: ' + new Date().toLocaleString('en-IN')]);
      U.pdfTable(p.doc, p.startY,
        ['Code', 'Material', 'Required', 'Available', 'Shortage', 'Unit', 'Affected Orders'],
        shortages.map(function (s) { return [s.materialCode, s.materialName, U.fmtQty(s.requiredQty), U.fmtQty(s.availableQty), U.fmtQty(s.shortageQty), s.unit, s.orders.join(', ')]; }));
      U.pdfFooter(p.doc);
      p.doc.save('Shortage_Analysis.pdf');
    };
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function showSetupScreen(message) {
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('content').innerHTML =
      '<div class="card" style="max-width:640px;margin:40px auto">' +
      '<h2>🔌 Connect your backend</h2>' +
      '<p>' + U.esc(message) + '</p>' +
      '<ol class="small" style="line-height:1.9">' +
      '<li>Open <b>script.google.com</b> and paste the contents of <code>backend/Code.gs</code>.</li>' +
      '<li>Deploy → New deployment → <b>Web app</b> → Execute as <b>Me</b> → Access: <b>Anyone</b>.</li>' +
      '<li>Copy the Web App URL (ends in <code>/exec</code>).</li>' +
      '<li>Paste it into <code>js/config.js</code> → <code>API_URL</code> and reload this page.</li>' +
      '</ol>' +
      '<p class="small muted">Full instructions are in SETUP_GUIDE.md.</p></div>';
  }

  async function boot() {
    tuneChartDefaults();

    // theme
    var savedTheme = null;
    try { savedTheme = window.localStorage ? localStorage.getItem('kms-theme') : null; } catch (e) {}
    if (savedTheme === 'dark') document.documentElement.dataset.theme = 'dark';
    document.getElementById('themeBtn').onclick = function () {
      var dark = document.documentElement.dataset.theme === 'dark';
      if (dark) delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = 'dark';
      try { localStorage.setItem('kms-theme', dark ? 'light' : 'dark'); } catch (e) {}
      tuneChartDefaults();
      render();
    };

    // nav
    document.querySelectorAll('.nav button').forEach(function (b) {
      b.addEventListener('click', function () { navigate(b.dataset.view); });
    });
    document.getElementById('hamburger').onclick = function () {
      document.getElementById('sidebar').classList.toggle('open');
    };
    document.getElementById('refreshBtn').onclick = function () { reload(); };

    // global search
    document.getElementById('globalSearch').addEventListener('input', U.debounce(function (e) {
      state.search = e.target.value;
      state.searchHandlers.forEach(function (fn) { fn(); });
    }, 200));

    // first load
    try {
      document.getElementById('loadingMsg').textContent = 'Loading data from Google Sheets…';
      state.data = await API.bootstrap();
      state.loadedAt = new Date();
    } catch (err) {
      showSetupScreen(err.message);
      return;
    }
    document.getElementById('loading').classList.add('hidden');
    setSyncInfo();
    updateCounts();
    navigate('dashboard');

    // instant re-sync when the user returns to this browser tab
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) reload(true);
    });

    // background auto-refresh (real-time sync with Google Sheets)
    setInterval(function () {
      // don't clobber the UI while a modal / form is in use
      if (document.getElementById('modalRoot').innerHTML) return;
      var ae = document.activeElement;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
      reload(true);
    }, cfg.REFRESH_MS);
  }

  document.addEventListener('DOMContentLoaded', boot);

  return { state: state, reload: reload, busy: busy, onSearch: onSearch, navigate: navigate };
})();
