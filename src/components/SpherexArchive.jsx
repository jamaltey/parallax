import { useEffect, useRef, useState } from 'react';
import { searchSpherex, SPHEREX_TUTORIAL } from '../api/spherex';

export default function SpherexArchive({ position, onAddExposure }) {
  const [collection, setCollection] = useState('spherex_dr1');
  const [state, setState] = useState({ rows: [], loading: false, error: '', searched: false });
  const request = useRef(null);
  useEffect(() => {
    request.current?.abort();
    search();
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Ready to investigate?</h3>
          <p className="text-xs leading-relaxed text-[#9a9aa3]">
            Find individual SPHEREx images at your selected sky position, then open one to mark an
            object.
          </p>
        </div>
        <button onClick={search} disabled={state.loading}>
          {state.loading ? 'Finding images…' : 'Find images here'}
        </button>
      </div>
      <details className="text-xs text-[#9a9aa3]">
        <summary className="cursor-pointer">Search options & data source</summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            Data release
            <select value={collection} onChange={event => setCollection(event.target.value)}>
              <option value="spherex_dr1">DR1 · default</option>
              <option value="spherex_qr3">QR3</option>
            </select>
          </label>
          <p className="leading-relaxed">
            Searching around RA {position.ra}°, Dec {position.dec}° with a 1 arcsecond radius.
            Changing the viewer zoom does not change this search area. Results come from the IRSA
            archive. Opening an image adds it to your investigation; downloading its original FITS
            file does not change the viewer.
          </p>
          <a className="underline" href={SPHEREX_TUTORIAL} target="_blank" rel="noreferrer">
            Official data tutorial ↗
          </a>
        </div>
      </details>
      {state.error && (
        <p role="alert" className="text-xs text-rose-300">
          {state.error}
        </p>
      )}
      {state.searched && (
        <p role="status" className="text-xs text-[#9a9aa3]">
          {state.rows.length
            ? `${state.rows.length} images found${state.rows.length >= 50 ? ' (request limit: 50; more may exist)' : ''}. Dates are UTC.`
            : 'No images found for these coordinates and collection.'}
        </p>
      )}
      {state.rows.length > 0 && (
        <ul
          className="max-h-64 space-y-3 overflow-auto text-xs"
          aria-label="SPHEREx archive results"
        >
          {state.rows.map(row => (
            <li key={row.id} className="border-t border-white/10 pt-3">
              <p className="font-medium text-[#e4e4e9]">
                {row.observedAt
                  ? new Date(row.observedAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'UTC',
                    }) + ' UTC'
                  : 'Observation date unavailable'}
              </p>
              <details className="mt-2 text-[#9a9aa3]">
                <summary className="cursor-pointer">Image details & download</summary>
                <p className="my-2 break-all">
                  {row.obsId} · {row.band}
                </p>
                <a
                  href={row.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-violet-300 underline"
                >
                  Original FITS file ↗{row.sizeKB ? ` · ${(row.sizeKB / 1024).toFixed(1)} MB` : ''}
                </a>
              </details>
              {onAddExposure && (
                <button className="mt-2" onClick={() => onAddExposure(row)}>
                  Open image
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
