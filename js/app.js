/**
 * app.js
 * Main application logic for CalTrack.
 * Depends on: storage.js, usda.js, sheets.js
 */

// ── State ────────────────────────────────────────────
let currentDate = todayISO();
let foods = [];
let toggles = { weights: false, cardio: false };
let selectedUSDA = null;
let searchDB = 'usda';
let selectedServingGrams = null;
let selectedServingLabel = null;

// ── Helpers ──────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function formatDateForSheet(isoDate) {
  // Converts "2026-06-14" → "14-Jun" to match your sheet format
  const d = new Date(isoDate + 'T12:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()}-${months[d.getMonth()]}`;
}

function r(n, dec = 1) {
  return Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);
}

function setStatus(id, msg, type = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = `status-msg ${type}`;
}

// ── Tab navigation ───────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'recipes') renderRecipeList();
    if (btn.dataset.tab === 'sync') renderSyncSummary();
    if (btn.dataset.tab === 'settings') loadSettingsUI();
  });
});

// ── Add-mode sub-tabs ────────────────────────────────
document.querySelectorAll('.add-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.add-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.add-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`add-${btn.dataset.add}`).classList.add('active');
  });
});

// ── Date ────────────────────────────────────────────
const dateInput = document.getElementById('log-date');
dateInput.value = currentDate;
dateInput.addEventListener('change', () => {
  currentDate = dateInput.value;
  foods = Storage.getDayLog(currentDate);
  renderFoodLog();
  updateMacros();
});

// ── Food log ─────────────────────────────────────────
function renderFoodLog() {
  const el = document.getElementById('food-log');
  if (!foods.length) {
    el.innerHTML = '<p class="empty-state">Nothing logged yet. Add food below.</p>';
    return;
  }
  el.innerHTML = foods.map((f, i) => `
    <div class="food-entry">
      <div>
        <div class="food-entry-name">${f.name}</div>
        <div class="food-entry-macros">${f.cal} kcal · ${f.pro}g P · ${f.fat}g F · ${f.carb}g C</div>
      </div>
      <button class="food-entry-remove" onclick="removeFood(${i})" aria-label="Remove ${f.name}">×</button>
    </div>
  `).join('');
}

function removeFood(i) {
  foods.splice(i, 1);
  Storage.setDayLog(currentDate, foods);
  renderFoodLog();
  updateMacros();
}

function addFood(item) {
  foods.push(item);
  Storage.setDayLog(currentDate, foods);
  renderFoodLog();
  updateMacros();
}

// ── Macro summary ─────────────────────────────────────
function updateMacros() {
  const settings = Storage.getSettings();
  const calTarget = settings.calTarget || 1500;
  const proTarget = settings.proTarget || 130;

  const cal  = Math.round(foods.reduce((s, f) => s + (f.cal  || 0), 0));
  const pro  = r(foods.reduce((s, f) => s + (f.pro  || 0), 0));
  const fat  = r(foods.reduce((s, f) => s + (f.fat  || 0), 0));
  const carb = r(foods.reduce((s, f) => s + (f.carb || 0), 0));

  document.getElementById('sum-cal').textContent  = cal;
  document.getElementById('sum-pro').textContent  = pro;
  document.getElementById('sum-fat').textContent  = fat;
  document.getElementById('sum-carb').textContent = carb;

  const calDiff = calTarget - cal;
  const proDiff = proTarget - pro;

  const calDiffEl = document.getElementById('diff-cal');
  const proDiffEl = document.getElementById('diff-pro');

  if (foods.length) {
    calDiffEl.textContent = calDiff >= 0 ? `${calDiff} left` : `${Math.abs(calDiff)} over`;
    calDiffEl.className = 'macro-diff ' + (calDiff >= 0 ? 'under' : 'over');
    proDiffEl.textContent = proDiff >= 0 ? `${proDiff}g left` : `${Math.abs(proDiff)}g over`;
    proDiffEl.className = 'macro-diff ' + (proDiff >= 0 ? 'under' : 'over');
  } else {
    calDiffEl.textContent = '';
    proDiffEl.textContent = '';
  }
}

