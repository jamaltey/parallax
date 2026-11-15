const time = row => new Date(row.observedAt).getTime();

export function evenlySpaced(rows, limit) {
  if (rows.length <= limit) return rows;
  const selected = [];
  const used = new Set();
  for (let index = 0; index < limit; index++) {
    const sourceIndex = Math.round((index * (rows.length - 1)) / (limit - 1));
    if (!used.has(sourceIndex)) selected.push(rows[sourceIndex]);
    used.add(sourceIndex);
  }
  return selected;
}

/** Build a time-comparison sequence without confusing wavelength changes with temporal changes. */
export function buildObservationTimeline(rows, { limit = 24 } = {}) {
  const valid = rows.filter(row => row?.id && Number.isFinite(time(row)));
  const groups = new Map();
  for (const row of valid) {
    const key = row.band || 'unknown band';
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const ranked = [...groups.entries()].sort((a, b) => {
    const span = values => Math.max(...values.map(time)) - Math.min(...values.map(time));
    return b[1].length - a[1].length || span(b[1]) - span(a[1]);
  });
  const [band = '', selected = []] = ranked[0] || [];
  const ordered = [...selected].sort((a, b) => time(a) - time(b));
  return { rows: evenlySpaced(ordered, limit), band, available: ordered.length };
}
