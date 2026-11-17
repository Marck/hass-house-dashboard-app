// Starts the dashboard backend.
//
//   node app/backend/main.js
//
// Environment: PORT (default 8080), DASHBOARD_MODE (only "demo" for now),
// STATIC_DIR (default app/frontend). It logs no request data.
import { createServer } from 'node:http';
import { createHandler, settings } from './app.js';

let config;
try {
  config = settings(process.env);
} catch (error) {
  console.error(`Not started: ${error.message}`);
  process.exit(1);
}

const server = createServer(createHandler(config));
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.listen(config.port, () => console.log(`Dashboard backend listening on port ${config.port}, mode ${config.mode}`));

// Kubernetes sends SIGTERM; finish open requests, then stop.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
