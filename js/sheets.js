/**
 * sheets.js
 * Handles Google OAuth 2.0 (implicit flow) and Sheets API v4 writes.
 *
 * Setup:
 *  1. Go to console.cloud.google.com
 *  2. Create a project → Enable "Google Sheets API"
 *  3. Credentials → Create OAuth 2.0 Client ID (Web application)
 *  4. Add your site URL to "Authorized JavaScript origins"
 *  5. Paste the Client ID into CalTrack Settings
 */

const Sheets = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const DISCOVERY = 'https://sheets.googleapis.com/$discovery/rest?version=v4';

  let _token = null;
  let _gisClient = null;
  let _gapiReady = false;
  let _pendingResolve = null;

  // ── Load Google API scripts lazily ──────────────────
  function loadScripts() {
    return new Promise((resolve, reject) => {
      if (_gapiReady) { resolve(); return; }

      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.onload = () => {
        gapi.load('client', async () => {
          await gapi.client.init({ discoveryDocs: [DISCOVERY] });
          _gapiReady = true;
          resolve();
        });
      };
      gapiScript.onerror = reject;
      document.head.appendChild(gapiScript);

      const gisScript = document.createElement('script');
      gisScript.src = 'https://accounts.google.com/gsi/client';
      document.head.appendChild(gisScript);
    });
  }

  // ── Request OAuth token ──────────────────────────────
  function requestToken(clientId) {
    return new Promise((resolve, reject) => {
      if (_token) { resolve(_token); return; }

      _pendingResolve = resolve;

      _gisClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          _token = resp.access_token;
          gapi.client.setToken({ access_token: _token });
          if (_pendingResolve) { _pendingResolve(_token); _pendingResolve = null; }
        },
      });
      _gisClient.requestAccessToken();
    });
  }

  // ── Column letter → zero-based index ────────────────
  function colIndex(letter) {
    if (!letter) return -1;
    letter = letter.toUpperCase().trim();
    let idx = 0;
    for (let i = 0; i < letter.length; i++) {
      idx = idx * 26 + (letter.charCodeAt(i) - 64);
    }
    return idx - 1; // zero-based
  }

  // ── Find row number for a given date string ──────────
  async function findDateRow(sheetId, sheetName, dateStr, headerRow) {
    const dataStart = headerRow + 1;
    const range = `${sheetName}!A${dataStart}:A500`;
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });
    const rows = resp.result.values || [];
    for (let i = 0; i < rows.length; i++) {
      if ((rows[i][0] || '').trim() === dateStr) {
        return dataStart + i; // 1-based sheet row
      }
    }
    return null;
  }

  // ── Write a single row's cells ───────────────────────
  async function writeRow(sheetId, sheetName, rowNum, colMap, data) {
    // Build a list of individual cell updates
    const valueRanges = [];

    for (const [field, col] of Object.entries(colMap)) {
      if (!col || data[field] === undefined || data[field] === '') continue;
      const idx = colIndex(col);
      if (idx < 0) continue;
      const cellRef = `${sheetName}!${col}${rowNum}`;
      valueRanges.push({
        range: cellRef,
        values: [[data[field]]],
      });
    }

    if (!valueRanges.length) return { updated: 0 };

    const resp = await gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      resource: {
        valueInputOption: 'USER_ENTERED',
        data: valueRanges,
      },
    });

    return { updated: resp.result.totalUpdatedCells || valueRanges.length };
  }

  // ── Main sync function ───────────────────────────────
  async function syncDay(dateStr, data) {
    const settings = Storage.getSettings();

    if (!settings.clientId) throw new Error('No Google OAuth Client ID configured. Add it in Settings.');
    if (!settings.sheetId) throw new Error('No Spreadsheet ID configured. Add it in Settings.');

    await loadScripts();
    await requestToken(settings.clientId);

    const rowNum = await findDateRow(
      settings.sheetId,
      settings.sheetName || 'Daily Tracker',
      dateStr,
      settings.headerRow || 2
    );

    if (!rowNum) throw new Error(`Date "${dateStr}" not found in sheet. Check the date format matches your sheet (e.g. 14-Jun).`);

    const colMap = (settings.colMap) || {};
    const result = await writeRow(settings.sheetId, settings.sheetName || 'Daily Tracker', rowNum, colMap, data);
    return result;
  }

  return { syncDay };
})();
