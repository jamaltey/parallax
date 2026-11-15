import { useState } from 'react';
import { validatePosition } from '../lib/coordinates';
export default function PositionForm({ onApply }) {
  const [error, setError] = useState('');
  function submit(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const position = validatePosition(
        Object.fromEntries(
          ['ra', 'dec', 'fov'].map(key => [
            key,
            data.get(key).trim() === '' ? NaN : Number(data.get(key)),
          ])
        )
      );
      onApply(position);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="panel mobile:p-4.5 space-y-4 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]"
    >
      <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
        Navigate
      </div>
      <h2>Choose your patch of sky</h2>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['ra', 'RA / deg', 83.633],
          ['dec', 'Dec / deg', 22.0145],
          ['fov', 'FOV / deg', 2],
        ].map(([key, label, value]) => (
          <label key={key}>
            {label}
            <input name={key} type="number" step="any" required defaultValue={value} />
          </label>
        ))}
      </div>
      <button
        className="primary w-full border-(--accent) bg-(--accent) font-semibold text-[#110d1b] [&:hover]:border-[#bda6fb] [&:hover]:bg-[#bda6fb] [&:hover]:text-[#110d1b]"
        type="submit"
      >
        Explore coordinates ↗
      </button>
      {error && (
        <p role="alert" className="error text-[0.85rem] text-[#fda4af]">
          {error}
        </p>
      )}
      <p className="muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]">
        ICRS decimal degrees. Starts near the Crab Nebula.
      </p>
    </form>
  );
}
