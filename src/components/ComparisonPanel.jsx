const formatDate = value =>
  value ? new Date(value).toISOString().replace('T', ' ').slice(0, 23) : '—';
const microns = value => (Number.isFinite(value) ? `${(value * 1e6).toFixed(3)} µm` : 'unknown');

export function spectralWarnings(a, b) {
  if (!a || !b) return [];
  const warnings = [];
  if (a.band !== b.band) warnings.push(`Different detector bands: ${a.band} versus ${b.band}.`);
  const tolerance = 1e-12;
  if (
    Math.abs(a.wavelengthMin - b.wavelengthMin) > tolerance ||
    Math.abs(a.wavelengthMax - b.wavelengthMax) > tolerance
  )
    warnings.push('Nominal wavelength bounds differ between the observations.');
  warnings.push(
    'SPHEREx wavelength varies across each detector; per-pixel wavelength equivalence is not established.'
  );
  return warnings;
}

function ObservationCard({ label, frame }) {
  if (!frame) return null;
  return (
    <div className="space-y-1 rounded-lg border border-white/10 bg-black/15 p-3 text-xs">
      <strong className="text-violet-200">{label}</strong>
      <p className="truncate" title={frame.obsId}>
        {frame.obsId}
      </p>
      <p className="text-[#9a9aa3]">{formatDate(frame.observedAt)} UTC</p>
      <p className="text-[#9a9aa3]">
        {frame.collection?.replace('spherex_', '').toUpperCase()} · {frame.band} ·{' '}
        {microns(frame.wavelengthMin)}–{microns(frame.wavelengthMax)}
      </p>
    </div>
  );
}

