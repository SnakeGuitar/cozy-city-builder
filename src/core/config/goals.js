// Goals as data. `metric` names a pure function in core/goals/metrics.js; a goal completes when metric >= target.
export const GOALS = Object.freeze([
  { id: 'g0', reward: 50, unlock: [], metric: 'hasCafe', target: 1 },
  { id: 'g0b', reward: 50, unlock: [], metric: 'connectedHomes', target: 1 },
  { id: 'g1', reward: 100, unlock: ['workshop', 'lamp', 'tea_house', 'row_house', 'textile', 'road_narrow'], metric: 'connectedHomes', target: 3 },
  { id: 'g2', reward: 120, unlock: ['citruscafe', 'florist', 'orchard', 'restaurant', 'bookshop', 'craft_shop', 'pottery', 'road_japanese'], metric: 'connectedBakeries', target: 1 },
  { id: 'g3', reward: 150, unlock: ['school', 'clinic', 'library', 'jam', 'walkup', 'sawmill', 'road_alley'], metric: 'gardenNextToHome', target: 1 },
  { id: 'g4', reward: 200, unlock: ['fire', 'police', 'cannery', 'market', 'covered_market', 'food_plant', 'warehouse', 'road_asphalt', 'apartments'], metric: 'employed', target: 20 },
  { id: 'g5', reward: 250, unlock: ['plaza', 'distribution', 'courtyard', 'studio', 'road_avenue'], metric: 'population', target: 60 },
  { id: 'g6', reward: 300, unlock: [], metric: 'utilitiesFor40', target: 1 },
  { id: 'g7', reward: 400, unlock: [], metric: 'happyHomes', target: 6 },
]);
