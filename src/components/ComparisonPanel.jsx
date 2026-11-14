import { useState } from 'react';
export default function ComparisonPanel() {
  const [mode, setMode] = useState('overlay');
  return (
    <section className="panel mobile:p-4.5 space-y-4 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]">
      <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
        04 / Compare
      </div>
      <h2>Look for change</h2>
      <div className="flex gap-2" role="group" aria-label="Comparison mode">
        {['overlay', 'difference'].map(value => (
          <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
            {value === 'overlay' ? 'Overlay' : 'Difference'}
          </button>
        ))}
      </div>
      <div className="placeholder rounded-[9px] px-3 py-5.5 text-[0.8rem] leading-loose text-[#a49aae] [border:1px_dashed_#42394e]">
        {mode === 'overlay'
          ? 'Aligned epoch layers + opacity control'
          : 'Registered, calibrated image subtraction'}
        <br />
        <span className="tag inline-block [align-self:start] rounded-[999px] px-2.5 py-1.5 text-[0.68rem] whitespace-nowrap text-[#aba5bb] [border:1px_solid_#39343f]">
          UI placeholder · not implemented
        </span>
      </div>
      <p className="muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]">
        Requires verified epoch images, astrometric registration, matching PSFs, and compatible flux
        units.
      </p>
    </section>
  );
}
