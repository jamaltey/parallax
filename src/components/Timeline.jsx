export default function Timeline({ rows, index, setIndex, playing, setPlaying, speed, setSpeed }) {
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
            03 / Time machine
          </div>
          <h2>Observation timeline</h2>
        </div>
        <span className="tag inline-block [align-self:start] rounded-[999px] px-2.5 py-1.5 text-[0.68rem] whitespace-nowrap text-[#aba5bb] [border:1px_solid_#39343f]">
          {rows.length} epochs
        </span>
      </div>
      <p aria-live="polite">
        {row ? new Date(row.observedAt).toISOString().slice(0, 10) : 'No observations available'}
      </p>
      <input
        aria-label="Observation epoch"
        type="range"
        min="0"
        max={Math.max(0, rows.length - 1)}
        value={index}
        disabled={!rows.length}
        onChange={e => {
          setPlaying(false);
          setIndex(Number(e.target.value));
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!rows.length} onClick={() => step(-1)} aria-label="Previous epoch">
          ←
        </button>
        <button disabled={rows.length < 2} onClick={() => setPlaying(!playing)}>
          {playing ? 'Pause' : 'Play'} metadata
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
        Loops through observation metadata only. No epoch image playback is connected.
      </p>
    </section>
  );
}
