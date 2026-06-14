/**
 * usda.js
 * Wraps the USDA FoodData Central search API.
 * Uses SR Legacy + Foundation datasets for accuracy.
 */

const USDA = (() => {
  const BASE = 'https://api.nal.usda.gov/fdc/v1';
  const DEFAULT_KEY = '13FVDx9fZViRNYoMHAlm4Z8OJdsVcl1912esLgZn';

  function getKey() {
    try { return Storage.getSettings().usdaKey || DEFAULT_KEY; } catch (_) { return DEFAULT_KEY; }
  }

  // Nutrient IDs in USDA FoodData Central
  const NUT = {
    calories: [1008, 208],
    protein:  [1003, 203],
    fat:      [1004, 204],
    carbs:    [1005, 205],
    fibre:    [1079, 291],
  };

  function getNutrient(nutrients, ids) {
    for (const id of ids) {
      const found = nutrients.find(n => n.nutrientId === id || Number(n.nutrientNumber) === id);
      if (found && found.value != null) return Math.round(found.value * 10) / 10;
    }
    return 0;
  }

  function parseFood(food) {
    const n = food.foodNutrients || [];
    return {
      fdcId:   food.fdcId,
      name:    food.description,
      cal:     getNutrient(n, NUT.calories),
      pro:     getNutrient(n, NUT.protein),
      fat:     getNutrient(n, NUT.fat),
      carb:    getNutrient(n, NUT.carbs),
      fibre:   getNutrient(n, NUT.fibre),
      per:     100, // all USDA values are per 100g
    };
  }

  async function search(query, pageSize = 7) {
    const params = new URLSearchParams({
      query,
      pageSize,
      dataType: 'SR Legacy,Foundation',
      api_key: getKey(),
    });
    const res = await fetch(`${BASE}/foods/search?${params}`);
    if (!res.ok) throw new Error(`USDA API error ${res.status}`);
    const data = await res.json();
    return (data.foods || []).map(parseFood);
  }

  async function getFoodMeasures(fdcId) {
    const res = await fetch(`${BASE}/food/${fdcId}?api_key=${getKey()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.foodMeasures || [])
      .filter(m => m.gramWeight > 0)
      .map(m => ({ label: m.disseminationText, grams: m.gramWeight }));
  }

  async function searchOFF(query, pageSize = 7) {
    const params = new URLSearchParams({
      q: query,
      page_size: pageSize,
      fields: 'product_name,brands,nutriments,serving_quantity',
    });
    const res = await fetch(`https://search.openfoodfacts.org/search?${params}`);
    if (!res.ok) throw new Error(`Open Food Facts API error ${res.status}`);
    const data = await res.json();
    return (data.hits || [])
      .filter(p => p.product_name && p.nutriments?.['energy-kcal_100g'] != null)
      .slice(0, pageSize)
      .map(p => {
        const n = p.nutriments;
        const name = p.brands ? `${p.product_name} — ${p.brands}` : p.product_name;
        const servingGrams = parseFloat(p.serving_quantity) || null;
        return {
          fdcId: null,
          name,
          cal:   Math.round(n['energy-kcal_100g'] || 0),
          pro:   Math.round((n['proteins_100g']       || 0) * 10) / 10,
          fat:   Math.round((n['fat_100g']             || 0) * 10) / 10,
          carb:  Math.round((n['carbohydrates_100g']   || 0) * 10) / 10,
          fibre: Math.round((n['fiber_100g']           || 0) * 10) / 10,
          per:   100,
          source: 'off',
          servingLabel: servingGrams ? '1 serving' : null,
          servingGrams,
        };
      });
  }

  return { search, getFoodMeasures, searchOFF };
})();
