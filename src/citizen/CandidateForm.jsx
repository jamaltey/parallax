import { useRef, useState } from 'react';
import { CHANGE_TYPES, validateCandidate } from './model';
import { saveCandidate, communityError } from './api';
export default function CandidateForm({ marks, onSubmitted }) {
  const [type, setType] = useState('moving');
  const [confidence, setConfidence] = useState('low');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reportId = useRef(crypto.randomUUID());
  const first = marks[0];
  const input = {
    ra: first?.ra,
    dec: first?.dec,
    center_ra: first?.view.ra,
    center_dec: first?.view.dec,
    fov: first?.view.fov,
    type,
    confidence,
    description,
    observations: marks,
  };
  let invalid = '';
  try {
    validateCandidate(input);
  } catch (e) {
    invalid = e.message;
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await saveCandidate(input, reportId.current);
      onSubmitted(result.id);
    } catch (e) {
      setError(communityError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-violet-300/20 bg-[#17141e] p-5"
      aria-label="Submit candidate"
    >
      <h3 className="text-lg font-semibold">Submit a candidate</h3>
      <p className="text-xs leading-relaxed text-[#9a9aa3]">
        {marks.length} marked original exposures. Your browser gets an anonymous contributor
        identity when you submit. Clearing browser data loses access to that identity.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          Change type
          <select value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(CHANGE_TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Confidence
          <select value={confidence} onChange={e => setConfidence(e.target.value)}>
            {['low', 'medium', 'high'].map(v => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description (optional)
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-2 block w-full rounded-lg border border-white/20 bg-[#0b0b0e] p-3 text-sm text-[#ececef]"
        />
      </label>
      {first && (
        <p className="text-xs">
          RA {first.ra.toFixed(6)}° · Dec {first.dec.toFixed(6)}°
        </p>
      )}
      <p className="text-xs leading-relaxed text-[#9a9aa3]">
        A candidate needs further investigation. Confidence and community agreement are not
        scientific confirmation or a probability of Planet X. Different wavelengths and image
        artifacts can mimic changes.
      </p>
      {(error || invalid) && (
        <p role={error ? 'alert' : 'status'} className="text-sm text-rose-300">
          {error || invalid}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !!invalid}
        className="border-violet-300 bg-violet-400 text-[#110d1b]"
      >
        {busy ? 'Submitting…' : 'Submit candidate'}
      </button>
    </form>
  );
}
