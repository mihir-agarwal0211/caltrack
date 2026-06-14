/**
 * usda.js
 * Wraps the USDA FoodData Central search API.
 * Uses SR Legacy + Foundation datasets for accuracy.
 * API key: DEMO_KEY works for low usage (~1000 req/day per IP).
 * For higher usage, get a free key at https://fdc.nal.usda.gov/api-guide.html
 */

const USDA = (() => {
  const BASE = 'https://api.nal.usda.gov/fdc/v1';
  const API_KEY = '13FVDx9fZViRNYoMHAlm4Z8OJdsVcl1912esLgZn';

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
      api_key: API_KEY,
    });
    const res = await fetch(`${BASE}/foods/search?${params}`);
    if (!res.ok) throw new Error(`USDA API error ${res.status}`);
    const data = await res.json();
    return (data.foods || []).map(parseFood);
  }

  async function getFoodMeasures(fdcId) {
    const res = await fetch(`${BASE}/food/${fdcId}?api_key=${API_KEY}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.foodMeasures || [])
      .filter(m => m.gramWeight > 0)
      .map(m => ({ label: m.disseminationText, grams: m.gramWeight }));
  }

  return { search, getFoodMeasures };
})();
