// Starts the dashboard backend.
//
//   node app/backend/main.js
//
// Environment: PORT (default 8080), HOST (default all interfaces),
// DASHBOARD_MODE (demo or live; live reads Home Assistant, see ha.js, with
// HASS_URL and HASS_TOKEN_FILE or HASS_TOKEN),
// STATIC_DIR (default app/frontend), AUTH_MODE (none or oidc) and, for oidc,
// OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, PUBLIC_URL, SESSION_HOURS and
// DATA_DIR (default /data: the paired devices and the household's configuration).
// It logs no request data and no token.
import { createServer } from 'node:http';
import { createHandler, settings } from './app.js';
import { authSettings, createAuth } from './auth.js';
import { createDevices, jsonFile } from './devices.js';
import { createHa, haSettings } from './ha.js';
import { createEnergy } from './energy.js';
import { createAvatars } from './avatar.js';
import { createConfigStore } from './config-store.js';

let config;
let auth = null;
let ha = null;
let energy = null;
let avatars = null;
let configStore = null;
try {
  config = settings(process.env);
  const sign = authSettings(process.env);
  if (config.mode === 'live') {
    const haConfig = haSettings(process.env);
    ha = createHa(haConfig);
    energy = createEnergy({ ha });
    avatars = createAvatars(haConfig);
  }
  if (sign.mode === 'oidc') {
    auth = createAuth({ ...sign, devices: createDevices({ store: jsonFile(`${sign.dataDir}/devices.json`) }) });
    // The household's configuration; without sign-in it stays in each browser.
    configStore = createConfigStore({ store: jsonFile(`${sign.dataDir}/config.json`) });
  }
} catch (error) {
  console.error(`Not started: ${error.message}`);
  process.exit(1);
}

const server = createServer(createHandler({ ...config, auth, ha, energy, avatars, configStore }));
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.listen(config.port, config.host, () => {
  console.log(`Dashboard backend listening on port ${config.port}, mode ${config.mode}, sign-in ${auth ? 'oidc' : 'none'}`);
  if (ha) ha.start();
  if (energy) energy.start();
});

// Kubernetes sends SIGTERM; finish open requests, then stop.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (energy) energy.stop();
    if (ha) ha.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
