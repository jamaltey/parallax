export function validatePosition({ ra, dec, fov }) {
  if (![ra, dec, fov].every(Number.isFinite))
    throw new Error('Enter numeric coordinates and field of view.');
  if (ra < 0 || ra >= 360) throw new Error('RA must be at least 0 and below 360 degrees.');
  if (dec < -90 || dec > 90) throw new Error('Dec must be between −90 and +90 degrees.');
  if (fov < 0.01 || fov > 180) throw new Error('FOV must be between 0.01 and 180 degrees.');
  return { ra, dec, fov };
}

function parts(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[dhms°′’″”:]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
}

/** Accept decimal degrees or astronomy notation such as 08h55m10.831s / -07d14m42.53s. */
export function parseRightAscension(value) {
  const raw = String(value).trim();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return Number(raw);
  const values = parts(raw);
  if (values.length < 2 || values.length > 3 || values.some(value => !Number.isFinite(value)))
    throw new Error('Enter RA as decimal degrees or hours, minutes, seconds (08h55m10.831s).');
  const [hours, minutes, seconds = 0] = values;
  if (hours < 0 || hours >= 24 || minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60)
    throw new Error('RA hours must be 0–23; minutes and seconds must be below 60.');
  return 15 * (hours + minutes / 60 + seconds / 3600);
}

export function parseDeclination(value) {
  const raw = String(value).trim();
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) return Number(raw);
  const values = parts(raw);
  if (values.length < 2 || values.length > 3 || values.some(value => !Number.isFinite(value)))
    throw new Error('Enter Dec as decimal degrees or degrees, minutes, seconds (−07d14m42.53s).');
  const sign = raw.startsWith('-') ? -1 : 1;
  const [degrees, minutes, seconds = 0] = values.map(Math.abs);
  if (degrees > 90 || minutes >= 60 || seconds >= 60)
    throw new Error('Dec degrees must be at most 90; minutes and seconds must be below 60.');
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

export function parsePosition({ ra, dec, fov }) {
  return validatePosition({
    ra: parseRightAscension(ra),
    dec: parseDeclination(dec),
    fov: Number(fov),
  });
}
