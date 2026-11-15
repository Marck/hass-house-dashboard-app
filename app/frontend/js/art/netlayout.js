// Pure layout for the network map. Positions are in CSS pixels for a given
// container width, so text and touch targets never get scaled down.
const CARD_H = 52;
const GAP = 10;
const ROW = CARD_H + GAP;
const PAD = 14;

export function layoutNetwork(site, width) {
  const W = Math.max(600, Math.round(width));
  const wide = W >= 900;
  const leftW = wide ? 200 : 168;
  const mainX = PAD + leftW + (wide ? 50 : 24);
  const meshX = mainX + (wide ? Math.min(250, Math.max(190, W * 0.2)) : 140);
  const devX = meshX + (wide ? 120 : 84);
  const avail = W - devX - PAD;
  const cols = avail >= 2 * 176 + GAP ? 2 : 1;
  const cardW = Math.min(wide ? 218 : 236, (avail - (cols - 1) * GAP) / cols);

  const [main, ...mesh] = site.nodes;
  const nodes = {};
  const cards = {};
  let y = 16;
  mesh.forEach((node) => {
    const devices = site.devices.filter((v) => v.node === node.id);
    const rows = Math.max(3, Math.ceil(devices.length / cols));
    devices.forEach((v, i) => {
      cards[v.id] = { x: devX + (i % cols) * (cardW + GAP), y: y + Math.floor(i / cols) * ROW, w: cardW, h: CARD_H };
    });
    nodes[node.id] = { x: meshX, y: y + (rows * ROW - GAP) / 2, r: 44 };
    y += rows * ROW + 46;
  });
  const meshBottom = y - 46;

  const ys = mesh.map((node) => nodes[node.id].y);
  const mainY = Math.max(250, ys.length > 1 ? (ys[0] + ys[1]) / 2 + 10 : (ys[0] || 100) + 150);
  nodes[main.id] = { x: mainX, y: mainY, r: 50 };
  const wan = { x: PAD + 56, y: 58, r: 40 };

  let ly = mainY + 124;
  const own = site.devices.filter((v) => v.node === main.id);
  own.filter((v) => !v.group).forEach((v) => {
    cards[v.id] = { x: PAD + 8, y: ly, w: leftW, h: CARD_H };
    ly += ROW;
  });
  const members = own.filter((v) => v.group);
  let cluster = null;
  if (members.length) {
    cluster = { x: PAD, y: ly + 8, w: leftW + 24, h: 36 + members.length * ROW };
    members.forEach((v, i) => {
      const indent = i ? 30 : 10;
      cards[v.id] = { x: PAD + indent, y: cluster.y + 30 + i * ROW, w: leftW + 14 - indent, h: CARD_H };
    });
    ly = cluster.y + cluster.h;
  }

  return { W, H: Math.ceil(Math.max(meshBottom, ly) + 16), cols, nodes, cards, wan, cluster, mainId: main.id };
}
