// Storage port backed by localStorage. Every access is guarded: private windows and previews may refuse it.
export const SAVE_KEY = 'villa-limon';
export const LEGACY_KEYS = ['strawberry-borough-v1'];

export function createLocalStorage(storeOverride) {
  // Even reading `localStorage` can throw in sandboxed frames, so resolve it lazily inside try.
  const get = () => storeOverride || globalThis.localStorage;
  const store = { getItem: k => get().getItem(k), setItem: (k, v) => get().setItem(k, v), removeItem: k => get().removeItem(k) };
  return {
    read(key) { try { return store.getItem(key); } catch (e) { return null; } },
    write(key, value) { try { store.setItem(key, value); return true; } catch (e) { return false; } },
    remove(key) { try { store.removeItem(key); } catch (e) { /* ignore */ } },
  };
}
