import { useEffect, useState } from 'react';
import SkyViewer from '../components/SkyViewer';
import Timeline from '../components/Timeline';
import CandidateForm from './CandidateForm';
import { validateExposure } from './model';

export default function ObservationWorkspace({
  position,
  initialFrames = [],
  investigation = false,
  revealReporter = false,
  onInspected,
}) {
  const [frames, setFrames] = useState(initialFrames);
  const [index, setIndex] = useState(0);
  const [active, setActive] = useState(initialFrames.length > 0);
  const [marks, setMarks] = useState({});
  const [markMode, setMarkMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1500);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState(false);
  const [visited, setVisited] = useState([]);
  const current = active ? frames[index] : null;
  const markingUnavailable = !current
    ? 'Start with “Find images here” below, then choose “Open image”. You can mark an object once the image is ready.'
    : !ready
      ? 'Marking will be available once this exposure loads successfully. If loading fails, use Retry in the viewer.'
      : playing
        ? 'Pause the observation timeline to mark an object.'
        : '';
  useEffect(() => {
    if (!playing || !ready || !active || frames.length < 2) return;
    const timer = setTimeout(() => {
      setReady(false);
      setMarkMode(false);
      setIndex(i => (i + 1) % frames.length);
    }, speed);
    return () => clearTimeout(timer);
  }, [playing, ready, active, index, frames.length, speed]);
  function add(frame) {
    try {
      validateExposure(frame);
      if (frames.length >= 12 && !frames.some(f => f.id === frame.id))
        throw new Error('A sequence can contain up to 12 exposures.');
    } catch (e) {
      setError(e.message);
      return;
    }
    setError('');
    setReady(false);
    setPlaying(false);
    setMarkMode(false);
    const found = frames.findIndex(f => f.id === frame.id);
    if (found < 0) {
      setFrames([...frames, frame]);
      setIndex(frames.length);
    } else setIndex(found);
    setActive(true);
  }
  function select(i) {
    if (active && i === index) return;
    setReady(false);
    setPlaying(false);
    setMarkMode(false);
    setIndex(i);
    setActive(true);
  }
  function loaded(ok, metadata) {
    setReady(ok);
    if (!ok || !metadata) return;
    setFrames(prev => prev.map(f => (f.id === metadata.id ? metadata : f)));
    setVisited(prev => {
      const next = prev.includes(metadata.id) ? prev : [...prev, metadata.id];
      return next;
    });
  }
  useEffect(() => {
    onInspected?.(initialFrames.length > 0 && initialFrames.every(f => visited.includes(f.id)));
  }, [visited, initialFrames, onInspected]);
  function removeFrame(id) {
    setFrames(prev => prev.filter(f => f.id !== id));
    setMarks(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setIndex(0);
    if (current?.id !== frames.filter(f => f.id !== id)[0]?.id) setReady(false);
    setPlaying(false);
    setMarkMode(false);
    if (frames.length === 1) setActive(false);
  }
  return (
    <div className="space-y-4">
      <section
        className="space-y-3 rounded-xl border border-white/10 bg-[#141418] p-5"
        aria-label="Citizen science tools"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">
            {investigation ? 'Investigate the original sequence' : 'Spot something interesting?'}
          </h3>
          {!investigation && (
            <a className="text-sm text-violet-300 underline" href="/community">
              Community ↗
            </a>
          )}
        </div>
        <p className="text-xs leading-relaxed text-[#9a9aa3]">
          {investigation
            ? 'Inspect each saved exposure before assessing the report. Your own markers start empty.'
            : '1. Find an image → 2. Mark an object → 3. Share it for community review.'}
        </p>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        {frames.length > 0 && (
          <div className="space-y-2">
            {frames.map((frame, i) => (
              <div key={frame.id} className="flex items-center gap-2 text-xs">
                <button
                  className="min-w-0 flex-1 truncate text-left"
                  aria-pressed={active && i === index}
                  onClick={() => select(i)}
                >
                  {i + 1}. {frame.obsId} · {frame.band}
                  {marks[frame.id] ? ' · marked' : ''}
                </button>
                {!investigation && (
                  <button
                    onClick={() => removeFrame(frame.id)}
                    aria-label={`Remove exposure ${i + 1}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            aria-pressed={markMode}
            aria-describedby={markingUnavailable ? 'marking-unavailable' : undefined}
            disabled={!current || !ready || playing}
            onClick={() => setMarkMode(v => !v)}
          >
            {markMode ? 'Cancel marking' : marks[current?.id] ? 'Reposition marker' : 'Mark Object'}
          </button>
          {marks[current?.id] && (
            <button
              onClick={() =>
                setMarks(prev => {
                  const next = { ...prev };
                  delete next[current.id];
                  return next;
                })
              }
            >
              Remove marker
            </button>
          )}
          {active && !investigation && (
            <button
              onClick={() => {
                setActive(false);
                setReady(false);
                setMarkMode(false);
                setPlaying(false);
              }}
            >
              Back to sky map / find images
            </button>
          )}
          {!investigation && (
            <button disabled={!Object.keys(marks).length} onClick={() => setReport(v => !v)}>
              {report ? 'Close report' : 'Report candidate'}
            </button>
          )}
        </div>
        {markingUnavailable && (
          <p
            id="marking-unavailable"
            role="status"
            className="text-xs leading-relaxed text-[#9a9aa3]"
          >
            {markingUnavailable}
          </p>
        )}
        {markMode && (
          <p role="status" className="text-sm text-violet-200">
            Click the object in the loaded exposure. Clicking again replaces its marker.
          </p>
        )}
        {marks[current?.id] && (
          <p className="text-xs text-violet-200">
            Marked RA {marks[current.id].ra.toFixed(6)}° · Dec {marks[current.id].dec.toFixed(6)}°
          </p>
        )}
      </section>
      <SkyViewer
        position={investigation && current?.view ? current.view : position}
        exposure={current}
        marker={marks[current?.id]}
        reporterMarker={revealReporter ? initialFrames.find(f => f.id === current?.id) : null}
        markMode={markMode}
        onMark={mark => {
          setMarks(prev => ({ ...prev, [mark.id]: mark }));
          setMarkMode(false);
        }}
        onAddExposure={investigation ? undefined : add}
        onExposureReady={loaded}
      />
      <div data-tour="timeline">
        {active ? (
          <Timeline
            rows={frames}
            index={index}
            setIndex={select}
            playing={playing}
            setPlaying={setPlaying}
            speed={speed}
            setSpeed={setSpeed}
            imageMode
            busy={!ready}
          />
        ) : (
          <p className="rounded-xl border border-white/10 p-5 text-sm text-[#9a9aa3]">
            Your observation timeline starts when you open an image. Open more images to compare
            their observation dates.
          </p>
        )}
      </div>
      {report && !investigation && (
        <CandidateForm
          marks={frames.map(f => marks[f.id]).filter(Boolean)}
          onSubmitted={id => {
            window.location.assign(`/community/${id}`);
          }}
        />
      )}
    </div>
  );
}
