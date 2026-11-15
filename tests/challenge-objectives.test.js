import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeclination, parsePosition, parseRightAscension } from '../src/lib/coordinates.js';
import { CHALLENGE_TARGETS, positionAtEpoch } from '../src/lib/challengeTargets.js';
import { buildObservationTimeline } from '../src/lib/timelineSelection.js';
import { indexArchiveTable } from '../server/spherex-index.js';
import { parseArchiveTable } from '../src/api/spherex.js';
import { explorerUrl, parseExplorerUrl } from '../src/lib/explorerUrl.js';

test('accepts the challenge WISE 0855 sexagesimal coordinates', () => {
  assert.ok(Math.abs(parseRightAscension('08h55m10.831s') - 133.795129167) < 1e-8);
  assert.ok(Math.abs(parseDeclination('-07d14m42.53s') + 7.245147222) < 1e-8);
  assert.deepEqual(parsePosition({ ra: '83.633', dec: '+22:00:52.2', fov: '2' }), {
    ra: 83.633,
    dec: 22.0145,
    fov: 2,
  });
});

test('challenge presets include every requested target and move high proper-motion targets', () => {
  assert.deepEqual(
    CHALLENGE_TARGETS.map(target => target.name),
    ["Barnard's Star", 'Epsilon Indi B', 'WISE 0855−0714', 'RW Aurigae', 'R Draconis']
  );
  const barnard = CHALLENGE_TARGETS[0];
  const current = positionAtEpoch(barnard, 2026.5);
  assert.ok(Math.abs(current.ra - barnard.ra) > 0.001);
  assert.ok(Math.abs(current.dec - barnard.dec) > 0.05);
});

test('time comparison uses one band, chronological order, endpoints, and a bounded frame count', () => {
  const rows = Array.from({ length: 40 }, (_, index) => ({
    id: `d1-${index}`,
    band: 'SPHEREx-D1',
    observedAt: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
  })).concat(
    Array.from({ length: 8 }, (_, index) => ({
      id: `d2-${index}`,
      band: 'SPHEREx-D2',
      observedAt: new Date(Date.UTC(2025, 0, index + 1)).toISOString(),
    }))
  );
  const result = buildObservationTimeline(rows);
  assert.equal(result.band, 'SPHEREx-D1');
  assert.equal(result.rows.length, 24);
  assert.equal(result.rows[0].id, 'd1-0');
  assert.equal(result.rows.at(-1).id, 'd1-39');
  assert.ok(result.rows.every(row => row.band === result.band));
});

test('committed real SPHEREx index covers all five challenge targets', async () => {
  for (const target of CHALLENGE_TARGETS) {
    const position = positionAtEpoch(target, 2026.5);
    const shared = new URL(explorerUrl(position));
    assert.deepEqual(parseExplorerUrl(shared.search).position, position);
    const indexed = await indexArchiveTable(position, 'spherex_dr1');
    assert.ok(indexed, `missing DR1 index for ${target.name}`);
    const rows = parseArchiveTable(indexed.text);
    assert.ok(rows.length >= 2, `${target.name} needs at least two indexed observations`);
    assert.ok(rows.every(row => !row.isMock && /\/spherex\/dr1\/level2\//.test(row.url)));
    const timeline = buildObservationTimeline(rows);
    assert.ok(timeline.rows.length >= 2, `${target.name} needs a playable timeline`);
    assert.ok(timeline.rows.every(row => row.band === timeline.band));
    assert.ok(new Date(timeline.rows[0].observedAt) <= new Date(timeline.rows.at(-1).observedAt));
    const spanDays =
      (new Date(timeline.rows.at(-1).observedAt) - new Date(timeline.rows[0].observedAt)) /
      86_400_000;
    assert.ok(spanDays >= 20, `${target.name} needs a useful time baseline, got ${spanDays} days`);
  }
});
