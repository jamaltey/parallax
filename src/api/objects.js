export async function identifyObject({ ra, dec, radius, signal }) {
  const params = new URLSearchParams({
    ra: String(ra),
    dec: String(dec),
    radius: String(radius),
  });
  const response = await fetch(`/api/object-lookup?${params}`, { signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error || 'Could not identify this position.');
    error.noMatch = body.noMatch === true;
    throw error;
  }
  if (
    !body.name ||
    !Number.isFinite(body.ra) ||
    !Number.isFinite(body.dec) ||
    !Number.isFinite(body.separationArcsec) ||
    !/^https:\/\/simbad\.(?:cfa\.harvard\.edu|idia\.ac\.za)\//.test(body.objectUrl)
  )
    throw new Error('The object service returned an invalid response.');
  return body;
}
