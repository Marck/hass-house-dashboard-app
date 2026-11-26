// Person pictures from Home Assistant, served to signed-in browsers at
// /api/ha/avatar/<person entity id>. The browser never gets the picture's URL:
// a person's entity_picture may be a full external address. Only its path is
// used, only paths Home Assistant serves pictures from are accepted, and it is
// always fetched from Home Assistant's own address, so this can never be made to
// fetch from anywhere else.

const PATH = /^\/(local|api\/image\/serve)\/[A-Za-z0-9._~\-/]{1,200}$/;
const TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const AVATAR_MAX_BYTES = 1_000_000;
const CACHE_MS = 10 * 60_000;
const FETCH_MS = 10_000;

/** The path of a person's picture, or null when it is not one Home Assistant serves pictures from. */
export function avatarPath(picture) {
  if (typeof picture !== 'string' || !picture.trim()) return null;
  let path;
  try {
    path = new URL(picture.trim(), 'http://ha.invalid').pathname;
  } catch {
    return null;
  }
  if (!PATH.test(path) || path.split('/').some((part) => part === '..' || part === '.')) return null;
  return path;
}

/**
 * Fetches and caches pictures. base is Home Assistant's http(s) address, token()
 * the dashboard's token. get(path) resolves to { type, body } or null.
 */
export function createAvatars({ base, token, fetchImpl = globalThis.fetch, now = Date.now }) {
  const cache = new Map(); // path -> { at, image }
  const root = base.endsWith('/') ? base.slice(0, -1) : base;

  async function load(path) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_MS);
    try {
      const res = await fetchImpl(`${root}${path}`, { headers: { Authorization: `Bearer ${token()}` }, redirect: 'error', signal: ctl.signal });
      const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const size = Number(res.headers.get('content-length'));
      if (!res.ok || !TYPES.includes(type) || size > AVATAR_MAX_BYTES) return null;
      const body = Buffer.from(await res.arrayBuffer());
      return body.length && body.length <= AVATAR_MAX_BYTES ? { type, body } : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async get(path) {
      if (avatarPath(path) !== path) return null;
      const hit = cache.get(path);
      if (hit && now() - hit.at < CACHE_MS) return hit.image;
      const image = await load(path);
      cache.set(path, { at: now(), image });
      return image;
    },
  };
}