// ── USDA Search ───────────────────────────────────────
const usdaInput = document.getElementById('usda-query');
const searchResultsEl = document.getElementById('search-results');

document.getElementById('usda-search-btn').addEventListener('click', doUSDASearch);
usdaInput.addEventListener('keydown', e => { if (e.key === 'Enter') doUSDASearch(); });

document.querySelectorAll('.db-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.db-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    searchDB = btn.dataset.db;
    searchResultsEl.style.display = 'none';
    document.getElementById('selected-food').style.display = 'none';
    setStatus('usda-status', '', '');
    selectedUSDA = null;
  });
});

let searchDebounce;
usdaInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  if (usdaInput.value.trim().length > 2 && searchDB === 'usda') {
    searchDebounce = setTimeout(() => doUSDASearch({ allowOFF: false }), 600);
  } else {
    searchResultsEl.style.display = 'none';
  }
});

async function doUSDASearch({ allowOFF = true } = {}) {
  const q = usdaInput.value.trim();
  if (!q) return;
  searchResultsEl.style.display = 'none';
  document.getElementById('selected-food').style.display = 'none';
  selectedUSDA = null;

  try {
    let results = [];
    let fromOFF = false;

    if (searchDB === 'off') {
      setStatus('usda-status', 'Searching Open Food Facts…', 'info');
      results = await USDA.searchOFF(q);
      fromOFF = true;
    } else {
      setStatus('usda-status', 'Searching USDA database…', 'info');
      results = await USDA.search(q);
      if (!results.length && allowOFF) {
        setStatus('usda-status', 'No USDA results — trying Open Food Facts…', 'info');
        results = await USDA.searchOFF(q);
        fromOFF = true;
      }
    }

    if (!results.length) {
      setStatus('usda-status', searchDB === 'off'
        ? 'No Open Food Facts results. Try USDA or use manual entry.'
        : allowOFF
          ? 'No results found. Try switching to Open Food Facts above.'
          : 'No USDA results. Press Search to also check Open Food Facts.', 'error');
      return;
    }

    setStatus('usda-status', fromOFF && searchDB !== 'off' ? 'Showing results from Open Food Facts (no USDA match).' : '', fromOFF && searchDB !== 'off' ? 'info' : '');

    searchResultsEl.innerHTML = results.map((f, i) => `
      <div class="search-result-item" onclick="selectUSDA(${i})" data-idx="${i}">
        <div class="result-name">${f.name}</div>
        <div class="result-macros">${f.cal} kcal · ${f.pro}g P · ${f.fat}g F · ${f.carb}g C per 100g</div>
      </div>
    `).join('');
    searchResultsEl._results = results;
    searchResultsEl.style.display = 'block';
  } catch (e) {
    setStatus('usda-status', 'Search failed. Check your connection or use manual entry.', 'error');
  }
}

async function selectUSDA(i) {
  const results = searchResultsEl._results;
  if (!results) return;
  selectedUSDA = results[i];
  document.getElementById('sel-name').textContent = selectedUSDA.name;
  document.getElementById('sel-meta').textContent =
    `${selectedUSDA.cal} kcal · ${selectedUSDA.pro}g P · ${selectedUSDA.fat}g F · ${selectedUSDA.carb}g C per 100g`;
  selectedServingGrams = null;
  selectedServingLabel = null;
  document.getElementById('sel-qty').value = 100;
  document.getElementById('sel-qty-unit').textContent = 'g';
  document.getElementById('selected-food').style.display = 'block';
  searchResultsEl.style.display = 'none';

  const servingRow = document.getElementById('serving-row');
  const servingSel = document.getElementById('sel-serving');
  servingRow.style.display = 'none';
  servingSel.innerHTML = '';

  if (selectedUSDA.fdcId) {
    try {
      const measures = await USDA.getFoodMeasures(selectedUSDA.fdcId);
      if (measures.length) {
        servingSel.innerHTML =
          '<option value="">Custom (enter grams below)</option>' +
          measures.map(m => `<option value="${m.grams}">${m.label} (${Math.round(m.grams)}g)</option>`).join('');
        servingRow.style.display = 'block';
      }
    } catch (_) {
      // silently fall back to gram input only
    }
  }
}

