/* ============================================================
   CONFIG — the ONLY file you must edit after deployment
   ============================================================ */
window.KMS_CONFIG = {
  // 1. Deploy backend/Code.gs as a Web App (Anyone can access)
  // 2. Paste the Web App URL here (ends with /exec)
  API_URL: 'https://script.google.com/macros/s/AKfycbyUlW3TGaFK4oTjmceZ1QTcqdlNKW4R5d0XGvYNbtUiFPM-XloAvu8srbwupl4y2XK2Bg/exec',

  // Background auto-sync interval (milliseconds).
  // NOTE: your own saves/edits/deletes sync to Google Sheets INSTANTLY —
  // this timer only picks up changes made by OTHER users or directly in the sheet.
  REFRESH_MS: 20000,

  // Company details used on screen + PDF headers
  COMPANY_NAME: 'Oakcraft Furniture',
  COMPANY_TAGLINE: 'Kitting Management System',

  // Dropdown option lists (edit freely)
  CATEGORIES: ['Chair', 'Sofa', 'Wardrobe (Almirah)', 'Recliner Chair', 'Recliner Sofa', 'Bed', 'Table', 'Other'],
  UNITS: ['PCS', 'MTR', 'KG', 'SET', 'PAIR', 'ROLL', 'LTR', 'SQFT', 'BOX'],
  ORDER_STATUSES: ['Open', 'In Production', 'Ready', 'Dispatched', 'Delivered', 'Cancelled'],
  PRIORITIES: ['Low', 'Normal', 'High', 'Urgent'],
  PR_STATUSES: ['Pending', 'Approved', 'Ordered', 'Received', 'Cancelled']
};
