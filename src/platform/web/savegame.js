// Reading and writing the save document through the storage port. Parsing and migration live in core/persistence.
import { createSaveDocument, loadSave } from '../../core/persistence/save.js';
import { SAVE_KEY, LEGACY_KEYS } from './storage.js';

/** @returns {{state, ui, from, warnings} | null} the newest save that loads, or null for a new game */
export function readSave(storage) {
  for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
    const raw = storage.read(key); if (!raw) continue;
    try { const res = loadSave(JSON.parse(raw)); if (res.warnings.length) console.warn('save normalised:', res.warnings); return res; }
    catch (e) { console.warn(`ignoring unreadable save "${key}":`, e.message); }
  }
  return null;
}
export const writeSave = (storage, state, ui) => storage.write(SAVE_KEY, JSON.stringify(createSaveDocument(state, ui)));
export const clearSave = storage => storage.remove(SAVE_KEY);
