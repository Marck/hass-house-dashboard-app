// A fake Home Assistant for the tests: the WebSocket API's handshake,
// authentication and the registry list commands, with synthetic data only.
// It records every message type it receives, so a test can prove what the
// backend never sent. A minimal RFC 6455 server: text frames, close, no
// extensions.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

export const TOKEN = 'test-token-not-real';

export const DATA = {
  'config/floor_registry/list': [{ floor_id: 'ground', name: 'Ground floor', level: 0 }],
  'config/area_registry/list': [
    { area_id: 'living', name: 'Living room', floor_id: 'ground' },
    { area_id: 'kitchen', name: 'Kitchen', floor_id: 'ground' },
  ],
  'config/device_registry/list': [{ id: 'dev1', area_id: 'kitchen', name: 'Sensor one' }],
  'config/entity_registry/list': [
    { entity_id: 'light.lamp_one', area_id: 'living', device_id: null, name: 'Lamp one', original_name: null, disabled_by: null, hidden_by: null },
    { entity_id: 'sensor.temp_one', area_id: null, device_id: 'dev1', name: null, original_name: 'Temperature', disabled_by: null, hidden_by: 'user' },
    { entity_id: 'switch.off_one', area_id: null, device_id: null, name: 'Disabled', disabled_by: 'user', hidden_by: null },
    { entity_id: 'switch.setting_one', area_id: 'living', device_id: null, name: 'Auto update', disabled_by: null, hidden_by: null, entity_category: 'config' },
  ],
};

// Live states in Home Assistant's compressed form. The camera's picture carries
// a token, as the real one does; the backend must drop it.
const CAM = ['cam', 'token', 'not', 'real'].join('-');
export const STATES = {
  'light.lamp_one': { s: 'on', a: { brightness: 200, friendly_name: 'Lamp one' }, c: 'ctx1', lc: 1 },
  'camera.door_one': { s: 'idle', a: { entity_picture: '/api/camera_proxy/camera.door_one?token=' + CAM, ['access_token']: CAM }, c: { id: 'ctx2', user_id: 'user-not-real' }, lc: 2 },
};

function frame(text) {
  const body = Buffer.from(text);
  const head = body.length < 126 ? Buffer.from([0x81, body.length])
    : body.length < 65536 ? Buffer.from([0x81, 126, body.length >> 8, body.length & 255])
      : Buffer.concat([Buffer.from([0x81, 127]), (() => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(body.length)); return b; })()]);
  return Buffer.concat([head, body]);
}

/** Parses the client's masked frames from buf; returns [messages, rest, closed]. */
function parse(buf) {
  const out = [];
  let closed = false;
  for (;;) {
    if (buf.length < 2) break;
    const op = buf[0] & 15;
    let len = buf[1] & 127;
    let at = 2;
    if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); at = 4; }
    else if (len === 127) { if (buf.length < 10) break; len = Number(buf.readBigUInt64BE(2)); at = 10; }
    if (buf.length < at + 4 + len) break;
    const mask = buf.subarray(at, at + 4);
    const data = Buffer.from(buf.subarray(at + 4, at + 4 + len)).map((b, i) => b ^ mask[i % 4]);
    buf = buf.subarray(at + 4 + len);
    if (op === 8) closed = true;
    else if (op === 1) out.push(Buffer.from(data).toString());
  }
  return [out, buf, closed];
}

/** Starts the fake. `token` is the one it accepts. */
export async function startFakeHa({ token = TOKEN, data = DATA, states = STATES } = {}) {
  const received = [];
  const sockets = new Set();
  const subscribers = new Set(); // { say, id }
  const server = createServer((req, res) => { res.writeHead(404); res.end(); });
  server.on('upgrade', (req, socket) => {
    if (req.url !== '/api/websocket') return socket.destroy();
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sockets.add(socket);
    const say = (msg) => socket.write(frame(JSON.stringify(msg)));
    let rest = Buffer.alloc(0);
    let authed = false;
    socket.on('data', (chunk) => {
      const [messages, left, closed] = parse(Buffer.concat([rest, chunk]));
      rest = left;
      for (const text of messages) {
        const msg = JSON.parse(text);
        received.push(msg.type);
        if (msg.type === 'auth') {
          authed = msg.access_token === token;
          say(authed ? { type: 'auth_ok', ha_version: '2026.11.1' } : { type: 'auth_invalid', message: 'Invalid access' });
          if (!authed) socket.end();
        } else if (!authed) socket.destroy();
        else if (msg.type === 'ping') say({ id: msg.id, type: 'pong' });
        else if (msg.type === 'subscribe_entities') {
          say({ id: msg.id, type: 'result', success: true, result: null });
          say({ id: msg.id, type: 'event', event: { a: states } });
          const sub = { say, id: msg.id };
          subscribers.add(sub);
          socket.on('close', () => subscribers.delete(sub));
        }
        else if (data[msg.type]) say({ id: msg.id, type: 'result', success: true, result: data[msg.type] });
        else say({ id: msg.id, type: 'result', success: false, error: { code: 'unknown_command', message: 'Unknown command.' } });
      }
      if (closed) socket.end();
    });
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    say({ type: 'auth_required', ha_version: '2026.11.1' });
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    url: `ws://127.0.0.1:${server.address().port}/api/websocket`,
    port: server.address().port,
    received,
    /** Sends a state message ({ a, c, r }) to every subscriber. */
    pushStates: (event) => { for (const sub of subscribers) sub.say({ id: sub.id, type: 'event', event }); },
    /** Cuts every open connection, as a restart of Home Assistant would. */
    dropAll: () => { for (const s of sockets) s.destroy(); },
    close: () => new Promise((done) => { for (const s of sockets) s.destroy(); server.close(done); }),
  };
}
