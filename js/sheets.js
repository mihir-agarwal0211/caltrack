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

  function fetchWithTimeout(url, options = {}, ms = 20000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...options, signal: controller.signal })
      .then(r => { clearTimeout(id); return r; })
      .catch(e => { clearTimeout(id); throw e.name === 'AbortError' ? new Error('Request timed out. Check your connection and try again.') : e; });
  }

  async function sheetsGet(token, sheetId, range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
    const res = await fetchWithTimeout(url, {
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
    const res = await fetchWithTimeout(url, {
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

  const ADDABLE = new Set(['calories', 'protein', 'fats', 'carbs', 'fibre']);

  async function syncDay(dateStr, data, mode = 'replace') {
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

    let existingRow = [];
    if (mode === 'add') {
      const rowData = await sheetsGet(token, settings.sheetId, `${sheetName}!A${rowNum}:Z${rowNum}`);
      existingRow = (rowData.values || [[]])[0] || [];
    }

    const valueRanges = [];
    for (const [field, col] of Object.entries(colMap)) {
      if (!col || data[field] === undefined || data[field] === '') continue;
      let value = data[field];
      if (mode === 'add' && ADDABLE.has(field)) {
        const colIdx = col.toUpperCase().charCodeAt(0) - 65;
        const existing = parseFloat(existingRow[colIdx]) || 0;
        value = Math.round((existing + parseFloat(value)) * 10) / 10;
      }
      valueRanges.push({ range: `${sheetName}!${col.toUpperCase()}${rowNum}`, values: [[value]] });
    }

    if (!valueRanges.length) return { updated: 0 };
    const result = await sheetsBatchUpdate(token, settings.sheetId, valueRanges);
    return { updated: result.totalUpdatedCells || valueRanges.length };
  }

  async function sheetsClear(token, sheetId, range) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:clear`;
    const res = await fetchWithTimeout(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Sheets clear ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    return res.json();
  }

  async function sheetsUpdate(token, sheetId, range, values) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
    const res = await fetchWithTimeout(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, values }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Sheets update ${res.status}: ${err?.error?.message || res.statusText}`);
    }
    return res.json();
  }

  async function pushRecipes(recipes) {
    const settings = Storage.getSettings();
    if (!settings.clientId) throw new Error('No Google OAuth Client ID in Settings.');
    if (!settings.sheetId)  throw new Error('No Spreadsheet ID in Settings.');

    await loadGIS();
    const token = await requestToken(settings.clientId);

    const keys = Object.keys(recipes);
    await sheetsClear(token, settings.sheetId, 'Recipes!A2:G1000');
    const values = [
      ['Name', 'Per (g)', 'Calories', 'Protein', 'Fat', 'Carbs', 'Fibre'],
      ...keys.map(k => {
        const r = recipes[k];
        return [k, r.per, r.cal_per, r.pro_per, r.fat_per, r.carb_per, r.fibre_per || 0];
      }),
    ];
    await sheetsUpdate(token, settings.sheetId, `Recipes!A1:G${values.length}`, values);
    return keys.length;
  }

  async function pullRecipes() {
    const settings = Storage.getSettings();
    if (!settings.clientId) throw new Error('No Google OAuth Client ID in Settings.');
    if (!settings.sheetId)  throw new Error('No Spreadsheet ID in Settings.');

    await loadGIS();
    const token = await requestToken(settings.clientId);

    const data = await sheetsGet(token, settings.sheetId, 'Recipes!A2:G500');
    const recipes = {};
    for (const row of (data.values || [])) {
      const [name, per, cal, pro, fat, carb, fibre] = row;
      if (!name || !cal) continue;
      recipes[name] = {
        per:      parseFloat(per)   || 100,
        cal_per:  parseFloat(cal)   || 0,
        pro_per:  parseFloat(pro)   || 0,
        fat_per:  parseFloat(fat)   || 0,
        carb_per: parseFloat(carb)  || 0,
        fibre_per: parseFloat(fibre) || 0,
      };
    }
    return recipes;
  }

  async function checkStatus(dateStr) {
    const settings = Storage.getSettings();
    if (!settings.clientId) throw new Error('No Google OAuth Client ID in Settings.');
    if (!settings.sheetId)  throw new Error('No Spreadsheet ID in Settings.');

    await loadGIS();
    const token = await requestToken(settings.clientId);

    const sheetName = settings.sheetName || 'Daily Tracker';
    const headerRow = parseInt(settings.headerRow) || 2;
    const colMap = settings.colMap || {};

    const rowNum = await findDateRow(token, settings.sheetId, sheetName, dateStr, headerRow);
    if (!rowNum) return null;

    const rowData = await sheetsGet(token, settings.sheetId, `${sheetName}!A${rowNum}:Z${rowNum}`);
    const row = (rowData.values || [[]])[0] || [];

    const result = {};
    for (const [field, col] of Object.entries(colMap)) {
      if (!col) continue;
      const idx = col.toUpperCase().charCodeAt(0) - 65;
      if (row[idx] !== undefined && row[idx] !== '') result[field] = row[idx];
    }
    return result;
  }

  async function pushFoodLog(dateStr, foods) {
    const settings = Storage.getSettings();
    if (!settings.clientId) throw new Error('No Google OAuth Client ID in Settings.');
    if (!settings.sheetId)  throw new Error('No Spreadsheet ID in Settings.');

    await loadGIS();
    const token = await requestToken(settings.clientId);

    const data = await sheetsGet(token, settings.sheetId, 'Food Log!A2:G5000').catch(() => ({ values: [] }));
    const existing = (data.values || []).filter(r => (r[0] || '').trim() !== dateStr.trim());
    const newRows = foods.map(f => [dateStr, f.name, f.cal, f.pro, f.fat, f.carb, f.fibre || 0]);
    const allRows = [...existing, ...newRows];
    const header = [['Date', 'Name', 'Cal', 'Pro', 'Fat', 'Carb', 'Fibre']];

    await sheetsClear(token, settings.sheetId, 'Food Log!A1:G5000');
    await sheetsUpdate(token, settings.sheetId, `Food Log!A1:G${1 + allRows.length}`, [...header, ...allRows]);
    return newRows.length;
  }

  async function pullFoodLog(dateStr) {
    const settings = Storage.getSettings();
    if (!settings.clientId) throw new Error('No Google OAuth Client ID in Settings.');
    if (!settings.sheetId)  throw new Error('No Spreadsheet ID in Settings.');

    await loadGIS();
    const token = await requestToken(settings.clientId);

    const data = await sheetsGet(token, settings.sheetId, 'Food Log!A2:G5000');
    return (data.values || [])
      .filter(r => (r[0] || '').trim() === dateStr.trim())
      .map(([, name, cal, pro, fat, carb, fibre]) => ({
        name:  name || '',
        cal:   parseFloat(cal)   || 0,
        pro:   parseFloat(pro)   || 0,
        fat:   parseFloat(fat)   || 0,
        carb:  parseFloat(carb)  || 0,
        fibre: parseFloat(fibre) || 0,
      }));
  }

  return { syncDay, pushRecipes, pullRecipes, checkStatus, pushFoodLog, pullFoodLog };
})();