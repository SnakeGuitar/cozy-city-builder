// Game rules per mode. Every rule that differs between a normal game and sandbox lives here, and the core
// asks `rulesFor(state)` instead of checking the mode itself. Front ends read the same flags.
export const MODES = Object.freeze(['normal', 'sandbox']);
export const GAME_RULES = Object.freeze({
  normal: Object.freeze({ mode: 'normal', unlimitedMoney: false, allBuildingsUnlocked: false, goalsEnabled: true, tutorialEnabled: true, buildCostsEnabled: true, refundsEnabled: true }),
  sandbox: Object.freeze({ mode: 'sandbox', unlimitedMoney: true, allBuildingsUnlocked: true, goalsEnabled: false, tutorialEnabled: false, buildCostsEnabled: false, refundsEnabled: false }),
});
export const rulesFor = state => GAME_RULES[state.mode] || GAME_RULES.normal;
