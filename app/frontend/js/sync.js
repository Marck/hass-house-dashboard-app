// The household's configuration on the backend, kept in step with this browser.
// `revision` is the version this browser last saw; a save based on an older one
// is refused (409), so a tablet that was offline cannot undo an edit made on a
// phone. No DOM here: main.js passes in what it needs, so the rules are tested
// in Node.

/**
 * `fetch` is window.fetch. `canWrite()` says whether a person is signed in (a
 * paired device only reads). `editing()` is true while an editor is open.
 * `hasLocal()` says whether this browser has a configuration of its own.
 * `current()` is the configuration to save. `adopt(config)` takes a newer one
 * from the backend. `toast(key)` tells the user.
 */
export function createConfigSync({ fetch, canWrite, editing, hasLocal, current, adopt, toast }) {
  const server = { on: false, revision: 0, pushing: false, again: false, config: null };

  /** Use the backend's configuration when it is newer than what this browser shows. */
  function take(state) {
    if (!state || !state.config || state.revision === server.revision) return;
    server.revision = state.revision;
    server.config = state.config;
    adopt(state.config);
  }

  /** Send this browser's configuration; one save at a time, the last one wins. */
  function push() {
    if (!server.on || !canWrite()) return Promise.resolve();
    if (server.pushing) {
      server.again = true;
      return Promise.resolve();
    }
    server.pushing = true;
    return fetch('/api/config', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: server.revision, config: current() }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (res.ok && body) server.revision = body.revision;
        else if (res.status === 409) {
          server.again = false;
          take(body);
          toast('toast.configNewer');
        } else toast('toast.configNotSaved');
      })
      .catch(() => toast('toast.configNotSaved'))
      .then(() => {
        server.pushing = false;
        if (server.again) {
          server.again = false;
          return push();
        }
        return undefined;
      });
  }

  /** Load the household's configuration; the first time, move this browser's own there. */
  function pull() {
    if (editing()) return Promise.resolve(); // never swap the configuration under an open editor
    return fetch('/api/config', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((state) => {
        if (!state) return undefined;
        const first = !server.on;
        server.on = true;
        if (state.config) return take(state);
        if (first && hasLocal() && canWrite()) return push();
        return undefined;
      })
      .catch(() => {});
  }

  return {
    push,
    pull,
    /** True once the backend keeps the configuration (sign-in is on). */
    on: () => server.on,
    /** The household's configuration as last received, or null. */
    config: () => server.config,
  };
}
