// Generates a schematic floor layout from an ordered list of rooms, so the
// plan stays valid when rooms are added, reordered or moved between floors.
// It is a schematic, not a to-scale drawing of a real building.
export const ROW_WIDTH = 7;
const MAX_STRETCH = 1.6;
const round = (v) => Math.round(v * 5) / 5;

/**
 * Sets room.geom = [x, y, width, depth] for each room, in order. Rooms fill
 * rows of ROW_WIDTH units; a row is stretched to the full width when that
 * takes no more than MAX_STRETCH, so the footprint stays compact.
 */
export function layoutFloor(rooms) {
  let y = 0;
  let row = [];
  let used = 0;
  const flush = () => {
    if (!row.length) return;
    const depth = Math.max(...row.map((r) => r.size[1]));
    const scale = Math.min(MAX_STRETCH, ROW_WIDTH / used);
    let x = 0;
    row.forEach((r, i) => {
      const end = i === row.length - 1 && scale < MAX_STRETCH ? ROW_WIDTH : round(x + r.size[0] * scale);
      r.geom = [x, y, end - x, depth];
      x = end;
    });
    // Round up, never down: the next row must start at or below this one's far edge.
    y = Math.ceil((y + depth) * 5 - 1e-9) / 5;
    row = [];
    used = 0;
  };
  rooms.forEach((r) => {
    if (row.length && used + r.size[0] > ROW_WIDTH + 0.01) flush();
    row.push(r);
    used += r.size[0];
  });
  flush();
}
