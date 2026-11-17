// Paired devices: a wall tablet signs in once by pairing and keeps a device
// session of 30 days, counted from its last use. Only a hash of the device's
// token is stored. The list lives in a JSON file, replaced atomically, so a
// restart keeps every tablet signed in.
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const hash = (token) => createHash('sha256').update(token).digest('base64url');
const DAY = 24 * 3600 * 1000;
// Writing on every request would wear the volume; an hour is precise enough
// for a 30-day lifetime.
const TOUCH_EVERY = 3600 * 1000;

/** A JSON document in one file. Writes go to a temporary file and are renamed into place. */
export function jsonFile(path, log = console) {
  return {
    read() {
      try {
        return JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') log.warn(`store: ${path} unreadable (${error.code || error.name}), starting empty`);
        return null;
      }
    },
    write(value) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 });
      renameSync(tmp, path);
    },
  };
}

export function createDevices({ store, ttlMs = 30 * DAY, now = Date.now }) {
  const loaded = store.read();
  let devices = Array.isArray(loaded && loaded.devices) ? loaded.devices : [];
  const save = () => store.write({ version: 1, devices });
  const live = () => {
    const before = devices.length;
    devices = devices.filter((d) => d.expires > now());
    if (devices.length !== before) save();
  };
  const view = (d) => ({ id: d.id, name: d.name, created: d.created, lastSeen: d.lastSeen });

  return {
    list() {
      live();
      return devices.map(view);
    },
    /** A new device. The token is returned once and never stored. */
    add(name) {
      const token = randomBytes(32).toString('base64url');
      const t = now();
      const device = { id: randomBytes(9).toString('base64url'), name, tokenHash: hash(token), created: t, lastSeen: t, expires: t + ttlMs };
      devices.push(device);
      save();
      return { device: view(device), token };
    },
    /** The device for a token, or null. A use extends its lifetime; `touched` says whether it moved. */
    check(token) {
      if (!token) return null;
      const h = hash(token);
      const device = devices.find((d) => d.tokenHash === h);
      if (!device || device.expires <= now()) return null;
      let touched = false;
      if (now() - device.lastSeen >= TOUCH_EVERY) {
        device.lastSeen = now();
        device.expires = now() + ttlMs;
        save();
        touched = true;
      }
      return { device: view(device), touched };
    },
    revoke(id) {
      const before = devices.length;
      devices = devices.filter((d) => d.id !== id);
      if (devices.length === before) return false;
      save();
      return true;
    },
    ttlMs,
  };
}
