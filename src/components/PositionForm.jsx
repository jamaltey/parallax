import { useEffect, useState } from 'react';
import { parsePosition } from '../lib/coordinates';
import { explorerUrl } from '../lib/explorerUrl';
import { CHALLENGE_TARGETS, positionAtEpoch } from '../lib/challengeTargets';

export default function PositionForm({ onApply, position }) {
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [fields, setFields] = useState(() => ({
    ra: String(position.ra),
    dec: String(position.dec),
    fov: String(position.fov),
  }));
  useEffect(
    () =>
      setFields({ ra: String(position.ra), dec: String(position.dec), fov: String(position.fov) }),
    [position.ra, position.dec, position.fov]
  );
  function submit(event) {
    event.preventDefault();
    try {
      onApply(parsePosition(fields));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  async function copy(kind) {
    const link = explorerUrl(position, {
      embed: kind === 'embed',
      origin: window.location.origin,
    });
    const value =
      kind === 'embed'
        ? `<iframe src="${link}" title="Parallax sky explorer" width="100%" height="900" loading="lazy"></iframe>`
        : link;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      setError('Could not copy automatically. Check your browser clipboard permission.');
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
      <div className="space-y-2">
        <p className="text-xs text-[#9a9aa3]">Try a challenge test target</p>
        <div className="flex flex-wrap gap-2">
          {CHALLENGE_TARGETS.map(target => (
            <button
              key={target.id}
              type="button"
              className="px-2.5 py-1.5 text-xs"
              onClick={() => {
                const next = positionAtEpoch(target);
                setFields({ ra: next.ra.toFixed(7), dec: next.dec.toFixed(7), fov: '2' });
                onApply(next);
                setError('');
              }}
            >
              {target.name}
            </button>
          ))}
        </div>
        <p className="text-[0.68rem] leading-relaxed text-[#777781]">
          High-proper-motion target positions are adjusted to the current observing year.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['ra', 'RA', '83.633 or 05h34m31.9s'],
          ['dec', 'Dec', '22.0145 or +22d00m52s'],
          ['fov', 'FOV / deg', '2'],
        ].map(([key, label, placeholder]) => (
          <label key={key}>
            {label}
            <input
              name={key}
              type="text"
              inputMode={key === 'fov' ? 'decimal' : 'text'}
              required
              placeholder={placeholder}
              value={fields[key]}
              onChange={event =>
                setFields(previous => ({ ...previous, [key]: event.target.value }))
              }
            />
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
        ICRS decimal degrees or sexagesimal coordinates. Shareable links preserve this sky position.
      </p>
      <details className="rounded-lg border border-white/10 p-3 text-sm">
        <summary className="cursor-pointer text-violet-200">Share or embed this view</summary>
        <p className="mt-3 text-xs leading-relaxed text-[#9a9aa3]">
          Copy a direct link, or an iframe that other websites can use to show this explorer.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => copy('link')}>
            {copied === 'link' ? 'Link copied' : 'Copy link'}
          </button>
          <button type="button" onClick={() => copy('embed')}>
            {copied === 'embed' ? 'Embed copied' : 'Copy embed code'}
          </button>
        </div>
      </details>
    </form>
  );
}
