/* ============================================================
   VIEWS — renders every tab. Pure DOM generation from APP.state.
   ============================================================ */
window.VIEWS = (function () {
  var cfg = window.KMS_CONFIG;

  /* ================= shared helpers ================= */

  function D() { return APP.state.data; }
  function S() { return (APP.state.search || '').toLowerCase(); }

  function matchesSearch(obj, fields) {
    var q = S();
    if (!q) return true;
    return fields.some(function (f) {
      return String(obj[f] == null ? '' : obj[f]).toLowerCase().indexOf(q) !== -1;
    });
  }

  function el(html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function options(list, selected) {
    return list.map(function (v) {
      return '<option value="' + U.esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + U.esc(v) + '</option>';
    }).join('');
  }

  /** Make a table sortable by clicking headers. */
  function makeSortable(table) {
    var ths = table.querySelectorAll('th[data-sort]');
    ths.forEach(function (th, idx) {
      th.addEventListener('click', function () {
        var tbody = table.querySelector('tbody');
        var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
        var col = Array.prototype.indexOf.call(th.parentNode.children, th);
        var dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
        ths.forEach(function (t) { delete t.dataset.dir; t.querySelector('.arrow') && t.querySelector('.arrow').remove(); });
        th.dataset.dir = dir;
        th.insertAdjacentHTML('beforeend', '<span class="arrow">' + (dir === 'asc' ? '▲' : '▼') + '</span>');
        rows.sort(function (a, b) {
          var av = a.children[col] ? a.children[col].textContent.trim() : '';
          var bv = b.children[col] ? b.children[col].textContent.trim() : '';
          var an = parseFloat(av.replace(/,/g, '')), bn = parseFloat(bv.replace(/,/g, ''));
          var cmp;
          if (!isNaN(an) && !isNaN(bn)) cmp = an - bn;
          else cmp = av.localeCompare(bv);
          return dir === 'asc' ? cmp : -cmp;
        });
        rows.forEach(function (r) { tbody.appendChild(r); });
      });
    });
  }

  /* ---------- modal ---------- */
  function openModal(title, bodyHTML, footerHTML) {
    closeModal();
    var root = document.getElementById('modalRoot');
    root.innerHTML =
      '<div class="modal-backdrop" id="mb">' +
      '  <div class="modal">' +
      '    <header><h3>' + U.esc(title) + '</h3><button class="x" id="modalX">✕</button></header>' +
      '    <div class="body" id="modalBody">' + bodyHTML + '</div>' +
      (footerHTML ? '<footer id="modalFooter">' + footerHTML + '</footer>' : '') +
      '  </div>' +
      '</div>';
    document.getElementById('modalX').onclick = closeModal;
    document.getElementById('mb').addEventListener('click', function (e) {
      if (e.target.id === 'mb') closeModal();
    });
    return root;
  }
  function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

  /* ============================================================
     TAB 1 — ORDER FORM
     ============================================================ */
  function renderOrders(root) {
    var d = D();
    var products = ENGINE.bomProducts(d.bom);

    root.appendChild(el(
      '<div class="card">' +
      '<h2>➕ Create New Order <span class="sub">Order ID is auto-generated (leave blank) or type your own</span></h2>' +
      '<form class="frm" id="orderForm">' +
      '  <div class="field"><label>Order ID (optional)</label><input name="Order ID" placeholder="auto e.g. ORD-2026-0001" /></div>' +
      '  <div class="field"><label>Order Date *</label><input name="Order Date" type="date" required value="' + U.todayISO() + '" /></div>' +
      '  <div class="field"><label>Customer Name *</label><input name="Customer Name" required placeholder="Customer / dealer name" /></div>' +
      '  <div class="field"><label>Customer Contact</label><input name="Customer Contact" placeholder="Phone / email" /></div>' +
      '  <div class="field"><label>Product Category *</label><select name="Product Category" required><option value="">— select —</option>' + options(cfg.CATEGORIES) + '</select></div>' +
      '  <div class="field"><label>Product Name *</label><input name="Product Name" required list="productList" placeholder="Exactly as in Kitting Master" />' +
      '    <datalist id="productList">' + products.map(function (p) { return '<option value="' + U.esc(p.product) + '">'; }).join('') + '</datalist></div>' +
      '  <div class="field"><label>Quantity *</label><input name="Quantity" type="number" min="1" step="1" required placeholder="0" /></div>' +
      '  <div class="field"><label>Required Delivery Date</label><input name="Required Delivery Date" type="date" /></div>' +
      '  <div class="field"><label>Priority</label><select name="Priority">' + options(cfg.PRIORITIES, 'Normal') + '</select></div>' +
      '  <div class="field"><label>Order Status</label><select name="Order Status">' + options(cfg.ORDER_STATUSES, 'Open') + '</select></div>' +
      '  <div class="field span2"><label>Remarks</label><input name="Remarks" placeholder="Any additional order details" /></div>' +
      '  <div class="formactions">' +
      '    <button class="btn btn-primary" type="submit">Save Order</button>' +
      '    <button class="btn" type="reset">Clear</button>' +
      '  </div>' +
      '</form></div>'
    ));

    root.querySelector('#orderForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var fd = new FormData(e.target), o = {};
      fd.forEach(function (v, k) { o[k] = v; });
      var known = products.some(function (p) { return p.product.toLowerCase() === String(o['Product Name']).trim().toLowerCase(); });
      if (!known && !confirm('"' + o['Product Name'] + '" has no BOM in the Kitting Master yet.\nKitting status will show "No BOM" until you add it.\n\nSave the order anyway?')) return;
      try {
        APP.busy(true);
        var res = await API.createOrder(o);
        U.toast('Order ' + res.orderId + ' saved to Google Sheets', 'good');
        e.target.reset();
        await APP.reload();
      } catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
    });

    // ---- filters + table ----
    var card = el(
      '<div class="card"><h2>📋 Orders</h2>' +
      '<div class="filters">' +
      '  <div class="field"><label>Status</label><select id="fStatus"><option value="">All</option>' + options(cfg.ORDER_STATUSES) + '</select></div>' +
      '  <div class="field"><label>Category</label><select id="fCat"><option value="">All</option>' + options(cfg.CATEGORIES) + '</select></div>' +
      '  <div class="field"><label>From</label><input id="fFrom" type="date"/></div>' +
      '  <div class="field"><label>To</label><input id="fTo" type="date"/></div>' +
      '  <button class="btn btn-sm" id="fClear">Clear filters</button>' +
      '  <span class="spacer"></span>' +
      '  <button class="btn btn-sm" id="expOrders">⬇ Excel</button>' +
      '</div>' +
      '<div class="tablewrap" id="ordersTableWrap"></div></div>'
    );
    root.appendChild(card);

    function draw() {
      var st = card.querySelector('#fStatus').value,
          cat = card.querySelector('#fCat').value,
          from = card.querySelector('#fFrom').value,
          to = card.querySelector('#fTo').value;
      var rows = d.orders.filter(function (o) {
        if (st && o['Order Status'] !== st) return false;
        if (cat && o['Product Category'] !== cat) return false;
        if (from && String(o['Order Date']) < from) return false;
        if (to && String(o['Order Date']) > to) return false;
        return matchesSearch(o, ['Order ID', 'Customer Name', 'Product Name', 'Product Category', 'Order Status', 'Remarks']);
      });
      var wrap = card.querySelector('#ordersTableWrap');
      if (!rows.length) { wrap.innerHTML = '<div class="empty">No orders found. Create your first order above.</div>'; return; }
      wrap.innerHTML =
        '<table class="tbl"><thead><tr>' +
        '<th data-sort>Order ID</th><th data-sort>Date</th><th data-sort>Customer</th><th data-sort>Category</th>' +
        '<th data-sort>Product</th><th data-sort class="num">Qty</th><th data-sort>Delivery</th><th data-sort>Priority</th>' +
        '<th data-sort>Status</th><th></th></tr></thead><tbody>' +
        rows.map(function (o) {
          return '<tr>' +
            '<td><b>' + U.esc(o['Order ID']) + '</b></td>' +
            '<td>' + U.fmtDate(o['Order Date']) + '</td>' +
            '<td>' + U.esc(o['Customer Name']) + '</td>' +
            '<td>' + U.esc(o['Product Category']) + '</td>' +
            '<td>' + U.esc(o['Product Name']) + '</td>' +
            '<td class="num">' + U.fmtQty(o['Quantity']) + '</td>' +
            '<td>' + U.fmtDate(o['Required Delivery Date']) + '</td>' +
            '<td>' + U.esc(o['Priority'] || '') + '</td>' +
            '<td>' + U.orderStatusPill(String(o['Order Status'])) + '</td>' +
            '<td class="rowactions">' +
            '  <button class="btn btn-sm" data-edit="' + U.esc(o['Order ID']) + '">✏️</button> ' +
            '  <button class="btn btn-sm btn-danger" data-del="' + U.esc(o['Order ID']) + '">🗑</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table>';
      makeSortable(wrap.querySelector('table'));

      wrap.querySelectorAll('[data-edit]').forEach(function (b) {
        b.onclick = function () { editOrderModal(b.dataset.edit); };
      });
      wrap.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = async function () {
          if (!confirm('Delete order ' + b.dataset.del + '? This cannot be undone.')) return;
          try { APP.busy(true); await API.deleteOrder(b.dataset.del); U.toast('Order deleted', 'good'); await APP.reload(); }
          catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
        };
      });
    }
    ['fStatus', 'fCat', 'fFrom', 'fTo'].forEach(function (id) { card.querySelector('#' + id).addEventListener('change', draw); });
    card.querySelector('#fClear').onclick = function () {
      ['fStatus', 'fCat', 'fFrom', 'fTo'].forEach(function (id) { card.querySelector('#' + id).value = ''; });
      draw();
    };
    card.querySelector('#expOrders').onclick = function () {
      U.exportExcel('Orders.xlsx', [{
        name: 'Orders',
        headers: ['Order ID', 'Order Date', 'Customer Name', 'Customer Contact', 'Product Category', 'Product Name', 'Quantity', 'Required Delivery Date', 'Priority', 'Order Status', 'Remarks'],
        rows: d.orders.map(function (o) {
          return ['Order ID', 'Order Date', 'Customer Name', 'Customer Contact', 'Product Category', 'Product Name', 'Quantity', 'Required Delivery Date', 'Priority', 'Order Status', 'Remarks']
            .map(function (h) { return o[h]; });
        })
      }]);
    };
    draw();
    APP.onSearch(draw);
  }

  function editOrderModal(orderId) {
    var o = D().orders.find(function (x) { return String(x['Order ID']) === String(orderId); });
    if (!o) return;
    openModal('Edit Order — ' + orderId,
      '<form class="frm" id="editOrderForm">' +
      '  <div class="field"><label>Order Date</label><input name="Order Date" type="date" value="' + U.esc(o['Order Date']) + '"/></div>' +
      '  <div class="field"><label>Customer Name</label><input name="Customer Name" value="' + U.esc(o['Customer Name']) + '"/></div>' +
      '  <div class="field"><label>Customer Contact</label><input name="Customer Contact" value="' + U.esc(o['Customer Contact'] || '') + '"/></div>' +
      '  <div class="field"><label>Product Category</label><select name="Product Category">' + options(cfg.CATEGORIES, o['Product Category']) + '</select></div>' +
      '  <div class="field"><label>Product Name</label><input name="Product Name" value="' + U.esc(o['Product Name']) + '"/></div>' +
      '  <div class="field"><label>Quantity</label><input name="Quantity" type="number" min="1" value="' + U.esc(o['Quantity']) + '"/></div>' +
      '  <div class="field"><label>Required Delivery Date</label><input name="Required Delivery Date" type="date" value="' + U.esc(o['Required Delivery Date']) + '"/></div>' +
      '  <div class="field"><label>Priority</label><select name="Priority">' + options(cfg.PRIORITIES, o['Priority']) + '</select></div>' +
      '  <div class="field"><label>Order Status</label><select name="Order Status">' + options(cfg.ORDER_STATUSES, o['Order Status']) + '</select></div>' +
      '  <div class="field span3"><label>Remarks</label><input name="Remarks" value="' + U.esc(o['Remarks'] || '') + '"/></div>' +
      '</form>',
      '<button class="btn" id="mCancel">Cancel</button><button class="btn btn-primary" id="mSave">Save Changes</button>'
    );
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('mSave').onclick = async function () {
      var fd = new FormData(document.getElementById('editOrderForm')), p = { 'Order ID': orderId };
      fd.forEach(function (v, k) { p[k] = v; });
      try { APP.busy(true); await API.updateOrder(p); U.toast('Order updated', 'good'); closeModal(); await APP.reload(); }
      catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
    };
  }

  /* ============================================================
     TAB 2 — KITTING MASTER (BOM)
     ============================================================ */
  function renderBom(root) {
    var d = D();

    // --- entry form: product header + dynamic material lines ---
    var formCard = el(
      '<div class="card">' +
      '<h2>🧩 Define Product Kitting (BOM) <span class="sub">Add all raw materials required to build one unit of a product</span></h2>' +
      '<div class="frm" style="margin-bottom:10px">' +
      '  <div class="field"><label>Product Category *</label><select id="bomCat"><option value="">— select —</option>' + options(cfg.CATEGORIES) + '</select></div>' +
      '  <div class="field span2"><label>Product Name *</label><input id="bomProduct" placeholder="e.g. Royal Oak Recliner Sofa 3-Seater" /></div>' +
      '</div>' +
      '<div class="tablewrap"><table class="tbl" id="bomLines"><thead><tr>' +
      '<th>Raw Material Code *</th><th>Raw Material Name *</th><th class="num">Qty / Unit *</th><th>Unit</th><th></th>' +
      '</tr></thead><tbody></tbody></table></div>' +
      '<div class="toolrow mt">' +
      '  <button class="btn btn-sm" id="addLine">＋ Add Material Line</button>' +
      '  <span class="spacer"></span>' +
      '  <button class="btn btn-primary" id="saveBom">Save BOM to Google Sheets</button>' +
      '</div></div>'
    );
    root.appendChild(formCard);

    var invCodes = (d.inventory || []).map(function (r) { return String(r['Material Code']); });
    var dl = '<datalist id="matCodes">' + invCodes.map(function (c) { return '<option value="' + U.esc(c) + '">'; }).join('') + '</datalist>';
    formCard.insertAdjacentHTML('beforeend', dl);

    function addLine() {
      var tr = el('<tr>' +
        '<td><input class="lc" list="matCodes" placeholder="RM-0001" style="width:100%;padding:6px 8px;border:1px solid var(--baseline);border-radius:7px;background:var(--surface);color:var(--ink)"/></td>' +
        '<td><input class="ln" placeholder="Material name" style="width:100%;padding:6px 8px;border:1px solid var(--baseline);border-radius:7px;background:var(--surface);color:var(--ink)"/></td>' +
        '<td><input class="lq num" type="number" min="0" step="any" placeholder="0" style="width:90px;padding:6px 8px;border:1px solid var(--baseline);border-radius:7px;background:var(--surface);color:var(--ink);text-align:right"/></td>' +
        '<td><select class="lu" style="padding:6px 8px;border:1px solid var(--baseline);border-radius:7px;background:var(--surface);color:var(--ink)">' + options(cfg.UNITS, 'PCS') + '</select></td>' +
        '<td class="rowactions"><button class="btn btn-sm btn-danger rm">✕</button></td></tr>');
      tr.querySelector('.rm').onclick = function () { tr.remove(); };
      // auto-fill name/unit from inventory when a known code is chosen
      tr.querySelector('.lc').addEventListener('change', function () {
        var code = this.value.trim().toUpperCase();
        var inv = (d.inventory || []).find(function (r) { return String(r['Material Code']).toUpperCase() === code; });
        if (inv) {
          tr.querySelector('.ln').value = inv['Material Name'] || '';
          if (inv['Unit']) tr.querySelector('.lu').value = String(inv['Unit']).toUpperCase();
        }
      });
      formCard.querySelector('#bomLines tbody').appendChild(tr);
    }
    formCard.querySelector('#addLine').onclick = addLine;
    addLine(); addLine(); addLine();

    formCard.querySelector('#saveBom').onclick = async function () {
      var cat = formCard.querySelector('#bomCat').value,
          prod = formCard.querySelector('#bomProduct').value.trim();
      if (!cat || !prod) return U.toast('Select a category and enter the product name', 'bad');
      var items = [];
      formCard.querySelectorAll('#bomLines tbody tr').forEach(function (tr) {
        var code = tr.querySelector('.lc').value.trim(),
            name = tr.querySelector('.ln').value.trim(),
            qty = Number(tr.querySelector('.lq').value),
            unit = tr.querySelector('.lu').value;
        if (code && name && qty > 0) {
          items.push({ 'Product Category': cat, 'Product Name': prod, 'Raw Material Code': code, 'Raw Material Name': name, 'Qty Per Unit': qty, 'Unit': unit });
        }
      });
      if (!items.length) return U.toast('Add at least one complete material line (code, name, qty)', 'bad');
      try {
        APP.busy(true);
        await API.saveBomItems(items);
        U.toast(items.length + ' BOM lines saved for ' + prod, 'good');
        formCard.querySelector('#bomProduct').value = '';
        formCard.querySelectorAll('#bomLines tbody tr').forEach(function (tr) { tr.remove(); });
        addLine(); addLine(); addLine();
        await APP.reload();
      } catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
    };

    // --- existing BOM table ---
    var products = ENGINE.bomProducts(d.bom);
    var listCard = el(
      '<div class="card"><h2>📚 Kitting Master Database <span class="sub">' + products.length + ' products · ' + d.bom.length + ' material lines</span></h2>' +
      '<div class="filters">' +
      '  <div class="field"><label>Category</label><select id="bfCat"><option value="">All</option>' + options(cfg.CATEGORIES) + '</select></div>' +
      '  <div class="field"><label>Product</label><select id="bfProd"><option value="">All</option>' + products.map(function (p) { return '<option>' + U.esc(p.product) + '</option>'; }).join('') + '</select></div>' +
      '  <span class="spacer"></span>' +
      '  <button class="btn btn-sm" id="expBom">⬇ Excel</button>' +
      '</div>' +
      '<div class="tablewrap" id="bomTableWrap"></div></div>'
    );
    root.appendChild(listCard);

    function drawBom() {
      var cat = listCard.querySelector('#bfCat').value, prod = listCard.querySelector('#bfProd').value;
      var rows = d.bom.filter(function (b) {
        if (cat && b['Product Category'] !== cat) return false;
        if (prod && b['Product Name'] !== prod) return false;
        return matchesSearch(b, ['Product Name', 'Product Category', 'Raw Material Code', 'Raw Material Name']);
      });
      var wrap = listCard.querySelector('#bomTableWrap');
      if (!rows.length) { wrap.innerHTML = '<div class="empty">No BOM lines yet. Define your first product above.</div>'; return; }
      wrap.innerHTML =
        '<table class="tbl"><thead><tr>' +
        '<th data-sort>BOM ID</th><th data-sort>Category</th><th data-sort>Product</th><th data-sort>Material Code</th>' +
        '<th data-sort>Material Name</th><th data-sort class="num">Qty / Unit</th><th data-sort>Unit</th><th></th>' +
        '</tr></thead><tbody>' +
        rows.map(function (b) {
          return '<tr><td class="muted small">' + U.esc(b['BOM ID']) + '</td>' +
            '<td>' + U.esc(b['Product Category']) + '</td><td><b>' + U.esc(b['Product Name']) + '</b></td>' +
            '<td>' + U.esc(b['Raw Material Code']) + '</td><td>' + U.esc(b['Raw Material Name']) + '</td>' +
            '<td class="num">' + U.fmtQty(b['Qty Per Unit']) + '</td><td>' + U.esc(b['Unit']) + '</td>' +
            '<td class="rowactions">' +
            '  <button class="btn btn-sm" data-bedit="' + U.esc(b['BOM ID']) + '">✏️</button> ' +
            '  <button class="btn btn-sm btn-danger" data-bdel="' + U.esc(b['BOM ID']) + '">🗑</button></td></tr>';
        }).join('') + '</tbody></table>';
      makeSortable(wrap.querySelector('table'));
      wrap.querySelectorAll('[data-bedit]').forEach(function (b) { b.onclick = function () { editBomModal(b.dataset.bedit); }; });
      wrap.querySelectorAll('[data-bdel]').forEach(function (b) {
        b.onclick = async function () {
          if (!confirm('Delete BOM line ' + b.dataset.bdel + '?')) return;
          try { APP.busy(true); await API.deleteBomItem(b.dataset.bdel); U.toast('BOM line deleted', 'good'); await APP.reload(); }
          catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
        };
      });
    }
    ['bfCat', 'bfProd'].forEach(function (id) { listCard.querySelector('#' + id).addEventListener('change', drawBom); });
    listCard.querySelector('#expBom').onclick = function () {
      U.exportExcel('KittingMaster.xlsx', [{
        name: 'Kitting Master',
        headers: ['BOM ID', 'Product Category', 'Product Name', 'Raw Material Code', 'Raw Material Name', 'Qty Per Unit', 'Unit'],
        rows: d.bom.map(function (b) {
          return ['BOM ID', 'Product Category', 'Product Name', 'Raw Material Code', 'Raw Material Name', 'Qty Per Unit', 'Unit'].map(function (h) { return b[h]; });
        })
      }]);
    };
    drawBom();
    APP.onSearch(drawBom);
  }

  function editBomModal(bomId) {
    var b = D().bom.find(function (x) { return String(x['BOM ID']) === String(bomId); });
    if (!b) return;
    openModal('Edit BOM Line — ' + bomId,
      '<form class="frm" id="editBomForm">' +
      '  <div class="field"><label>Product Category</label><select name="Product Category">' + options(cfg.CATEGORIES, b['Product Category']) + '</select></div>' +
      '  <div class="field span2"><label>Product Name</label><input name="Product Name" value="' + U.esc(b['Product Name']) + '"/></div>' +
      '  <div class="field"><label>Raw Material Code</label><input name="Raw Material Code" value="' + U.esc(b['Raw Material Code']) + '"/></div>' +
      '  <div class="field"><label>Raw Material Name</label><input name="Raw Material Name" value="' + U.esc(b['Raw Material Name']) + '"/></div>' +
      '  <div class="field"><label>Qty Per Unit</label><input name="Qty Per Unit" type="number" min="0" step="any" value="' + U.esc(b['Qty Per Unit']) + '"/></div>' +
      '  <div class="field"><label>Unit</label><select name="Unit">' + options(cfg.UNITS, String(b['Unit']).toUpperCase()) + '</select></div>' +
      '</form>',
      '<button class="btn" id="mCancel">Cancel</button><button class="btn btn-primary" id="mSave">Save Changes</button>'
    );
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('mSave').onclick = async function () {
      var fd = new FormData(document.getElementById('editBomForm')), p = { 'BOM ID': bomId };
      fd.forEach(function (v, k) { p[k] = v; });
      try { APP.busy(true); await API.updateBomItem(p); U.toast('BOM updated', 'good'); closeModal(); await APP.reload(); }
      catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
    };
  }

  /* ============================================================
     TAB 3 — FG STATUS (requirement per order)
     ============================================================ */
  function renderFg(root) {
    var d = D();
    var active = ENGINE.activeOrders(d.orders);

    var card = el(
      '<div class="card"><h2>🏭 Finished Goods — Raw Material Requirement <span class="sub">Auto-calculated: Order × Kitting Master</span></h2>' +
      '<div class="filters">' +
      '  <div class="field"><label>Order</label><select id="fgOrder"><option value="">All active orders</option>' +
      active.map(function (o) { return '<option value="' + U.esc(o['Order ID']) + '">' + U.esc(o['Order ID'] + ' — ' + o['Product Name']) + '</option>'; }).join('') +
      '  </select></div>' +
      '  <span class="spacer"></span>' +
      '  <button class="btn btn-sm" id="fgExcel">⬇ Excel</button>' +
      '  <button class="btn btn-sm" id="fgPdf">⬇ PDF</button>' +
      '  <button class="btn btn-sm" id="fgPrint">🖨 Print</button>' +
      '</div>' +
      '<div id="fgBody"></div></div>'
    );
    root.appendChild(card);

    function currentData() {
      var sel = card.querySelector('#fgOrder').value;
      var orders = sel ? active.filter(function (o) { return o['Order ID'] === sel; }) : active;
      return orders.map(function (o) { return { order: o, reqs: ENGINE.orderRequirements(o, d.bom) }; });
    }

    function draw() {
      var data = currentData();
      var body = card.querySelector('#fgBody');
      if (!data.length) { body.innerHTML = '<div class="empty">No active orders. Create an order in the Order Form tab.</div>'; return; }
      body.innerHTML = data.map(function (blk) {
        var o = blk.order;
        var head = '<div class="mt"><b>' + U.esc(o['Order ID']) + '</b> · ' + U.esc(o['Product Name']) +
          ' · Qty <b>' + U.fmtQty(o['Quantity']) + '</b> · ' + U.esc(o['Customer Name']) +
          ' · Delivery ' + (U.fmtDate(o['Required Delivery Date']) || '—') + '</div>';
        if (!blk.reqs.length) return head + '<div class="notice">No BOM defined for "' + U.esc(o['Product Name']) + '" — add it in the Kitting Master tab.</div>';
        var searchRows = blk.reqs.filter(function (r) {
          return matchesSearch({ a: r.materialCode, b: r.materialName, c: r.orderId, d: r.productName }, ['a', 'b', 'c', 'd']);
        });
        return head +
          '<div class="tablewrap"><table class="tbl"><thead><tr>' +
          '<th>Material Code</th><th>Raw Material Name</th><th class="num">Per Unit</th><th class="num">Total Required</th><th>Unit</th>' +
          '</tr></thead><tbody>' +
          searchRows.map(function (r) {
            return '<tr><td>' + U.esc(r.materialCode) + '</td><td>' + U.esc(r.materialName) + '</td>' +
              '<td class="num">' + U.fmtQty(r.perUnit) + '</td><td class="num"><b>' + U.fmtQty(r.requiredQty) + '</b></td><td>' + U.esc(r.unit) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
      }).join('');
    }

    function flatRows() {
      var out = [];
      currentData().forEach(function (blk) {
        blk.reqs.forEach(function (r) {
          out.push([r.orderId, r.productName, r.materialCode, r.materialName, r.perUnit, r.requiredQty, r.unit]);
        });
      });
      return out;
    }
    var HEAD = ['Order ID', 'Product Name', 'Material Code', 'Raw Material Name', 'Qty Per Unit', 'Total Required', 'Unit'];

    card.querySelector('#fgOrder').addEventListener('change', draw);
    card.querySelector('#fgExcel').onclick = function () {
      U.exportExcel('FG_Requirement.xlsx', [{ name: 'FG Requirement', headers: HEAD, rows: flatRows() }]);
    };
    card.querySelector('#fgPdf').onclick = function () {
      var p = U.pdfDoc('Finished Goods — Raw Material Requirement', ['Generated: ' + new Date().toLocaleString('en-IN')]);
      var y = U.pdfTable(p.doc, p.startY, HEAD, flatRows());
      U.pdfFooter(p.doc);
      p.doc.save('FG_Requirement.pdf');
    };
    card.querySelector('#fgPrint').onclick = function () {
      var rows = flatRows();
      U.printHTML('FG Requirement',
        '<h1>' + cfg.COMPANY_NAME + ' — FG Raw Material Requirement</h1><div class="sub">' + new Date().toLocaleString('en-IN') + '</div>' +
        '<table><thead><tr>' + HEAD.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + U.esc(c) + '</td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table>');
    };
    draw();
    APP.onSearch(draw);
  }

  /* ============================================================
     TAB 4 — LIVE INVENTORY
     ============================================================ */
  function renderInventory(root) {
    var d = D();
    var src = (d.settings && d.settings.IMS_SPREADSHEET_ID) ? 'Linked IMS Google Sheet' : 'Inventory tab of the KMS database sheet';

    var card = el(
      '<div class="card"><h2>📦 Live Inventory <span class="sub">Source: ' + U.esc(src) + ' · auto-refreshes every ' + (cfg.REFRESH_MS / 1000) + 's</span></h2>' +
      '<div class="toolrow">' +
      '  <label class="small muted"><input type="checkbox" id="lowOnly"/> Show low / out-of-stock only</label>' +
      '  <span class="spacer"></span>' +
      '  <button class="btn btn-sm" id="invExcel">⬇ Excel</button>' +
      '</div>' +
      '<div class="tablewrap" id="invWrap"></div></div>'
    );
    root.appendChild(card);

    // which materials are demanded by active orders (for context)
    var demand = {};
    ENGINE.evaluateAll(d.orders, d.bom, d.inventory).forEach(function (ev) {
      ev.result.lines.forEach(function (l) {
        var k = l.materialCode.toUpperCase();
        demand[k] = (demand[k] || 0) + l.requiredQty;
      });
    });

    function draw() {
      var lowOnly = card.querySelector('#lowOnly').checked;
      var rows = (d.inventory || []).filter(function (r) {
        var qty = U.num(r['Available Qty']);
        var min = U.num(r['Min Stock Level']);
        var low = qty <= 0 || (min > 0 && qty < min);
        if (lowOnly && !low) return false;
        return matchesSearch(r, ['Material Code', 'Material Name', 'Category', 'Location']);
      });
      var wrap = card.querySelector('#invWrap');
      if (!rows.length) { wrap.innerHTML = '<div class="empty">No inventory records found.</div>'; return; }
      wrap.innerHTML =
        '<table class="tbl"><thead><tr>' +
        '<th data-sort>Code</th><th data-sort>Material Name</th><th data-sort>Category</th>' +
        '<th data-sort class="num">Available</th><th data-sort>Unit</th><th data-sort class="num">Demand (open orders)</th>' +
        '<th data-sort class="num">Min Level</th><th>Stock Health</th>' +
        '</tr></thead><tbody>' +
        rows.map(function (r) {
          var qty = U.num(r['Available Qty']), min = U.num(r['Min Stock Level']);
          var dem = demand[String(r['Material Code']).toUpperCase()] || 0;
          var health;
          if (qty <= 0) health = U.pill('Out of stock', 'bad');
          else if (dem > qty) health = U.pill('Below demand', 'warn');
          else if (min > 0 && qty < min) health = U.pill('Below min level', 'warn');
          else health = U.pill('OK', 'good');
          return '<tr><td>' + U.esc(r['Material Code']) + '</td><td>' + U.esc(r['Material Name']) + '</td>' +
            '<td>' + U.esc(r['Category'] || '') + '</td><td class="num"><b>' + U.fmtQty(qty) + '</b></td>' +
            '<td>' + U.esc(r['Unit']) + '</td><td class="num">' + U.fmtQty(dem) + '</td>' +
            '<td class="num">' + (min ? U.fmtQty(min) : '—') + '</td><td>' + health + '</td></tr>';
        }).join('') + '</tbody></table>';
      makeSortable(wrap.querySelector('table'));
    }
    card.querySelector('#lowOnly').addEventListener('change', draw);
    card.querySelector('#invExcel').onclick = function () {
      U.exportExcel('Live_Inventory.xlsx', [{
        name: 'Inventory',
        headers: ['Material Code', 'Material Name', 'Category', 'Available Qty', 'Unit', 'Min Stock Level', 'Location'],
        rows: d.inventory.map(function (r) {
          return ['Material Code', 'Material Name', 'Category', 'Available Qty', 'Unit', 'Min Stock Level', 'Location'].map(function (h) { return r[h]; });
        })
      }]);
    };
    draw();
    APP.onSearch(draw);
  }

  /* ============================================================
     TAB 5 — FULL KITTING STATUS
     ============================================================ */
  function renderKitting(root) {
    var d = D();
    var evals = ENGINE.evaluateAll(d.orders, d.bom, d.inventory);
    var complete = evals.filter(function (e) { return e.result.status === 'COMPLETE'; }).length;
    var pending = evals.filter(function (e) { return e.result.status === 'PENDING'; }).length;
    var noBom = evals.filter(function (e) { return e.result.status === 'NO_BOM'; }).length;

    root.appendChild(el(
      '<div class="grid cols-3">' +
      stat('Full Kitting Completed', complete, 'var(--good)', 'orders ready to manufacture') +
      stat('Full Kitting Pending', pending, 'var(--critical)', 'orders short of material') +
      stat('No BOM Defined', noBom, 'var(--warning)', 'add these products in Kitting Master') +
      '</div>'
    ));

    var card = el(
      '<div class="card"><h2>✅ Full Kitting Status <span class="sub">Requirement (FG Status) vs Live Inventory — updated in real time</span></h2>' +
      '<div class="filters">' +
      '  <div class="field"><label>Show</label><select id="kFilter">' +
      '    <option value="">All active orders</option><option value="PENDING">Pending only</option>' +
      '    <option value="COMPLETE">Completed only</option><option value="NO_BOM">No BOM</option></select></div>' +
      '  <span class="spacer"></span>' +
      '  <button class="btn btn-sm" id="kExcel">⬇ Excel</button>' +
      '</div>' +
      '<div class="tablewrap" id="kWrap"></div></div>'
    );
    root.appendChild(card);

    function draw() {
      var f = card.querySelector('#kFilter').value;
      var rows = evals.filter(function (ev) {
        if (f && ev.result.status !== f) return false;
        return matchesSearch(ev.order, ['Order ID', 'Customer Name', 'Product Name', 'Product Category']);
      });
      var wrap = card.querySelector('#kWrap');
      if (!rows.length) { wrap.innerHTML = '<div class="empty">Nothing to show.</div>'; return; }
      wrap.innerHTML =
        '<table class="tbl"><thead><tr>' +
        '<th>Order ID</th><th>Customer</th><th>Product</th><th class="num">Qty</th><th>Delivery</th>' +
        '<th>Material Coverage</th><th>Kitting Status</th><th></th></tr></thead><tbody>' +
        rows.map(function (ev) {
          var o = ev.order, r = ev.result;
          var statusHTML =
            r.status === 'COMPLETE' ? '<span class="kit-complete">✔ Full Kitting Completed</span>' :
            r.status === 'PENDING' ? '<span class="kit-pending">✖ Full Kitting Pending</span>' :
            '<span class="muted">— No BOM defined</span>';
          var meter = r.status === 'NO_BOM' ? '—' :
            '<span class="meter' + (r.coverage === 100 ? ' full' : '') + '"><span style="width:' + r.coverage + '%"></span></span> <span class="small muted">' + r.coverage + '%</span>';
          var actions = '<button class="btn btn-sm" data-detail="' + U.esc(o['Order ID']) + '">Details</button>';
          if (r.status === 'PENDING') {
            actions += ' <button class="btn btn-sm btn-order" data-shortage="' + U.esc(o['Order ID']) + '">🛒 Order Raw Material</button>';
          }
          return '<tr><td><b>' + U.esc(o['Order ID']) + '</b></td><td>' + U.esc(o['Customer Name']) + '</td>' +
            '<td>' + U.esc(o['Product Name']) + '</td><td class="num">' + U.fmtQty(o['Quantity']) + '</td>' +
            '<td>' + U.fmtDate(o['Required Delivery Date']) + '</td>' +
            '<td>' + meter + '</td><td>' + statusHTML + '</td>' +
            '<td class="rowactions">' + actions + '</td></tr>';
        }).join('') + '</tbody></table>';

      wrap.querySelectorAll('[data-detail]').forEach(function (b) { b.onclick = function () { kittingDetailModal(b.dataset.detail); }; });
      wrap.querySelectorAll('[data-shortage]').forEach(function (b) { b.onclick = function () { shortageModal([b.dataset.shortage]); }; });
    }
    card.querySelector('#kFilter').addEventListener('change', draw);
    card.querySelector('#kExcel').onclick = function () {
      U.exportExcel('Kitting_Status.xlsx', [{
        name: 'Kitting Status',
        headers: ['Order ID', 'Customer', 'Product', 'Qty', 'Delivery Date', 'Coverage %', 'Kitting Status'],
        rows: evals.map(function (ev) {
          return [ev.order['Order ID'], ev.order['Customer Name'], ev.order['Product Name'], ev.order['Quantity'],
            ev.order['Required Delivery Date'], ev.result.coverage,
            ev.result.status === 'COMPLETE' ? 'Full Kitting Completed' : ev.result.status === 'PENDING' ? 'Full Kitting Pending' : 'No BOM'];
        })
      }]);
    };

    // bulk PR for ALL pending orders
    if (pending > 0) {
      var bulk = el('<div class="toolrow"><span class="spacer"></span><button class="btn btn-order" id="bulkPr">🛒 Order Raw Material for ALL Pending Orders (' + pending + ')</button></div>');
      card.insertBefore(bulk, card.querySelector('.tablewrap'));
      bulk.querySelector('#bulkPr').onclick = function () {
        var ids = evals.filter(function (e) { return e.result.status === 'PENDING'; }).map(function (e) { return e.order['Order ID']; });
        shortageModal(ids);
      };
    }
    draw();
    APP.onSearch(draw);

    function stat(label, value, color, hint) {
      return '<div class="card stat"><div class="label"><span class="dot" style="background:' + color + '"></span>' + label + '</div>' +
        '<div class="value">' + value + '</div><div class="hint">' + hint + '</div></div>';
    }
  }

  function kittingDetailModal(orderId) {
    var d = D();
    var o = d.orders.find(function (x) { return String(x['Order ID']) === String(orderId); });
    if (!o) return;
    var r = ENGINE.evaluateOrder(o, d.bom, ENGINE.inventoryMap(d.inventory));
    openModal('Kitting Detail — ' + orderId + ' (' + o['Product Name'] + ' × ' + o['Quantity'] + ')',
      (r.status === 'NO_BOM' ? '<div class="notice">No BOM defined for this product.</div>' :
        '<div class="tablewrap"><table class="tbl"><thead><tr>' +
        '<th>Code</th><th>Material</th><th class="num">Required</th><th class="num">Available</th><th class="num">Shortage</th><th>Unit</th><th>Status</th>' +
        '</tr></thead><tbody>' +
        r.lines.map(function (l) {
          return '<tr><td>' + U.esc(l.materialCode) + '</td><td>' + U.esc(l.materialName) + '</td>' +
            '<td class="num">' + U.fmtQty(l.requiredQty) + '</td><td class="num">' + U.fmtQty(l.availableQty) + '</td>' +
            '<td class="num">' + (l.shortageQty ? '<b style="color:var(--critical)">' + U.fmtQty(l.shortageQty) + '</b>' : '—') + '</td>' +
            '<td>' + U.esc(l.unit) + '</td>' +
            '<td>' + (l.ok ? U.pill('Available', 'good') : U.pill(l.inStockRecord ? 'Insufficient' : 'Not in inventory', 'bad')) + '</td></tr>';
        }).join('') + '</tbody></table></div>'),
      '<button class="btn" id="mCancel">Close</button>'
    );
    document.getElementById('mCancel').onclick = closeModal;
  }

  /** Shortage review + Save → creates a Purchase Requirement. orderIds: array */
  function shortageModal(orderIds) {
    var d = D();
    var evals = ENGINE.evaluateAll(d.orders, d.bom, d.inventory)
      .filter(function (ev) { return orderIds.indexOf(ev.order['Order ID']) !== -1; });
    var agg = ENGINE.aggregateShortages(evals);
    if (!agg.length) { U.toast('No shortages found — kitting may already be complete.', 'good'); return; }

    openModal('Shortage Raw Materials — ' + orderIds.join(', '),
      '<div class="small muted" style="margin-bottom:10px">Review the shortage list below, then click <b>Save as Purchase Requirement</b>. Quantities are merged across the selected orders.</div>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr>' +
      '<th>Material Code</th><th>Raw Material Name</th><th class="num">Required</th><th class="num">Available</th><th class="num">Shortage</th><th>Unit</th><th>For Products</th>' +
      '</tr></thead><tbody>' +
      agg.map(function (s) {
        return '<tr><td>' + U.esc(s.materialCode) + '</td><td>' + U.esc(s.materialName) + '</td>' +
          '<td class="num">' + U.fmtQty(s.requiredQty) + '</td><td class="num">' + U.fmtQty(s.availableQty) + '</td>' +
          '<td class="num"><b style="color:var(--critical)">' + U.fmtQty(s.shortageQty) + '</b></td>' +
          '<td>' + U.esc(s.unit) + '</td><td class="small">' + U.esc(s.products.join(', ')) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="frm mt"><div class="field span2"><label>Remarks for purchase department</label><input id="prRemarks" placeholder="e.g. Urgent — delivery committed for month end"/></div>' +
      '<div class="field"><label>Prepared by</label><input id="prBy" placeholder="Your name"/></div></div>',
      '<button class="btn" id="mCancel">Cancel</button>' +
      '<button class="btn btn-primary" id="mSavePr">💾 Save as Purchase Requirement</button>'
    );
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('mSavePr').onclick = async function () {
      var items = [];
      evals.forEach(function (ev) {
        ev.result.shortages.forEach(function (s) {
          items.push({
            'Material Code': s.materialCode, 'Material Name': s.materialName,
            'Required Qty': s.requiredQty, 'Available Qty': s.availableQty, 'Shortage Qty': s.shortageQty,
            'Unit': s.unit, 'Product Name': s.productName, 'Order ID': s.orderId
          });
        });
      });
      try {
        APP.busy(true);
        var res = await API.createPR({
          orderIds: orderIds,
          remarks: document.getElementById('prRemarks').value,
          createdBy: document.getElementById('prBy').value,
          items: items
        });
        closeModal();
        U.toast('Purchase Requirement ' + res.prNumber + ' created (' + res.itemCount + ' items)', 'good');
        await APP.reload();
        prActionsModal(res.prNumber);
      } catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
    };
  }

  function prActionsModal(prNumber) {
    openModal('Purchase Requirement ' + prNumber + ' saved ✔',
      '<p>The requirement has been saved to Google Sheets and is visible to the purchase department in the <b>Purchase Requirements</b> tab.</p>' +
      '<p class="small muted">You can download a professional PDF, print it, or share the file with your purchase team.</p>',
      '<button class="btn" id="mCancel">Close</button>' +
      '<button class="btn" id="mPrint">🖨 Print</button>' +
      '<button class="btn btn-primary" id="mPdf">⬇ Download PDF</button>'
    );
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('mPdf').onclick = function () { prPdf(prNumber); };
    document.getElementById('mPrint').onclick = function () { prPrint(prNumber); };
  }

  /* ============================================================
     PURCHASE REQUIREMENTS TAB + PDF
     ============================================================ */
  function prRecord(prNumber) {
    var d = D();
    var pr = d.purchaseOrders.find(function (p) { return String(p['PR Number']) === String(prNumber); });
    var items = d.purchaseOrderItems.filter(function (i) { return String(i['PR Number']) === String(prNumber); });
    return { pr: pr, items: items };
  }

  function prPdf(prNumber) {
    var rec = prRecord(prNumber);
    if (!rec.pr) return U.toast('PR not found', 'bad');
    var s = D().settings || {};
    var p = U.pdfDoc('PURCHASE REQUIREMENT — ' + prNumber, [
      'PR Date: ' + U.fmtDate(rec.pr['PR Date']) + '        Status: ' + rec.pr['Status'],
      'Against Orders: ' + (rec.pr['Related Order IDs'] || '—'),
      'Prepared By: ' + (rec.pr['Created By'] || '—') + (rec.pr['Remarks'] ? '        Remarks: ' + rec.pr['Remarks'] : ''),
      (s.COMPANY_ADDRESS ? String(s.COMPANY_ADDRESS) : '')
    ].filter(Boolean));
    var y = U.pdfTable(p.doc, p.startY,
      ['#', 'Material Code', 'Raw Material Name', 'Required', 'Available', 'Shortage (Order Qty)', 'Unit', 'For Product', 'Order ID'],
      rec.items.map(function (it, i) {
        return [i + 1, it['Material Code'], it['Material Name'], U.fmtQty(it['Required Qty']),
          U.fmtQty(it['Available Qty']), U.fmtQty(it['Shortage Qty']), it['Unit'], it['Product Name'], it['Order ID']];
      }));
    // signature block
    var doc = p.doc;
    var H = doc.internal.pageSize.getHeight();
    if (y > H - 120) { doc.addPage(); y = 60; }
    doc.setFontSize(9); doc.setTextColor(82, 81, 78);
    doc.text('Prepared By', 60, y + 60); doc.line(50, y + 46, 170, y + 46);
    doc.text('Approved By', 250, y + 60); doc.line(240, y + 46, 360, y + 46);
    doc.text('Purchase Dept.', 440, y + 60); doc.line(430, y + 46, 545, y + 46);
    U.pdfFooter(doc);
    doc.save(prNumber + '.pdf');
  }

  function prPrint(prNumber) {
    var rec = prRecord(prNumber);
    if (!rec.pr) return U.toast('PR not found', 'bad');
    U.printHTML('Purchase Requirement ' + prNumber,
      '<h1>' + U.esc(cfg.COMPANY_NAME) + ' — Purchase Requirement ' + U.esc(prNumber) + '</h1>' +
      '<div class="sub">Date: ' + U.fmtDate(rec.pr['PR Date']) + ' · Against orders: ' + U.esc(rec.pr['Related Order IDs'] || '—') +
      ' · Prepared by: ' + U.esc(rec.pr['Created By'] || '—') + '</div>' +
      '<table><thead><tr><th>#</th><th>Code</th><th>Material</th><th>Required</th><th>Available</th><th>Shortage</th><th>Unit</th><th>Product</th><th>Order</th></tr></thead><tbody>' +
      rec.items.map(function (it, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + U.esc(it['Material Code']) + '</td><td>' + U.esc(it['Material Name']) + '</td>' +
          '<td>' + U.fmtQty(it['Required Qty']) + '</td><td>' + U.fmtQty(it['Available Qty']) + '</td>' +
          '<td><b>' + U.fmtQty(it['Shortage Qty']) + '</b></td><td>' + U.esc(it['Unit']) + '</td>' +
          '<td>' + U.esc(it['Product Name']) + '</td><td>' + U.esc(it['Order ID']) + '</td></tr>';
      }).join('') + '</tbody></table>');
  }

  function renderPr(root) {
    var d = D();
    var card = el(
      '<div class="card"><h2>🛒 Purchase Requirements <span class="sub">Created from shortage lists in Full Kitting Status</span></h2>' +
      '<div class="tablewrap" id="prWrap"></div></div>'
    );
    root.appendChild(card);

    function draw() {
      var rows = d.purchaseOrders.filter(function (p) {
        return matchesSearch(p, ['PR Number', 'Related Order IDs', 'Status', 'Created By', 'Remarks']);
      });
      var wrap = card.querySelector('#prWrap');
      if (!rows.length) { wrap.innerHTML = '<div class="empty">No purchase requirements yet. Create one from a pending order in the Full Kitting Status tab.</div>'; return; }
      wrap.innerHTML =
        '<table class="tbl"><thead><tr>' +
        '<th data-sort>PR Number</th><th data-sort>Date</th><th data-sort>Against Orders</th><th data-sort class="num">Items</th>' +
        '<th>Status</th><th data-sort>Prepared By</th><th></th></tr></thead><tbody>' +
        rows.map(function (p) {
          return '<tr><td><b>' + U.esc(p['PR Number']) + '</b></td><td>' + U.fmtDate(p['PR Date']) + '</td>' +
            '<td class="small">' + U.esc(p['Related Order IDs'] || '') + '</td><td class="num">' + U.esc(p['Total Items']) + '</td>' +
            '<td><select class="prStatus" data-pr="' + U.esc(p['PR Number']) + '" style="padding:4px 8px;border:1px solid var(--baseline);border-radius:7px;background:var(--surface);color:var(--ink)">' +
            options(cfg.PR_STATUSES, String(p['Status'])) + '</select></td>' +
            '<td>' + U.esc(p['Created By'] || '') + '</td>' +
            '<td class="rowactions">' +
            '  <button class="btn btn-sm" data-view="' + U.esc(p['PR Number']) + '">View</button> ' +
            '  <button class="btn btn-sm" data-pdf="' + U.esc(p['PR Number']) + '">⬇ PDF</button> ' +
            '  <button class="btn btn-sm" data-print="' + U.esc(p['PR Number']) + '">🖨</button> ' +
            '  <button class="btn btn-sm btn-danger" data-del="' + U.esc(p['PR Number']) + '">🗑</button>' +
            '</td></tr>';
        }).join('') + '</tbody></table>';
      makeSortable(wrap.querySelector('table'));

      wrap.querySelectorAll('.prStatus').forEach(function (sel) {
        sel.addEventListener('change', async function () {
          try { APP.busy(true); await API.updatePRStatus(sel.dataset.pr, sel.value); U.toast(sel.dataset.pr + ' → ' + sel.value, 'good'); await APP.reload(); }
          catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
        });
      });
      wrap.querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { prViewModal(b.dataset.view); }; });
      wrap.querySelectorAll('[data-pdf]').forEach(function (b) { b.onclick = function () { prPdf(b.dataset.pdf); }; });
      wrap.querySelectorAll('[data-print]').forEach(function (b) { b.onclick = function () { prPrint(b.dataset.print); }; });
      wrap.querySelectorAll('[data-del]').forEach(function (b) {
        b.onclick = async function () {
          if (!confirm('Delete ' + b.dataset.del + ' and all its items?')) return;
          try { APP.busy(true); await API.deletePR(b.dataset.del); U.toast('Deleted', 'good'); await APP.reload(); }
          catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
        };
      });
    }
    draw();
    APP.onSearch(draw);
  }

  function prViewModal(prNumber) {
    var rec = prRecord(prNumber);
    if (!rec.pr) return;
    openModal('Purchase Requirement — ' + prNumber,
      '<div class="small muted" style="margin-bottom:10px">Date: ' + U.fmtDate(rec.pr['PR Date']) +
      ' · Status: ' + U.esc(rec.pr['Status']) + ' · Orders: ' + U.esc(rec.pr['Related Order IDs'] || '—') + '</div>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr>' +
      '<th>#</th><th>Code</th><th>Material</th><th class="num">Required</th><th class="num">Available</th><th class="num">Shortage</th><th>Unit</th><th>Product</th><th>Order</th>' +
      '</tr></thead><tbody>' +
      rec.items.map(function (it, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + U.esc(it['Material Code']) + '</td><td>' + U.esc(it['Material Name']) + '</td>' +
          '<td class="num">' + U.fmtQty(it['Required Qty']) + '</td><td class="num">' + U.fmtQty(it['Available Qty']) + '</td>' +
          '<td class="num"><b>' + U.fmtQty(it['Shortage Qty']) + '</b></td><td>' + U.esc(it['Unit']) + '</td>' +
          '<td>' + U.esc(it['Product Name']) + '</td><td>' + U.esc(it['Order ID']) + '</td></tr>';
      }).join('') + '</tbody></table></div>',
      '<button class="btn" id="mCancel">Close</button>' +
      '<button class="btn" id="mPrint">🖨 Print</button>' +
      '<button class="btn btn-primary" id="mPdf">⬇ Download PDF</button>'
    );
    document.getElementById('mCancel').onclick = closeModal;
    document.getElementById('mPdf').onclick = function () { prPdf(prNumber); };
    document.getElementById('mPrint').onclick = function () { prPrint(prNumber); };
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function renderSettings(root) {
    var s = D().settings || {};
    var card = el(
      '<div class="card"><h2>⚙️ Settings <span class="sub">Stored in the Settings tab of the database Google Sheet</span></h2>' +
      '<h2 class="mt">IMS — Live Inventory Connection</h2>' +
      '<p class="small muted setup-hint">Leave the Spreadsheet ID blank to use the <code>Inventory</code> tab of this system\'s own database sheet. To connect your real IMS, paste its Google Sheet ID (the long code in its URL) and make sure the account that deployed the Apps Script can open that sheet.</p>' +
      '<div class="frm">' +
      '  <div class="field span2"><label>IMS Spreadsheet ID</label><input id="sIms" value="' + U.esc(s.IMS_SPREADSHEET_ID || '') + '" placeholder="e.g. 1AbC…xyz (blank = built-in Inventory tab)"/></div>' +
      '  <div class="field"><label>IMS Sheet (tab) Name</label><input id="sImsSheet" value="' + U.esc(s.IMS_SHEET_NAME || 'Inventory') + '"/></div>' +
      '  <div class="field"><label>Material Code column header</label><input id="sColCode" value="' + U.esc(s.IMS_COL_CODE || 'Material Code') + '"/></div>' +
      '  <div class="field"><label>Material Name column header</label><input id="sColName" value="' + U.esc(s.IMS_COL_NAME || 'Material Name') + '"/></div>' +
      '  <div class="field"><label>Available Qty column header</label><input id="sColQty" value="' + U.esc(s.IMS_COL_QTY || 'Available Qty') + '"/></div>' +
      '  <div class="field"><label>Unit column header</label><input id="sColUnit" value="' + U.esc(s.IMS_COL_UNIT || 'Unit') + '"/></div>' +
      '</div>' +
      '<h2 class="mt">Company (for PDF documents)</h2>' +
      '<div class="frm">' +
      '  <div class="field"><label>Company Name</label><input id="sCompany" value="' + U.esc(s.COMPANY_NAME || cfg.COMPANY_NAME) + '"/></div>' +
      '  <div class="field span2"><label>Company Address</label><input id="sAddress" value="' + U.esc(s.COMPANY_ADDRESS || '') + '"/></div>' +
      '  <div class="field"><label>Order ID Prefix</label><input id="sOrdPrefix" value="' + U.esc(s.ORDER_ID_PREFIX || 'ORD') + '"/></div>' +
      '  <div class="field"><label>PR Prefix</label><input id="sPrPrefix" value="' + U.esc(s.PR_PREFIX || 'PR') + '"/></div>' +
      '</div>' +
      '<div class="toolrow mt"><span class="spacer"></span><button class="btn btn-primary" id="saveSettings">Save Settings</button></div>' +
      '</div>'
    );
    root.appendChild(card);

    card.querySelector('#saveSettings').onclick = async function () {
      try {
        APP.busy(true);
        await API.saveSettings({
          IMS_SPREADSHEET_ID: card.querySelector('#sIms').value.trim(),
          IMS_SHEET_NAME: card.querySelector('#sImsSheet').value.trim(),
          IMS_COL_CODE: card.querySelector('#sColCode').value.trim(),
          IMS_COL_NAME: card.querySelector('#sColName').value.trim(),
          IMS_COL_QTY: card.querySelector('#sColQty').value.trim(),
          IMS_COL_UNIT: card.querySelector('#sColUnit').value.trim(),
          COMPANY_NAME: card.querySelector('#sCompany').value.trim(),
          COMPANY_ADDRESS: card.querySelector('#sAddress').value.trim(),
          ORDER_ID_PREFIX: card.querySelector('#sOrdPrefix').value.trim() || 'ORD',
          PR_PREFIX: card.querySelector('#sPrPrefix').value.trim() || 'PR'
        });
        U.toast('Settings saved — inventory source updated', 'good');
        await APP.reload();
      } catch (err) { U.toast(err.message, 'bad'); } finally { APP.busy(false); }
    };
  }

  return {
    renderOrders: renderOrders,
    renderBom: renderBom,
    renderFg: renderFg,
    renderInventory: renderInventory,
    renderKitting: renderKitting,
    renderPr: renderPr,
    renderSettings: renderSettings,
    openModal: openModal,
    closeModal: closeModal,
    prPdf: prPdf,
    prPrint: prPrint
  };
})();
