import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SkyViewer from '../components/SkyViewer';
import Timeline from '../components/Timeline';
import ComparisonPanel from '../components/ComparisonPanel';
import CandidateForm from './CandidateForm';
import { validateExposure } from './model';
import { preloadExposureDisplays } from '../lib/prepareExposure';

export default function ObservationWorkspace({
  position,
  initialFrames = [],
  investigation = false,
  revealReporter = false,
  onInspected,
  skyControlsHost,
  skyControlsInSidebar = false,
  comparisonHost,
  comparisonInSidebar = false,
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
  const [comparison, setComparison] = useState({
    mode: 'original',
    aId: initialFrames[0]?.id || '',
    bId: initialFrames[1]?.id || '',
    opacity: 50,
    blink: false,
    blinkMs: 800,
    method: 'raw',
    contrast: 1,
  });
  const [comparisonStatus, setComparisonStatus] = useState({ message: '', error: '', stats: null });
  const preloadController = useRef(null);
  const [preload, setPreload] = useState({
    running: false,
    completed: 0,
    total: 0,
    failed: 0,
    storageFailed: 0,
  });
  const current = active ? frames[index] : null;
  const visibleMarkers = useMemo(
    () =>
      frames.flatMap((frame, frameIndex) => {
        const mark = marks[frame.id];
        return mark
          ? [{ ...mark, timelineIndex: frameIndex + 1, isActive: frame.id === current?.id }]
          : [];
      }),
    [frames, marks, current?.id]
  );
  const nearbyFrames = useMemo(() => {
    if (!active || frames.length < 2) return [];
    const seen = new Set([current?.id]);
    return [1, -1, 2]
      .map(offset => frames[(index + offset + frames.length) % frames.length])
      .filter(frame => frame && !seen.has(frame.id) && seen.add(frame.id));
  }, [active, frames, index, current?.id]);
  const reporterMarkers = useMemo(
    () =>
      revealReporter
        ? initialFrames.flatMap((frame, frameIndex) =>
            Number.isFinite(frame.ra) && Number.isFinite(frame.dec)
              ? [{ ...frame, timelineIndex: frameIndex + 1 }]
              : []
          )
        : [],
    [initialFrames, revealReporter]
  );
  const comparisonView = {
    ...comparison,
    a: frames.find(frame => frame.id === comparison.aId),
    b: frames.find(frame => frame.id === comparison.bId),
  };
  const comparisonActive =
    comparison.mode !== 'original' &&
    comparisonView.a &&
    comparisonView.b &&
    comparisonView.a.id !== comparisonView.b.id;
  const markingUnavailable = !current
    ? 'Find images below, then send all results to the timeline or open one image. You can mark an object once its image is ready.'
    : !ready
      ? 'Marking will be available once this exposure loads successfully. If loading fails, use Retry in the viewer.'
      : comparisonActive
        ? 'Return to Original view to place or confirm markers in the source observation.'
        : playing
          ? 'Pause the observation timeline to mark an object.'
          : '';
  const comparisonPanel = (
    <div data-tour="compare">
      <ComparisonPanel
        frames={frames}
        value={comparison}
        compact={comparisonInSidebar}
        onChange={updater => {
          setPlaying(false);
          setMarkMode(false);
          setComparison(updater);
        }}
        status={comparisonStatus}
      />
    </div>
  );
  useEffect(() => {
    if (!playing || !ready || !active || frames.length < 2) return;
    const timer = setTimeout(() => {
      setReady(false);
      setMarkMode(false);
      setIndex(i => (i + 1) % frames.length);
    }, speed);
    return () => clearTimeout(timer);
  }, [playing, ready, active, index, frames.length, speed]);
  useEffect(() => {
    setComparison(previous => {
      const aId = frames.some(frame => frame.id === previous.aId)
        ? previous.aId
        : frames[0]?.id || '';
      const bId =
        frames.some(frame => frame.id === previous.bId) && previous.bId !== aId
          ? previous.bId
          : frames.find(frame => frame.id !== aId)?.id || '';
      return {
        ...previous,
        aId,
        bId,
        mode: frames.length >= 2 && aId && bId ? previous.mode : 'original',
        blink: frames.length >= 2 && aId && bId ? previous.blink : false,
      };
    });
  }, [frames]);
  useEffect(() => {
    if (
      comparisonStatus.stats &&
      !comparisonStatus.stats.rawCompatible &&
      comparison.method === 'raw'
    )
      setComparison(previous => ({ ...previous, method: 'normalized' }));
  }, [comparisonStatus.stats, comparison.method]);
  useEffect(() => () => preloadController.current?.abort(), []);

  function preloadSequence(rows) {
    preloadController.current?.abort();
    const controller = new AbortController();
    preloadController.current = controller;
    setPreload({ running: true, completed: 0, total: rows.length, failed: 0, storageFailed: 0 });
    preloadExposureDisplays(rows, {
      signal: controller.signal,
      concurrency: 2,
      onProgress: progress => {
        if (preloadController.current === controller && !controller.signal.aborted)
          setPreload({ running: progress.completed < progress.total, ...progress });
      },
    }).then(result => {
      if (preloadController.current === controller && !controller.signal.aborted)
        setPreload({ running: false, ...result });
    });
  }
  function cancelPreload() {
    preloadController.current?.abort();
    setPreload(previous => ({ ...previous, running: false }));
  }
  function add(frame) {
    try {
      validateExposure(frame);
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
  function loadSequence(rows) {
    try {
      if (!Array.isArray(rows) || !rows.length) throw new Error('No observations to load.');
      if (rows.length > 50) throw new Error('A browsing timeline can contain up to 50 exposures.');
      const unique = [];
      const ids = new Set();
      for (const row of rows) {
        validateExposure(row);
        if (!ids.has(row.id)) {
          ids.add(row.id);
          unique.push(row);
        }
      }
      if (!unique.length) throw new Error('No valid observations to load.');
      setFrames(unique);
      setMarks(previous =>
        Object.fromEntries(Object.entries(previous).filter(([id]) => ids.has(id)))
      );
      setIndex(0);
      setActive(true);
      setReady(false);
      setPlaying(false);
      setMarkMode(false);
      setReport(false);
      setError('');
      preloadSequence(unique);
    } catch (e) {
      setError(e.message);
    }
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
          <div className="max-h-52 space-y-2 overflow-auto pr-1">
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
            disabled={!current || !ready || playing || comparisonActive}
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
                cancelPreload();
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
        {visibleMarkers.length > 0 && (
          <p className="text-xs leading-relaxed text-[#9a9aa3]">
            <span className="text-violet-300">Violet</span> marks belong to this image.{' '}
            <span className="text-cyan-300">Cyan</span> marks come from other timeline images and
            stay at the same sky coordinates while you switch frames.
          </p>
        )}
      </section>
      {comparisonInSidebar
        ? comparisonHost && createPortal(comparisonPanel, comparisonHost)
        : comparisonPanel}
      <SkyViewer
        position={position}
        exposure={current}
        prefetchExposures={nearbyFrames}
        markers={visibleMarkers}
        reporterMarkers={reporterMarkers}
        markMode={markMode}
        comparison={comparisonView}
        onComparisonState={setComparisonStatus}
        onMark={mark => {
          setMarks(prev => ({ ...prev, [mark.id]: mark }));
          setMarkMode(false);
        }}
        onAddExposure={investigation ? undefined : add}
        onLoadExposures={investigation ? undefined : loadSequence}
        onExposureReady={loaded}
        controlsHost={skyControlsHost}
        controlsInSidebar={skyControlsInSidebar}
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
            preload={preload}
            onCancelPreload={cancelPreload}
          />
        ) : (
          <p className="rounded-xl border border-white/10 p-5 text-sm text-[#9a9aa3]">
            Find SPHEREx images below, then add all results to the timeline to browse them with the
            slider.
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
