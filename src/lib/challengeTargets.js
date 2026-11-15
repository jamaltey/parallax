const MAS_PER_DEGREE = 3_600_000;

export const CHALLENGE_TARGETS = [
  {
    id: 'barnards-star',
    name: "Barnard's Star",
    ra: 269.45207696,
    dec: 4.69336497,
    epoch: 2000,
    pmRa: -802.8,
    pmDec: 10362.5,
  },
  {
    id: 'epsilon-indi-b',
    name: 'Epsilon Indi B',
    ra: 331.0438333,
    dec: -56.7826944,
    epoch: 2000,
    pmRa: 3960,
    pmDec: -2540,
  },
  {
    id: 'wise-0855',
    name: 'WISE 0855−0714',
    ra: 133.79512917,
    dec: -7.24514722,
    epoch: 2010,
    pmRa: -8060,
    pmDec: 700,
  },
  { id: 'rw-aurigae', name: 'RW Aurigae', ra: 76.956526, dec: 30.4014382, epoch: 2000 },
  { id: 'r-draconis', name: 'R Draconis', ra: 248.167625, dec: 66.755, epoch: 2000 },
];

export function positionAtEpoch(target, epoch = new Date().getUTCFullYear() + 0.5) {
  const years = epoch - target.epoch;
  const dec = target.dec + ((target.pmDec || 0) * years) / MAS_PER_DEGREE;
  const ra =
    target.ra +
    ((target.pmRa || 0) * years) /
      (MAS_PER_DEGREE * Math.max(0.01, Math.cos((target.dec * Math.PI) / 180)));
  return { ra: ((ra % 360) + 360) % 360, dec, fov: 2 };
}
