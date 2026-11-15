export default function Timeline({
  rows,
  index,
  setIndex,
  playing,
  setPlaying,
  speed,
  setSpeed,
  imageMode = false,
  busy = false,
  preload,
  onCancelPreload,
}) {
  const row = rows[index];
  const step = delta => {
    setPlaying(false);
    setIndex((index + delta + rows.length) % rows.length);
  };
  return (
    <section className="panel mobile:p-4.5 space-y-4 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]">
      <div className="flex justify-between gap-3">
        <div>
          <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
            Time machine
          </div>
          <h2>Observation timeline</h2>
        </div>
        <span className="tag inline-block [align-self:start] rounded-[999px] px-2.5 py-1.5 text-[0.68rem] whitespace-nowrap text-[#aba5bb] [border:1px_solid_#39343f]">
          {rows.length} images
        </span>
      </div>
      <p aria-live="polite">
        {row
          ? `${imageMode ? `Image ${index + 1} of ${rows.length} · ` : ''}${new Date(row.observedAt).toISOString().slice(0, imageMode ? 23 : 10)}` +
            (imageMode ? ' UTC' : '')
          : 'No observations available'}
      </p>
      <input
        aria-label="Observation epoch"
        type="range"
        min="0"
        max={Math.max(0, rows.length - 1)}
        value={index}
        disabled={!rows.length}
        aria-valuetext={row ? `Image ${index + 1} of ${rows.length}` : 'No images'}
        onChange={e => {
          setPlaying(false);
          setIndex(Number(e.target.value));
        }}
      />
      {imageMode && preload?.total > 0 && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[#aaa2bb]">
            <span>
              {preload.running
                ? `Preparing all images · ${preload.completed} of ${preload.total}`
                : preload.failed
                  ? `Prepared ${preload.total - preload.failed} of ${preload.total} images`
                  : `All ${preload.total} images prepared`}
            </span>
            <span className="flex items-center gap-3">
              {Math.round((100 * preload.completed) / preload.total)}%
              {preload.running && onCancelPreload && (
                <button className="px-2 py-1 text-xs" onClick={onCancelPreload}>
                  Stop preloading
                </button>
              )}
            </span>
          </div>
          <progress
            className="h-1.5 w-full accent-violet-400"
            max={preload.total}
            value={preload.completed}
          />
          {(preload.failed > 0 || preload.storageFailed > 0) && (
            <p className="text-xs leading-relaxed text-amber-200">
              {preload.failed > 0
                ? `${preload.failed} images could not be prepared and will retry when selected. `
                : ''}
              {preload.storageFailed > 0
                ? 'Browser storage is limited, so some prepared images may need quick reprocessing when selected.'
                : ''}
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!rows.length} onClick={() => step(-1)} aria-label="Previous epoch">
          ←
        </button>
        <button
          disabled={rows.length < 2 || (imageMode && busy && !playing)}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? 'Pause' : 'Play'} {imageMode ? 'images' : 'metadata'}
        </button>
        <button disabled={!rows.length} onClick={() => step(1)} aria-label="Next epoch">
          →
        </button>
        <label className="ml-auto">
          Speed
          <select value={speed} onChange={e => setSpeed(Number(e.target.value))}>
            <option value="1500">Slow</option>
            <option value="800">Normal</option>
            <option value="350">Fast</option>
          </select>
        </label>
      </div>
      <p className="muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]">
        {imageMode
          ? 'Original exposure images load as you select them. Viewed images are cached for faster switching and playback; wavelengths can vary across the detector.'
          : 'Loops through observation metadata only. No epoch image playback is connected.'}
      </p>
    </section>
  );
}