document.getElementById('sel-serving').addEventListener('change', function () {
  if (this.value) {
    selectedServingGrams = parseFloat(this.value);
    selectedServingLabel = this.options[this.selectedIndex].text.replace(/\s*\(\d+\.?\d*g\)$/, '');
    document.getElementById('sel-qty').value = 1;
    document.getElementById('sel-qty-unit').textContent = selectedServingLabel;
  } else {
    selectedServingGrams = null;
    selectedServingLabel = null;
    document.getElementById('sel-qty').value = 100;
    document.getElementById('sel-qty-unit').textContent = 'g';
  }
});

document.getElementById('add-usda-btn').addEventListener('click', () => {
  if (!selectedUSDA) return;
  const count = parseFloat(document.getElementById('sel-qty').value) || 1;

  let grams, displayUnit;
  if (selectedServingGrams) {
    grams = count * selectedServingGrams;
    displayUnit = count === 1 ? selectedServingLabel : `${count} × ${selectedServingLabel}`;
  } else {
    grams = count;
    displayUnit = `${count}g`;
  }

  const ratio = grams / 100;
  addFood({
    name:  `${selectedUSDA.name} (${displayUnit})`,
    cal:   Math.round(selectedUSDA.cal  * ratio),
    pro:   r(selectedUSDA.pro  * ratio),
    fat:   r(selectedUSDA.fat  * ratio),
    carb:  r(selectedUSDA.carb * ratio),
    fibre: r((selectedUSDA.fibre || 0) * ratio),
  });

  document.getElementById('selected-food').style.display = 'none';
  document.getElementById('serving-row').style.display = 'none';
  document.getElementById('sel-serving').innerHTML = '';
  document.getElementById('sel-qty-unit').textContent = 'g';
  selectedServingGrams = null;
  selectedServingLabel = null;
  usdaInput.value = '';
  selectedUSDA = null;
});

// ── Recipe picker ─────────────────────────────────────
function populateRecipePicker() {
  const sel = document.getElementById('recipe-pick');
  const recipes = Storage.getRecipes();
  const keys = Object.keys(recipes);
  sel.innerHTML = '<option value="">— pick a saved recipe —</option>' +
    keys.map(k => `<option value="${k}">${k}</option>`).join('');
}

document.getElementById('recipe-pick').addEventListener('change', function () {
  const recipes = Storage.getRecipes();
  const r = recipes[this.value];
  const metaEl = document.getElementById('recipe-pick-meta');
  const qtyRow = document.getElementById('recipe-qty-row');
  if (r) {
    metaEl.textContent = `${r.cal_per} kcal · ${r.pro_per}g P · ${r.fat_per}g F · ${r.carb_per}g C per ${r.per}g`;
    document.getElementById('recipe-qty').value = r.per;
    qtyRow.style.display = 'flex';
  } else {
    metaEl.textContent = '';
    qtyRow.style.display = 'none';
  }
});

document.getElementById('add-recipe-btn').addEventListener('click', () => {
  const name = document.getElementById('recipe-pick').value;
  if (!name) return;
  const recipes = Storage.getRecipes();
  const rec = recipes[name];
  if (!rec) return;
  const qty = parseFloat(document.getElementById('recipe-qty').value) || rec.per;
  const ratio = qty / rec.per;
  addFood({
    name:  `${name} (${qty}g)`,
    cal:   Math.round(rec.cal_per  * ratio),
    pro:   r(rec.pro_per  * ratio),
    fat:   r(rec.fat_per  * ratio),
    carb:  r(rec.carb_per * ratio),
    fibre: r((rec.fibre_per || 0) * ratio),
  });
  document.getElementById('recipe-pick').value = '';
  document.getElementById('recipe-pick-meta').textContent = '';
  document.getElementById('recipe-qty-row').style.display = 'none';
});

