// The mascot's advice: pure rules that look at the town and name one useful tip (a translation id).
// The application rate-limits them (in simulated seconds) so the mascot does not nag.
import { needsRoad } from '../tutorial/tutorial.js';

export const ADVICE = Object.freeze([
  { id: 'm_no_road', mood: 'alert', when: (s, d) => d.hasCafe && Object.values(d.byId).some(needsRoad) },
  { id: 'm_utils', mood: 'think', when: (s, d) => d.city.utilMin < .98 },
  { id: 'm_services', mood: 'think', when: (s, d) => s.population > 20 && d.city.svcScore < .5 },
  { id: 'm_jobs', mood: 'think', when: (s, d) => d.city.W - d.city.J > 5 },
  { id: 'm_vacant', mood: 'think', when: (s, d) => d.city.vacantShops > 0 && d.city.PP > 0 },
]);
export const ADVICE_COOLDOWN = 45;       // simulated seconds between two tips
export const ADVICE_REPEAT = 180;        // before the same tip may come back

/** First tip that applies, or null. Pure. */
export function pickAdvice(state, derived) { return ADVICE.find(a => a.when(state, derived)) || null; }

/**
 * Decides whether to speak now. `memory` is runtime-only ({ now, last, lastById }) and is returned updated.
 * Pure: same inputs, same answer.
 */
export function adviseNow(state, derived, memory) {
  const a = pickAdvice(state, derived);
  if (!a) return { event: null, memory };
  const lastSame = memory.lastById[a.id] ?? -Infinity;
  if (memory.now - memory.last < ADVICE_COOLDOWN || memory.now - lastSame < ADVICE_REPEAT) return { event: null, memory };
  return { event: { type: 'mascot_message_requested', messageId: a.id, mood: a.mood, params: {}, reason: 'advice' },
    memory: { ...memory, last: memory.now, lastById: { ...memory.lastById, [a.id]: memory.now } } };
}
