/**
 * sheets.js
 * Google OAuth 2.0 (token client) + Sheets API v4 via direct fetch.
 * More reliable than gapi.client for simple use cases.
 */

const Sheets = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  let _token = null;
  let _gisLoaded = false;

  function loadGIS() {
    return new Promise((resolve) => {
      if (_gisLoaded) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => { _gisLoaded = true; resolve(); };
      document.head.appendChild(s);
    });
  }

  function requestToken(clientId) {
    return new Promise((resolve, reject) => {
      if (_token) { resolve(_token); return; }
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          _token = resp.access_token;
          resolve(_token);
        },
      });
      client.requestAccessToken();
    });
  }

  async function sheetsGet(token, sheetId, range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Sheets GET ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    return res.json();
  }

  async function sheetsBatchUpdate(token, sheetId, valueRanges) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: valueRanges,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Sheets POST ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    return res.json();
  }

  async function findDateRow(token, sheetId, sheetName, dateStr, headerRow) {
    const dataStart = headerRow + 1;
    const range = `${sheetName}!A${dataStart}:A500`;
    const data = await sheetsGet(token, sheetId, range);
    const rows = data.values || [];
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').trim() === dateStr.trim()) {
        return dataStart + i;
      }
    }
    return null;
  }

  async function syncDay(dateStr, data) {
    const settings = Storage.getSettings();
    if (!settings.clientId) throw new Error('No Google OAuth Client ID in Settings.');
    if (!settings.sheetId)  throw new Error('No Spreadsheet ID in Settings.');

    await loadGIS();
    const token = await requestToken(settings.clientId);

    const sheetName = settings.sheetName || 'Daily Tracker';
    const headerRow = parseInt(settings.headerRow) || 2;
    const colMap = settings.colMap || {};

    const rowNum = await findDateRow(token, settings.sheetId, sheetName, dateStr, headerRow);
    if (!rowNum) throw new Error(`Date "${dateStr}" not found in sheet. Make sure the date format matches (e.g. 14-Jun).`);

    const valueRanges = [];
    for (const [field, col] of Object.entries(colMap)) {
      if (!col || data[field] === undefined || data[field] === '') continue;
      const cellRef = `${sheetName}!${col.toUpperCase()}${rowNum}`;
      valueRanges.push({ range: cellRef, values: [[data[field]]] });
    }

    if (!valueRanges.length) return { updated: 0 };
    const result = await sheetsBatchUpdate(token, settings.sheetId, valueRanges);
    return { updated: result.totalUpdatedCells || valueRanges.length };
  }

  return { syncDay };
})();