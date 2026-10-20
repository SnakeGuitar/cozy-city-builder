// Global player settings (language, sound, mascot, camera smoothing) live in their own key, apart from any game.
import { SETTINGS_KEY } from './storage.js';

export function readSettings(storage, legacySlotKey) {
  const raw = storage.read(SETTINGS_KEY);
  if (raw) { try { return JSON.parse(raw); } catch (e) { /* fall through */ } }
  // first run after v3: language and sound were stored inside the game save
  const old = storage.read(legacySlotKey); if (!old) return {};
  try { const d = JSON.parse(old); const u = d.v >= 3 ? d.ui || {} : d; return { lang: u.lang, muted: u.muted, tips: u.tips }; } catch (e) { return {}; }
}
export const writeSettings = (storage, s) => storage.write(SETTINGS_KEY, JSON.stringify(s));