export default function ComparisonPanel({ frames, value, onChange, status, compact = false }) {
  const a = frames.find(frame => frame.id === value.aId);
  const b = frames.find(frame => frame.id === value.bId);
  const selectable = frames.length >= 2 && a && b && a.id !== b.id;
  const warnings = spectralWarnings(a, b);
  const set = patch => onChange(current => ({ ...current, ...patch }));
  const rawUnavailable = status.stats && !status.stats.rawCompatible;

  return (
    <section className="panel mobile:p-4.5 space-y-4 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
            Compare
          </div>
          <h2 className="mt-2 text-[1.1rem] font-semibold">Align two observations</h2>
        </div>
        <button
          disabled={value.mode === 'original'}
          onClick={() => set({ mode: 'original', blink: false })}
        >
          Original view
        </button>
      </div>
      <p className="text-xs leading-relaxed text-[#9a9aa3]">
        Choose two timeline images. Parallax aligns their original float32 pixels by celestial WCS;
        derived views never replace NASA provenance.
      </p>
      {frames.length < 2 ? (
        <p className="rounded-lg border border-dashed border-[#42394e] p-3 text-xs text-[#aaa2bb]">
          Open at least two real SPHEREx images to enable comparison.
        </p>
      ) : (
        <>
          <div className={`grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
            <label className="text-xs">
              Reference A
              <select value={value.aId} onChange={event => set({ aId: event.target.value })}>
                {frames.map((frame, index) => (
                  <option key={frame.id} value={frame.id}>
                    {index + 1}. {frame.obsId} · {frame.band}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              Comparison B
              <select value={value.bId} onChange={event => set({ bId: event.target.value })}>
                {frames.map((frame, index) => (
                  <option key={frame.id} value={frame.id}>
                    {index + 1}. {frame.obsId} · {frame.band}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={`grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
            <ObservationCard label="A · reference" frame={a} />
            <ObservationCard label="B · comparison" frame={b} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={!selectable}
              onClick={() => set({ aId: value.bId, bId: value.aId, blink: false })}
            >
              Swap A ↔ B
            </button>
            <button
              onClick={() =>
                onChange(current => ({
                  ...current,
                  mode: 'original',
                  aId: frames[0]?.id || '',
                  bId: frames[1]?.id || '',
                  opacity: 50,
                  blink: false,
                  method: 'raw',
                  contrast: 1,
                }))
              }
            >
              Reset comparison
            </button>
            {['original', 'overlay', 'difference'].map(mode => (
              <button
                key={mode}
                aria-pressed={value.mode === mode}
                disabled={mode !== 'original' && !selectable}
                onClick={() => set({ mode, blink: false })}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </>
      )}

      {value.mode === 'overlay' && selectable && (
        <div className="space-y-3 rounded-lg border border-white/10 p-3">
          <label className="block text-xs">
            Blend toward B · {value.opacity}%
            <input
              aria-label="Overlay opacity"
              type="range"
              min="0"
              max="100"
              value={value.opacity}
              disabled={value.blink}
              onChange={event => set({ opacity: Number(event.target.value) })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button aria-pressed={value.blink} onClick={() => set({ blink: !value.blink })}>
              {value.blink ? 'Stop blinking' : 'Blink A / B'}
            </button>
            <label className="text-xs">
              Blink rate
              <select
                value={value.blinkMs}
                onChange={event => set({ blinkMs: Number(event.target.value) })}
              >
                <option value="1500">Slow</option>
                <option value="800">Normal</option>
                <option value="400">Fast</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-[#9a9aa3]">
            0% shows aligned A; 100% shows aligned B. Both use the same robust intensity cuts.
          </p>
        </div>
      )}

      {value.mode === 'difference' && selectable && (
        <div className="space-y-3 rounded-lg border border-white/10 p-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Difference method">
            <button
              aria-pressed={value.method === 'raw'}
              disabled={rawUnavailable}
              onClick={() => set({ method: 'raw' })}
            >
              Raw B − A
            </button>
            <button
              aria-pressed={value.method === 'normalized'}
              onClick={() => set({ method: 'normalized' })}
            >
              Normalized visual
            </button>
          </div>
          <label className="block text-xs">
            Residual sensitivity · {value.contrast.toFixed(1)}×
            <input
              aria-label="Difference sensitivity"
              type="range"
              min="0.5"
              max="4"
              step="0.1"
              value={value.contrast}
              onChange={event => set({ contrast: Number(event.target.value) })}
            />
          </label>
          <div className="space-y-1 text-xs text-[#9a9aa3]">
            <div className="h-2 rounded bg-linear-to-r from-[#2166ac] via-[#17171d] to-[#b2182b]" />
            <div className="flex justify-between gap-3">
              <span>Negative · brighter in A</span>
              <span>Near zero</span>
              <span>Positive · brighter in B</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-[#9a9aa3]">
            A moving source can leave a negative earlier-position residual and a positive
            later-position residual. Noise, wavelength differences, backgrounds, PSFs, and artifacts
            can do this too.
          </p>
        </div>
      )}

      {value.mode !== 'original' && (
        <div className="space-y-2 text-xs">
          <p role="status" className={status.error ? 'text-rose-300' : 'text-violet-200'}>
            {status.error || status.message || 'Choose two observations to begin.'}
          </p>
          {status.stats && (
            <p className="text-[#9a9aa3]">
              Valid overlap: {(status.stats.overlapFraction * 100).toFixed(1)}% ·{' '}
              {status.stats.validCount.toLocaleString()} pixels · aligned in{' '}
              {(status.stats.elapsedMs / 1000).toFixed(1)} s
              {status.stats.unitA ? ` · units: ${status.stats.unitA}` : ' · units unavailable'}
            </p>
          )}
          {(warnings.length > 0 || rawUnavailable) && (
            <ul className="list-disc space-y-1 pl-4 text-amber-200/90">
              {rawUnavailable && (
                <li>
                  Raw subtraction is blocked because both images do not declare the same physical
                  unit.
                </li>
              )}
              {warnings.map(warning => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-xs leading-relaxed text-[#9a9aa3]">
        Comparison views are exploratory. No PSF matching, per-pixel wavelength matching, calibrated
        photometry, source detection, or scientific confirmation is performed.
      </p>
    </section>
  );
}
