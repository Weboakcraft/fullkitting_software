/* ============================================================
   ENGINE — the kitting brain (pure functions, no DOM, no I/O)
   - FG requirement calculation   (order × BOM)
   - Full-kitting status          (requirement vs live stock)
   - Shortage lists               (for Purchase Requirements)
   ============================================================ */
window.ENGINE = (function () {

  function n(v) { var x = Number(v); return isNaN(x) ? 0 : x; }

  /** Map of Material Code -> inventory row */
  function inventoryMap(inventory) {
    var map = {};
    (inventory || []).forEach(function (r) {
      map[String(r['Material Code']).trim().toUpperCase()] = r;
    });
    return map;
  }

  /** BOM lines for one product (matched by Product Name, case-insensitive). */
  function bomForProduct(bom, productName) {
    var key = String(productName || '').trim().toLowerCase();
    return (bom || []).filter(function (b) {
      return String(b['Product Name'] || '').trim().toLowerCase() === key;
    });
  }

  /**
   * FG requirement for one order.
   * Returns [{materialCode, materialName, requiredQty, unit, productName, orderId}]
   */
  function orderRequirements(order, bom) {
    var qty = n(order['Quantity']);
    return bomForProduct(bom, order['Product Name']).map(function (b) {
      return {
        orderId: order['Order ID'],
        productName: order['Product Name'],
        materialCode: String(b['Raw Material Code'] || '').trim(),
        materialName: b['Raw Material Name'] || '',
        perUnit: n(b['Qty Per Unit']),
        requiredQty: n(b['Qty Per Unit']) * qty,
        unit: b['Unit'] || ''
      };
    });
  }

  /** Orders that count for kitting (not delivered / cancelled). */
  function activeOrders(orders) {
    return (orders || []).filter(function (o) {
      var s = String(o['Order Status'] || '');
      return s !== 'Delivered' && s !== 'Cancelled';
    });
  }

  /**
   * Kitting evaluation of one order against live stock.
   * Returns {
   *   status: 'COMPLETE' | 'PENDING' | 'NO_BOM',
   *   lines: [{...requirement, availableQty, shortageQty, ok}],
   *   shortages: [...lines where shortage > 0],
   *   coverage: 0..100  (percent of BOM lines fully available)
   * }
   */
  function evaluateOrder(order, bom, invMap) {
    var reqs = orderRequirements(order, bom);
    if (!reqs.length) return { status: 'NO_BOM', lines: [], shortages: [], coverage: 0 };

    var okCount = 0;
    var lines = reqs.map(function (r) {
      var inv = invMap[r.materialCode.toUpperCase()];
      var avail = inv ? n(inv['Available Qty']) : 0;
      var shortage = Math.max(0, r.requiredQty - avail);
      var ok = shortage <= 0;
      if (ok) okCount++;
      return {
        orderId: r.orderId, productName: r.productName,
        materialCode: r.materialCode, materialName: r.materialName || (inv ? inv['Material Name'] : ''),
        perUnit: r.perUnit, requiredQty: r.requiredQty,
        availableQty: avail, shortageQty: shortage,
        unit: r.unit || (inv ? inv['Unit'] : ''), ok: ok, inStockRecord: !!inv
      };
    });

    var shortages = lines.filter(function (l) { return !l.ok; });
    return {
      status: shortages.length ? 'PENDING' : 'COMPLETE',
      lines: lines,
      shortages: shortages,
      coverage: Math.round((okCount / lines.length) * 100)
    };
  }

  /** Evaluate every active order. Returns [{order, result}] */
  function evaluateAll(orders, bom, inventory) {
    var invMap = inventoryMap(inventory);
    return activeOrders(orders).map(function (o) {
      return { order: o, result: evaluateOrder(o, bom, invMap) };
    });
  }

  /**
   * Aggregate shortages across the given evaluations, merged by material code.
   * Returns [{materialCode, materialName, unit, requiredQty, availableQty, shortageQty, orders:[...], products:[...]}]
   */
  function aggregateShortages(evaluations) {
    var agg = {};
    evaluations.forEach(function (ev) {
      ev.result.shortages.forEach(function (s) {
        var key = s.materialCode.toUpperCase();
        if (!agg[key]) {
          agg[key] = {
            materialCode: s.materialCode, materialName: s.materialName, unit: s.unit,
            requiredQty: 0, availableQty: s.availableQty, shortageQty: 0,
            orders: [], products: []
          };
        }
        agg[key].requiredQty += s.requiredQty;
        agg[key].shortageQty += s.shortageQty;
        if (agg[key].orders.indexOf(s.orderId) === -1) agg[key].orders.push(s.orderId);
        if (agg[key].products.indexOf(s.productName) === -1) agg[key].products.push(s.productName);
      });
    });
    return Object.keys(agg).map(function (k) { return agg[k]; })
      .sort(function (a, b) { return b.shortageQty - a.shortageQty; });
  }

  /**
   * Total raw-material consumption implied by orders (for reports),
   * merged by material, optionally filtered by a predicate on the order.
   */
  function consumption(orders, bom, filterFn) {
    var agg = {};
    (orders || []).forEach(function (o) {
      if (filterFn && !filterFn(o)) return;
      orderRequirements(o, bom).forEach(function (r) {
        var key = r.materialCode.toUpperCase();
        if (!agg[key]) agg[key] = { materialCode: r.materialCode, materialName: r.materialName, unit: r.unit, qty: 0 };
        agg[key].qty += r.requiredQty;
      });
    });
    return Object.keys(agg).map(function (k) { return agg[k]; })
      .sort(function (a, b) { return b.qty - a.qty; });
  }

  /** Distinct product list from BOM: [{category, product, lineCount}] */
  function bomProducts(bom) {
    var map = {};
    (bom || []).forEach(function (b) {
      var key = String(b['Product Name'] || '').trim().toLowerCase();
      if (!map[key]) map[key] = { category: b['Product Category'] || '', product: b['Product Name'] || '', lineCount: 0 };
      map[key].lineCount++;
    });
    return Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return a.product.localeCompare(b.product); });
  }

  return {
    inventoryMap: inventoryMap,
    bomForProduct: bomForProduct,
    orderRequirements: orderRequirements,
    activeOrders: activeOrders,
    evaluateOrder: evaluateOrder,
    evaluateAll: evaluateAll,
    aggregateShortages: aggregateShortages,
    consumption: consumption,
    bomProducts: bomProducts
  };
})();
