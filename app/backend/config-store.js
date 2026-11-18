// The household's dashboard configuration (rooms, area links, cards, labels),
// kept by the backend so every phone and tablet shows the same dashboard.
// One JSON file, replaced atomically (A10). The backend does not interpret it:
// the frontend normalizes whatever it loads and escapes every label it shows.
// Only a signed-in person may change it; a paired device reads it.
import { readJson } from './auth.js';

export const CONFIG_MAX_BYTES = 200_000;

const json = (res, status, value) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'",
  });
  res.end(JSON.stringify(value));
};

/** `store` is a jsonFile(). Writes carry the revision they were based on, so a stale device cannot overwrite a newer edit. */
export function createConfigStore({ store }) {
  const loaded = store.read();
  let state = loaded && Number.isInteger(loaded.revision) && loaded.config && typeof loaded.config === 'object'
    ? { revision: loaded.revision, config: loaded.config } : { revision: 0, config: null };

  /** Handles /api/config. Returns true when answered. `foreign` refuses cross-site writes. */
  async function handle(req, res, url, who, foreign) {
    if (url.pathname !== '/api/config') return false;
    if (req.method === 'GET') return json(res, 200, state), true;
    if (req.method !== 'PUT') return json(res, 405, { error: 'method' }), true;
    if (foreign(req)) return json(res, 403, { error: 'forbidden' }), true;
    if (who.kind !== 'person') return json(res, 403, { error: 'a person must be signed in' }), true;
    const body = await readJson(req, CONFIG_MAX_BYTES);
    const config = body && body.config;
    if (!config || typeof config !== 'object' || Array.isArray(config) || !Number.isInteger(config.version)) {
      return json(res, 400, { error: 'config' }), true;
    }
    if (body.revision !== state.revision) return json(res, 409, state), true;
    const next = { revision: state.revision + 1, config };
    store.write(next);
    state = next;
    return json(res, 200, { revision: state.revision }), true;
  }

  return { handle, get: () => state };
}
