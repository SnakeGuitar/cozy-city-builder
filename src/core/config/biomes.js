// Biomes and map generation presets, as data. The terrain generator (domain/terrain.js) reads these numbers;
// renderers read `look` hints (ground palette, fog, light) and the vegetation table. Ids are saved: never rename.
//
// Per preset:
//   relief    { amp, freq, octaves } — height noise: amplitude (world units), base frequency (per unit), octaves
//   shape     'flat' | 'hills' | 'coast' | 'valley' | 'basin' — the large-scale form added to the noise
//   water     { level, kind } — cells whose ground lies below `level` are water ('sea', 'river', 'pond'; 'ice' freezes it)
//   moisture, temperature — base values 0..1 the noise varies around
//   rocks     — share of steep or high cells that become rock outcrops (not buildable)
//   flora     — vegetation per cell: density 0..1 and the mix of kinds (weights)
//   look      — renderer hints: ground colours, fog, light tint
export const GENERATOR_VERSION = 1;
export const MAP_SIZES = Object.freeze([24, 32, 40]);
export const DEFAULT_MAP_SIZE = 32;
export const MAP_MARGIN = 4;               // generated ground around the playable map, for scenery
export const MAX_BUILD_STEP = .35;         // most a footprint's ground may rise from its lowest to its highest point
export const MAX_ROAD_GRADE = .3;          // most a road may climb per unit of length

export const BIOMES = Object.freeze({
  plains: { relief: { amp: .35, freq: .045, octaves: 3 }, shape: 'flat', water: { level: -.6, kind: 'pond' }, moisture: .5, temperature: .55, rocks: 0,
    flora: { density: .12, mix: { flowers: 5, shrub: 2, broadleaf: 1 } }, look: { ground: ['#b9cb92', '#c9d6a0', '#a9c084'], fog: null, light: 'warm' } },
  cloud_forest: { relief: { amp: 1.7, freq: .06, octaves: 4 }, shape: 'hills', water: { level: -.9, kind: 'pond' }, moisture: .9, temperature: .6, rocks: .12,
    flora: { density: .7, mix: { broadleaf: 3, tree_fern: 3, conifer: 1, shrub: 2 }, clearings: .45 }, look: { ground: ['#7f9c78', '#8eaa84', '#6f8f6c'], fog: { color: '#dfe6e0', density: .55 }, light: 'misty' } },
  snowy: { relief: { amp: 1.4, freq: .05, octaves: 4 }, shape: 'hills', water: { level: -.4, kind: 'ice' }, moisture: .5, temperature: .05, rocks: .25,
    flora: { density: .3, mix: { snow_conifer: 6, shrub_snow: 1 } }, look: { ground: ['#f3f5f7', '#e4ebf0', '#d8e2ea'], fog: { color: '#e8eef4', density: .2 }, light: 'cold' } },
  beach: { relief: { amp: .5, freq: .05, octaves: 3 }, shape: 'coast', water: { level: 0, kind: 'sea' }, moisture: .45, temperature: .85, rocks: .04,
    flora: { density: .14, mix: { palm: 4, dune_grass: 5, shrub: 1 } }, look: { ground: ['#bfcf93', '#e9d9a8', '#f1e3b8'], fog: null, light: 'bright' } },
  temperate_forest: { relief: { amp: .9, freq: .055, octaves: 4 }, shape: 'hills', water: { level: -.85, kind: 'pond' }, moisture: .65, temperature: .5, rocks: .05,
    flora: { density: .5, mix: { broadleaf: 4, conifer: 3, shrub: 2 }, clearings: .55 }, look: { ground: ['#9fb880', '#b2c58e', '#8daa72'], fog: null, light: 'warm' } },
  autumn_valley: { relief: { amp: .6, freq: .06, octaves: 3 }, shape: 'valley', water: { level: -.25, kind: 'river' }, moisture: .55, temperature: .45, rocks: .08,
    flora: { density: .35, mix: { autumn: 6, broadleaf: 1, shrub: 2 }, clearings: .5 }, look: { ground: ['#c9b67f', '#d6bf86', '#b9a875'], fog: null, light: 'golden' } },
  wetland: { relief: { amp: .45, freq: .09, octaves: 3 }, shape: 'basin', water: { level: -.08, kind: 'pond' }, moisture: .95, temperature: .55, rocks: 0,
    flora: { density: .4, mix: { reeds: 6, shrub: 2, willow: 2 } }, look: { ground: ['#8fae86', '#9fbb8e', '#7f9f78'], fog: { color: '#e4ebe2', density: .15 }, light: 'misty' } },
  mediterranean: { relief: { amp: 1.1, freq: .05, octaves: 4 }, shape: 'hills', water: { level: -.95, kind: 'pond' }, moisture: .2, temperature: .8, rocks: .18,
    flora: { density: .2, mix: { cypress: 3, olive: 3, shrub_dry: 4 } }, look: { ground: ['#d9cfa3', '#e6dbb1', '#cbbf91'], fog: null, light: 'bright' } },
});
export const BIOME_IDS = Object.freeze(Object.keys(BIOMES));
/** Presets offered for a new map: every biome, plus 'mixed' (regions of several biomes). 'classic' is the original flat meadow. */
export const MAP_PRESETS = Object.freeze([...BIOME_IDS, 'mixed']);
export const CLASSIC_PRESET = 'classic';
/** Biomes a mixed map draws its regions from. */
export const MIXED_POOL = Object.freeze(['plains', 'temperate_forest', 'autumn_valley', 'mediterranean', 'cloud_forest', 'snowy', 'wetland']);
/** Kinds of decoration a renderer must know how to draw. */
export const FLORA_KINDS = Object.freeze(['flowers', 'shrub', 'broadleaf', 'conifer', 'tree_fern', 'snow_conifer', 'shrub_snow', 'palm', 'dune_grass', 'autumn', 'reeds', 'willow', 'cypress', 'olive', 'shrub_dry', 'rock']);
