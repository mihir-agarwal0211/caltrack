/**
 * storage.js
 * Thin wrappers around localStorage for typed get/set.
 * All caltrack data lives under the "caltrack_" namespace.
 */

const Storage = (() => {
  const NS = 'caltrack_';

  function get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(NS + key);
  }

  // Day log: keyed by date string "YYYY-MM-DD"
  function getDayLog(dateStr) {
    return get(`log_${dateStr}`, []);
  }

  function setDayLog(dateStr, foods) {
    return set(`log_${dateStr}`, foods);
  }

  // Recipes: { [name]: { per, cal_per, pro_per, fat_per, carb_per } }
  function getRecipes() {
    return get('recipes', {});
  }

  function setRecipes(recipes) {
    return set('recipes', recipes);
  }

  // Settings
  function getSettings() {
    return get('settings', {
      sheetId: '',
      sheetName: 'Daily Tracker',
      clientId: '',
      headerRow: 2,
      calTarget: 1500,
      proTarget: 130,
      apiKey: '',
      colMap: {
        date: 'A',
        calories: 'C',
        protein: 'D',
        fats: 'E',
        carbs: 'F',
        fibre: 'G',
        water: 'H',
        weight: 'I',
        weights: 'L',
        cardio: 'M',
        sleep: 'Q',
        steps: 'R',
      }
    });
  }

  function setSettings(settings) {
    return set('settings', settings);
  }

  return { get, set, remove, getDayLog, setDayLog, getRecipes, setRecipes, getSettings, setSettings };
})();