// ── Manual entry ──────────────────────────────────────
document.getElementById('add-manual-btn').addEventListener('click', () => {
  const name = document.getElementById('man-name').value.trim();
  const cal  = parseFloat(document.getElementById('man-cal').value)  || 0;
  if (!name || !cal) {
    setStatus('usda-status', 'Name and calories are required.', 'error');
    return;
  }
  addFood({
    name,
    cal,
    pro:   parseFloat(document.getElementById('man-pro').value)   || 0,
    fat:   parseFloat(document.getElementById('man-fat').value)   || 0,
    carb:  parseFloat(document.getElementById('man-carb').value)  || 0,
    fibre: parseFloat(document.getElementById('man-fibre').value) || 0,
  });
  ['man-name','man-cal','man-pro','man-fat','man-carb','man-fibre'].forEach(id => {
    document.getElementById(id).value = '';
  });
});

// ── AI Parse (optional) ───────────────────────────────
document.getElementById('nlp-parse-btn').addEventListener('click', async () => {
  const settings = Storage.getSettings();
  if (!settings.apiKey) {
    setStatus('nlp-status', 'Add your Anthropic API key in Settings first.', 'error');
    return;
  }
  const text = document.getElementById('nlp-input').value.trim();
  if (!text) return;

  const btn = document.getElementById('nlp-parse-btn');
  btn.disabled = true;
  btn.textContent = 'Parsing…';
  setStatus('nlp-status', '', '');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Parse this meal description into individual food items with macro estimates. Use realistic values based on standard nutritional data (similar to USDA). Return ONLY a JSON array with no markdown, no explanation:\n\n"${text}"\n\nSchema per item: { "name": string, "cal": number, "pro": number, "fat": number, "carb": number }\nExample: [{"name":"2 whole eggs (100g)","cal":143,"pro":12.6,"fat":9.5,"carb":0.7}]`
        }]
      })
    });
    const data = await res.json();
    const raw = (data.content[0]?.text || '').replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(raw);
    parsed.forEach(f => addFood(f));
    document.getElementById('nlp-input').value = '';
    setStatus('nlp-status', `Added ${parsed.length} item(s).`, 'success');
  } catch (e) {
    setStatus('nlp-status', 'Parse failed. Check your API key or try manual entry.', 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Parse with AI';
});

// ── Recipes tab ───────────────────────────────────────
document.getElementById('save-recipe-btn').addEventListener('click', () => {
  const name  = document.getElementById('r-name').value.trim();
  const per   = parseFloat(document.getElementById('r-per').value)   || 100;
  const cal   = parseFloat(document.getElementById('r-cal').value);
  const pro   = parseFloat(document.getElementById('r-pro').value)   || 0;
  const fat   = parseFloat(document.getElementById('r-fat').value)   || 0;
  const carb  = parseFloat(document.getElementById('r-carb').value)  || 0;
  const fibre = parseFloat(document.getElementById('r-fibre').value) || 0;

  if (!name || !cal) {
    setStatus('recipe-status', 'Name and calories are required.', 'error');
    return;
  }

  const recipes = Storage.getRecipes();
  recipes[name] = { per, cal_per: cal, pro_per: pro, fat_per: fat, carb_per: carb, fibre_per: fibre };
  Storage.setRecipes(recipes);
  populateRecipePicker();
  renderRecipeList();
  setStatus('recipe-status', `Saved "${name}".`, 'success');
  ['r-name','r-per','r-cal','r-pro','r-fat','r-carb','r-fibre'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('r-per').value = 100;
});

function renderRecipeList() {
  const el = document.getElementById('recipe-list');
  const recipes = Storage.getRecipes();
  const keys = Object.keys(recipes);
  if (!keys.length) {
    el.innerHTML = '<p class="empty-state" style="text-align:left;padding:0;margin-top:0.5rem">No recipes saved yet.</p>';
    return;
  }
  el.innerHTML = keys.map(k => {
    const rec = recipes[k];
    return `
      <div class="recipe-item">
        <div>
          <div class="recipe-item-name">${k}</div>
          <div class="recipe-item-macros">${rec.cal_per} kcal · ${rec.pro_per}g P · ${rec.fat_per}g F · ${rec.carb_per}g C${rec.fibre_per ? ` · ${rec.fibre_per}g fibre` : ''} per ${rec.per}g</div>
        </div>
        <button class="food-entry-remove" onclick="deleteRecipe('${k.replace(/'/g, "\\'")}')" aria-label="Delete ${k}">×</button>
      </div>`;
  }).join('');
}

function deleteRecipe(name) {
  const recipes = Storage.getRecipes();
  delete recipes[name];
  Storage.setRecipes(recipes);
  populateRecipePicker();
  renderRecipeList();
}

// ── Sync tab ──────────────────────────────────────────
document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.key;
    toggles[key] = !toggles[key];
    btn.classList.toggle('active', toggles[key]);
  });
});

function renderSyncSummary() {
  const el = document.getElementById('sync-summary');
  const cal  = Math.round(foods.reduce((s, f) => s + (f.cal  || 0), 0));
  const pro  = r(foods.reduce((s, f) => s + (f.pro  || 0), 0));
  const fat  = r(foods.reduce((s, f) => s + (f.fat  || 0), 0));
  const carb = r(foods.reduce((s, f) => s + (f.carb || 0), 0));

  const lines = [
    `Date:     ${formatDateForSheet(currentDate)}`,
    foods.length ? `Calories: ${cal} kcal` : null,
    foods.length ? `Protein:  ${pro}g` : null,
    foods.length ? `Fat:      ${fat}g` : null,
    foods.length ? `Carbs:    ${carb}g` : null,
  ].filter(Boolean);

  el.innerHTML = lines.map(l => `<div>${l}</div>`).join('') ||
    '<span style="color:var(--text-muted)">No food logged for this date yet.</span>';
}

document.getElementById('sync-btn').addEventListener('click', async () => {
  const btn = document.getElementById('sync-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting to Google…';
  setStatus('sync-status', '', '');

  const cal   = Math.round(foods.reduce((s, f) => s + (f.cal  || 0), 0));
  const pro   = r(foods.reduce((s, f) => s + (f.pro  || 0), 0));
  const fat   = r(foods.reduce((s, f) => s + (f.fat  || 0), 0));
  const carb  = r(foods.reduce((s, f) => s + (f.carb || 0), 0));

  const data = {
    calories: foods.length ? cal  : '',
    protein:  foods.length ? pro  : '',
    fats:     foods.length ? fat  : '',
    carbs:    foods.length ? carb : '',
    weight:   document.getElementById('sync-weight').value || '',
    sleep:    document.getElementById('sync-sleep').value  || '',
    steps:    document.getElementById('sync-steps').value  || '',
    water:    document.getElementById('sync-water').value  || '',
    weights:  toggles.weights ? 'Yes' : '',
    cardio:   toggles.cardio  ? 'Yes' : '',
  };

  // Remove empty fields
  Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });

  if (!Object.keys(data).length) {
    setStatus('sync-status', 'Nothing to sync — log some food or fill in other fields.', 'error');
    btn.disabled = false;
    btn.textContent = 'Sync to Google Sheet';
    return;
  }

  try {
    const dateStr = formatDateForSheet(currentDate);
    btn.textContent = 'Writing to sheet…';
    const result = await Sheets.syncDay(dateStr, data);
    setStatus('sync-status', `Synced ${result.updated} cell(s) for ${dateStr}.`, 'success');
  } catch (e) {
    setStatus('sync-status', e.message || 'Sync failed. Check Settings.', 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Sync to Google Sheet';
});

// ── Settings ──────────────────────────────────────────
const COL_FIELDS = [
  { key: 'date',     label: 'Date column' },
  { key: 'calories', label: 'Calories' },
  { key: 'protein',  label: 'Protein' },
  { key: 'fats',     label: 'Fats' },
  { key: 'carbs',    label: 'Carbs' },
  { key: 'fibre',    label: 'Fibre' },
  { key: 'water',    label: 'Water' },
  { key: 'weight',   label: 'Weight' },
  { key: 'weights',  label: 'Weights (gym)' },
  { key: 'cardio',   label: 'Cardio' },
  { key: 'sleep',    label: 'Sleep' },
  { key: 'steps',    label: 'Steps' },
];

function loadSettingsUI() {
  const s = Storage.getSettings();
  document.getElementById('cfg-sheet-id').value    = s.sheetId    || '';
  document.getElementById('cfg-sheet-name').value  = s.sheetName  || 'Daily Tracker';
  document.getElementById('cfg-client-id').value   = s.clientId   || '';
  document.getElementById('cfg-header-row').value  = s.headerRow  || 2;
  document.getElementById('cfg-cal-target').value  = s.calTarget  || 1500;
  document.getElementById('cfg-pro-target').value  = s.proTarget  || 130;
  document.getElementById('cfg-api-key').value     = s.apiKey     || '';
  document.getElementById('cfg-usda-key').value    = s.usdaKey    || '';

  // Show AI tab if API key is set
  document.getElementById('nlp-tab').style.display = s.apiKey ? 'block' : 'none';

  // Column map
  const colMap = s.colMap || {};
  const grid = document.getElementById('col-map-grid');
  grid.innerHTML = COL_FIELDS.map(f => `
    <div class="field-group">
      <label class="field-label" for="col-${f.key}">${f.label}</label>
      <input type="text" id="col-${f.key}" class="input-text" value="${colMap[f.key] || ''}" placeholder="e.g. C" style="text-transform:uppercase" maxlength="2" />
    </div>
  `).join('');
}

document.getElementById('save-settings-btn').addEventListener('click', () => {
  const existing = Storage.getSettings();
  const settings = {
    ...existing,
    sheetId:   document.getElementById('cfg-sheet-id').value.trim(),
    sheetName: document.getElementById('cfg-sheet-name').value.trim() || 'Daily Tracker',
    clientId:  document.getElementById('cfg-client-id').value.trim(),
    headerRow: parseInt(document.getElementById('cfg-header-row').value) || 2,
    calTarget: parseInt(document.getElementById('cfg-cal-target').value) || 1500,
    proTarget: parseInt(document.getElementById('cfg-pro-target').value) || 130,
    apiKey:    document.getElementById('cfg-api-key').value.trim(),
    usdaKey:   document.getElementById('cfg-usda-key').value.trim(),
  };
  Storage.setSettings(settings);
  document.getElementById('nlp-tab').style.display = settings.apiKey ? 'block' : 'none';
  updateMacros();
  setStatus('settings-status', 'Settings saved.', 'success');
});

document.getElementById('save-colmap-btn').addEventListener('click', () => {
  const settings = Storage.getSettings();
  const colMap = {};
  COL_FIELDS.forEach(f => {
    colMap[f.key] = (document.getElementById(`col-${f.key}`)?.value || '').toUpperCase().trim();
  });
  settings.colMap = colMap;
  Storage.setSettings(settings);
  setStatus('settings-status', 'Column map saved.', 'success');
});

// ── Init ─────────────────────────────────────────────
function init() {
  foods = Storage.getDayLog(currentDate);
  renderFoodLog();
  updateMacros();
  populateRecipePicker();

  const settings = Storage.getSettings();
  if (!settings.sheetId) {
    settings.sheetId = '1f_J4WOCbQxQ990s0SKp-3u0dpZ0WkgcZ';
    Storage.setSettings(settings);
  }

  // Show AI tab if API key already configured
  if (settings.apiKey) {
    document.getElementById('nlp-tab').style.display = 'block';
  }

  // Handle ?tab= param — used by PWA home screen shortcuts
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab');
  if (tabParam) {
    const btn = document.querySelector(`.tab-btn[data-tab="${tabParam}"]`);
    if (btn) btn.click();
  }
}

init();
