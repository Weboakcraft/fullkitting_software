/* ============================================================
   API — talks to the Google Apps Script backend
   Writes use POST with a text/plain body (avoids CORS preflight).
   ============================================================ */
window.API = (function () {
  var cfg = window.KMS_CONFIG;

  function assertConfigured() {
    if (!cfg.API_URL || cfg.API_URL.indexOf('https://') !== 0) {
      throw new Error('API_URL is not set. Open js/config.js and paste your Apps Script Web App URL.');
    }
  }

  async function get(action, params) {
    assertConfigured();
    var url = cfg.API_URL + '?action=' + encodeURIComponent(action);
    if (params) {
      Object.keys(params).forEach(function (k) {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      });
    }
    var res = await fetch(url, { method: 'GET' });
    return unwrap(await res.json());
  }

  async function post(action, payload) {
    assertConfigured();
    var res = await fetch(cfg.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: action, payload: payload || {} })
    });
    return unwrap(await res.json());
  }

  function unwrap(json) {
    if (!json || json.ok !== true) {
      throw new Error((json && json.error) || 'Unknown server error');
    }
    return json.data;
  }

  return {
    ping: function () { return get('ping'); },
    bootstrap: function () { return get('bootstrap'); },
    // orders
    createOrder: function (o) { return post('createOrder', o); },
    updateOrder: function (o) { return post('updateOrder', o); },
    deleteOrder: function (id) { return post('deleteOrder', { orderId: id }); },
    // BOM
    saveBomItems: function (items) { return post('saveBomItems', { items: items }); },
    updateBomItem: function (item) { return post('updateBomItem', item); },
    deleteBomItem: function (id) { return post('deleteBomItem', { bomId: id }); },
    // inventory
    getInventory: function () { return get('getInventory'); },
    // purchase requirements
    createPR: function (p) { return post('createPR', p); },
    updatePRStatus: function (prNumber, status) { return post('updatePRStatus', { prNumber: prNumber, status: status }); },
    deletePR: function (prNumber) { return post('deletePR', { prNumber: prNumber }); },
    // settings
    saveSettings: function (settings) { return post('saveSettings', { settings: settings }); }
  };
})();
