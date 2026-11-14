import { useEffect, useRef, useState } from 'react';
import { searchSpherex, SPHEREX_TUTORIAL } from '../api/spherex';

export default function SpherexArchive({ position }) {
  const [collection, setCollection] = useState('spherex_dr1');
  const [state, setState] = useState({ rows: [], loading: false, error: '', searched: false });
  const request = useRef(null);
  useEffect(() => {
    request.current?.abort();
    setState({ rows: [], loading: false, error: '', searched: false });
    return () => request.current?.abort();
  }, [position, collection]);
  async function search() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setState({ rows: [], loading: true, error: '', searched: false });
    const timer = setTimeout(
      () => controller.abort(new Error('IRSA search timed out. Please retry.')),
      30000
    );
    try {
      const rows = await searchSpherex(position, collection, { signal: controller.signal });
      if (request.current === controller && !controller.signal.aborted)
        setState({ rows, loading: false, error: '', searched: true });
    } catch (error) {
      if (request.current === controller && error.name !== 'AbortError')
        setState({
          rows: [],
          loading: false,
          error: error.message || 'Could not reach IRSA. Please retry.',
          searched: false,
        });
    } finally {
      clearTimeout(timer);
    }
  }
  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <p className="text-xs leading-relaxed text-[#9a9aa3]">
        Find real spectral exposures covering the applied coordinates: RA {position.ra}°, Dec{' '}
        {position.dec}°. Searches use a 1 arcsecond radius; FOV controls only the atlas.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1">
          Archive collection
          <select value={collection} onChange={event => setCollection(event.target.value)}>
            <option value="spherex_dr1">DR1 · wide survey</option>
            <option value="spherex_qr3">QR3 · wide survey</option>
          </select>
        </label>
        <button onClick={search} disabled={state.loading}>
          {state.loading ? 'Searching IRSA…' : 'Find SPHEREx exposures'}
        </button>
      </div>
      <p className="text-xs leading-relaxed text-[#9a9aa3]">
        Results link to original multi-extension FITS files. These downloads do not drive the demo
        timeline.{' '}
        <a className="underline" href={SPHEREX_TUTORIAL} target="_blank" rel="noreferrer">
          IRSA data tutorial ↗
        </a>
      </p>
      {state.error && (
        <p role="alert" className="text-xs text-rose-300">
          {state.error}
        </p>
      )}
      {state.searched && (
        <p role="status" className="text-xs text-[#9a9aa3]">
          {state.rows.length
            ? `${state.rows.length} exposures returned${state.rows.length >= 50 ? ' (request limit: 50; more may exist)' : ''}. Dates are UTC.`
            : 'No exposures returned for these coordinates and collection.'}
        </p>
      )}
      {state.rows.length > 0 && (
        <ul
          className="max-h-64 space-y-3 overflow-auto text-xs"
          aria-label="SPHEREx archive results"
        >
          {state.rows.map(row => (
            <li key={row.id} className="border-t border-white/10 pt-3">
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="break-all text-violet-300 underline"
              >
                {row.obsId} · {row.band} ↗
              </a>
              <p className="mt-1 text-[#9a9aa3]">
                {row.observedAt
                  ? row.observedAt.replace('T', ' ').replace('Z', ' UTC')
                  : 'Observation date unavailable'}
                {row.sizeKB ? ` · ${(row.sizeKB / 1024).toFixed(1)} MB` : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
