// Runtime-independent coordinate validation shared by all transports.
export function validatePosition({ ra, dec, fov }) {
  if (![ra, dec, fov].every(Number.isFinite))
    throw new Error('Enter numeric coordinates and field of view.');
  if (ra < 0 || ra >= 360) throw new Error('RA must be at least 0 and below 360 degrees.');
  if (dec < -90 || dec > 90) throw new Error('Dec must be between −90 and +90 degrees.');
  if (fov < 0.01 || fov > 180) throw new Error('FOV must be between 0.01 and 180 degrees.');
  return { ra, dec, fov };
}
