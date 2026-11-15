import { useEffect, useId, useRef, useState } from 'react';
import { loadAladin } from '../lib/aladin';
import { SAMPLE_IMAGES, sampleImageUrl } from '../api/sampleImages';
import {
  getSpherexCube,
  cubeFrameFrequency,
  SPHEREX_HIPS,
  SPHEREX_CUBE_TUTORIAL,
} from '../api/spherex';
import SpherexArchive from './SpherexArchive';
import { loadSpherexExposure } from '../lib/loadExposure';
import { isCurrentComparisonJob, overlayOpacities } from '../lib/comparison';
export default function SkyViewer({
  position,
  exposure = null,
  marker,
  reporterMarker,
  onMark,
  onAddExposure,
  onExposureReady,
  markMode = false,
  comparison,
  onComparisonState,
}) {
  const [sampleId, setSampleId] = useState('spherex');
  const [attempt, setAttempt] = useState(0);
  // A fresh atlas prevents a stalled remote survey request from blocking FITS loading.
  return (
    <SkyViewerInstance
      key={`${exposure?.id || sampleId}-${attempt}`}
      exposure={exposure}
      marker={marker}
      reporterMarker={reporterMarker}
      onMark={onMark}
      onAddExposure={onAddExposure}
      onExposureReady={onExposureReady}
      markMode={markMode}
      comparison={comparison}
      onComparisonState={onComparisonState}
      position={position}
      sampleId={sampleId}
      setSampleId={setSampleId}
      retry={() => setAttempt(value => value + 1)}
    />
  );
}

function SkyViewerInstance({
  position,
  sampleId,
  setSampleId,
  retry,
  exposure,
  marker,
  reporterMarker,
  onMark,
  onAddExposure,
  onExposureReady,
  markMode,
  comparison,
  onComparisonState,
}) {
  const id = `sky-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const viewer = useRef(null);
  const cubeLayer = useRef(null);
  const [cube, setCube] = useState(null);
  const [channel, setChannel] = useState(62);
  const isSpherex = !exposure && sampleId === 'spherex';
  const science = useRef(null);
  const callbacks = useRef({ onMark, onExposureReady, onComparisonState, markMode });
  callbacks.current = { onMark, onExposureReady, onComparisonState, markMode };
  const [markError, setMarkError] = useState('');
  const latest = useRef(position);
  latest.current = position;
  const [status, setStatus] = useState('Loading Aladin Lite…');
  const [ready, setReady] = useState(false);
  const [sampleState, setSampleState] = useState({ loading: false, error: '', loaded: false });
  const [comparisonResult, setComparisonResult] = useState(null);
  const [comparisonDisplay, setComparisonDisplay] = useState({
    loading: false,
    error: '',
    loaded: false,
  });
  const comparisonJob = useRef(0);
  const comparisonLayers = useRef({ a: null, b: null, difference: null });
  const comparisonView = useRef(null);
  const sample = SAMPLE_IMAGES.find(item => item.id === sampleId);
  const comparisonActive =
    comparison?.mode !== 'original' &&
    comparison?.a &&
    comparison?.b &&
    comparison.a.id !== comparison.b.id;

  useEffect(() => {
    let cancelled = false;
    loadAladin()
      .then(A => {
        if (cancelled) return;
        const p = latest.current;
        viewer.current = A.aladin(`#${id}`, {
          survey: [],
          target: `${p.ra} ${p.dec}`,
          fov: p.fov,
          cooFrame: 'ICRSd',
          showReticle: true,
        });
        viewer.current.on('click', event => {
          if (!callbacks.current.markMode || event.isDragging || !science.current) return;
          const atlas = viewer.current;
          const point = atlas.pix2world(event.x, event.y, 'icrs');
          if (!point || !science.current.image.contains(point[0], point[1])) {
            setMarkError('Choose a point inside the loaded exposure’s valid image pixels.');
            return;
          }
          const [ra, dec] = point;
          const center = atlas.getRaDec();
          const view = { ra: center[0], dec: center[1], fov: atlas.getFov()[0] };
          setMarkError('');
          callbacks.current.onMark?.({ ...science.current.metadata, ra, dec, view });
        });
        setStatus('');
        setReady(true);
      })
      .catch(error => {
        if (!cancelled) setStatus(error.message);
      });
    return () => {
      cancelled = true;
      viewer.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (viewer.current) {
      viewer.current.gotoRaDec(position.ra, position.dec);
      viewer.current.setFoV(position.fov);
    }
  }, [position]);

  useEffect(() => {
    if (!comparisonActive) {
      setComparisonResult(null);
      setComparisonDisplay({ loading: false, error: '', loaded: false });
      callbacks.current.onComparisonState?.({ message: '', error: '', stats: null });
      return;
    }
    const controller = new AbortController();
    const jobId = ++comparisonJob.current;
    let worker;
    const timer = setTimeout(() => {
      controller.abort();
      worker?.terminate();
      if (jobId === comparisonJob.current) {
        comparisonJob.current++;
        const message = 'Comparison timed out while loading or aligning the observations. Retry.';
        setComparisonDisplay({ loading: false, error: message, loaded: false });
        callbacks.current.onComparisonState?.({ message: '', error: message, stats: null });
      }
    }, 150000);
    setComparisonResult(null);
    setComparisonDisplay({ loading: true, error: '', loaded: false });
    callbacks.current.onComparisonState?.({
      message: 'Loading reference image A and comparison image B…',
      error: '',
      stats: null,
    });
    (async () => {
      const [loadedA, loadedB] = await Promise.all([
        loadSpherexExposure(comparison.a, { signal: controller.signal }),
        loadSpherexExposure(comparison.b, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted || jobId !== comparisonJob.current) return;
      callbacks.current.onComparisonState?.({
        message: 'Aligning original science pixels by celestial WCS…',
        error: '',
        stats: null,
      });
      const result = await new Promise((resolve, reject) => {
        worker = new Worker(new URL('../lib/compareFits.worker.js', import.meta.url), {
          type: 'module',
        });
        worker.onmessage = ({ data }) => {
          if (
            !isCurrentComparisonJob(jobId, data.jobId) ||
            !isCurrentComparisonJob(comparisonJob.current, data.jobId)
          )
            return;
          data.error ? reject(new Error(data.error)) : resolve(data.result);
        };
        worker.onerror = () => reject(new Error('The comparison worker stopped unexpectedly.'));
        worker.postMessage({ jobId, aBuffer: loadedA.buffer, bBuffer: loadedB.buffer }, [
          loadedA.buffer,
          loadedB.buffer,
        ]);
      });
      if (controller.signal.aborted || jobId !== comparisonJob.current) return;
      clearTimeout(timer);
      worker.terminate();
      const complete = {
        ...result,
        aMetadata: loadedA.metadata,
        bMetadata: loadedB.metadata,
      };
      setComparisonResult(complete);
      callbacks.current.onComparisonState?.({
        message: 'Comparison ready.',
        error: '',
        stats: result.stats,
      });
    })().catch(error => {
      clearTimeout(timer);
      worker?.terminate();
      if (jobId !== comparisonJob.current) return;
      const message = controller.signal.aborted
        ? 'Comparison timed out while loading or aligning the observations. Retry.'
        : error.message;
      setComparisonDisplay({ loading: false, error: message, loaded: false });
      callbacks.current.onComparisonState?.({ message: '', error: message, stats: null });
    });
    return () => {
      controller.abort();
      clearTimeout(timer);
      worker?.terminate();
    };
  }, [
    comparisonActive,
    comparison?.a?.id,
    comparison?.a?.url,
    comparison?.b?.id,
    comparison?.b?.url,
  ]);

  useEffect(() => {
    if (!ready || !viewer.current) return;
    const atlas = viewer.current;
    let cancelled = false;
    atlas.removeImageLayer('sample-fits');
    if (comparisonActive) {
      setSampleState({ loading: false, error: '', loaded: false });
      return;
    }
    if (exposure) {
      const controller = new AbortController();
      let blobUrl;
      let renderWorker;
      science.current = null;
      callbacks.current.onExposureReady?.(false);
      setSampleState({ loading: true, error: '', loaded: false });
      const timer = setTimeout(() => {
        controller.abort();
        renderWorker?.terminate();
        if (!cancelled) {
          setSampleState({
            loading: false,
            loaded: false,
            error: 'Exposure loading timed out. Retry.',
          });
          callbacks.current.onExposureReady?.(false);
        }
      }, 65000);
      (async () => {
        const { buffer, image, metadata } = await loadSpherexExposure(exposure, {
          signal: controller.signal,
        });
        const display = metadata.display;
        if (cancelled || controller.signal.aborted) return;
        // Retain the original buffer for provenance and marking. Aladin 3.8.2
        // renders these TAN-SIP images blank, so resample only the display copy.
        const displayBuffer = await new Promise((resolve, reject) => {
          renderWorker = new Worker(new URL('../lib/renderFits.worker.js', import.meta.url), {
            type: 'module',
          });
          renderWorker.onmessage = ({ data }) =>
            data.error ? reject(new Error(data.error)) : resolve(data.buffer);
          renderWorker.onerror = () =>
            reject(new Error('Could not prepare the observation image.'));
          renderWorker.postMessage(buffer);
        });
        renderWorker.terminate();
        if (cancelled || controller.signal.aborted) return;
        blobUrl = URL.createObjectURL(new Blob([displayBuffer], { type: 'application/fits' }));
        const rendered = await new Promise((resolve, reject) => {
          Promise.resolve(
            atlas.displayFITS(
              blobUrl,
              { name: `SPHEREx ${exposure.obsId} ${exposure.band}`, imgFormat: 'fits', ...display },
              (ra, dec, fov) => resolve({ ra, dec, fov }),
              () => reject(new Error('Could not render the original FITS exposure.')),
              'sample-fits'
            )
          ).catch(reject);
        });
        if (cancelled || controller.signal.aborted) return;
        clearTimeout(timer);
        atlas.gotoRaDec(latest.current.ra, latest.current.dec);
        atlas.setFoV(latest.current.fov);
        science.current = { image, metadata, view: rendered };
        setSampleState({ loading: false, error: '', loaded: true });
        callbacks.current.onExposureReady?.(true, metadata);
      })().catch(error => {
        clearTimeout(timer);
        if (!cancelled) {
          setSampleState({
            loading: false,
            loaded: false,
            error: controller.signal.aborted ? 'Exposure loading timed out. Retry.' : error.message,
          });
          callbacks.current.onExposureReady?.(false);
        }
      });
      return () => {
        cancelled = true;
        controller.abort();
        clearTimeout(timer);
        renderWorker?.terminate();
        science.current = null;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
    }
    if (isSpherex) {
      const controller = new AbortController();
      setSampleState({ loading: true, error: '', loaded: false });
      const timer = setTimeout(() => {
        controller.abort();
        if (!cancelled)
          setSampleState({
            loading: false,
            loaded: false,
            error: 'IRSA mosaic connection timed out. Retry or choose a local FITS image.',
          });
      }, 30000);
      Promise.all([loadAladin(), getSpherexCube({ signal: controller.signal })])
        .then(([A, metadata]) => {
          if (cancelled || controller.signal.aborted) return;
          setCube(metadata);
          const layer = A.imageHiPS(SPHEREX_HIPS, {
            name: metadata.title,
            imgFormat: 'png',
            colormap: 'magma',
            successCallback: loaded => {
              if (cancelled || controller.signal.aborted) return;
              clearTimeout(timer);
              cubeLayer.current = loaded;
              loaded.setColormap('magma');
              loaded.setFrequency({ value: cubeFrameFrequency(metadata, 62), unit: 'Hz' });
              setSampleState({ loading: false, error: '', loaded: true });
            },
            errorCallback: () => {
              clearTimeout(timer);
              if (!cancelled)
                setSampleState({
                  loading: false,
                  loaded: false,
                  error:
                    'Could not connect to the IRSA mosaic. Retry or choose a local FITS image.',
                });
            },
          });
          atlas.setBaseImageLayer(layer);
        })
        .catch(error => {
          clearTimeout(timer);
          if (!cancelled && !controller.signal.aborted)
            setSampleState({
              loading: false,
              loaded: false,
              error: `Could not reach IRSA: ${error.message}`,
            });
        });
      return () => {
        cancelled = true;
        controller.abort();
        clearTimeout(timer);
        cubeLayer.current = null;
      };
    }
    if (!sample) {
      atlas.setBaseImageLayer('P/DSS2/color');
      setSampleState({ loading: false, error: '', loaded: false });
      atlas.gotoRaDec(latest.current.ra, latest.current.dec);
      atlas.setFoV(latest.current.fov);
      return;
    }
    setSampleState({ loading: true, error: '', loaded: false });
    const timer = setTimeout(() => {
      if (!cancelled)
        setSampleState({
          loading: false,
          error: 'FITS loading timed out. Retry or switch to the reference sky.',
          loaded: false,
        });
    }, 20000);
    const fail = () => {
      clearTimeout(timer);
      if (!cancelled)
        setSampleState({
          loading: false,
          error: 'Could not display the local FITS sample. Retry and check WebGL2 support.',
          loaded: false,
        });
    };
    try {
      Promise.resolve(
        atlas.displayFITS(
          sampleImageUrl(sample),
          { name: sample.label, imgFormat: 'fits', colormap: 'magma', stretch: 'asinh' },
          (ra, dec, fov) => {
            if (cancelled) return;
            clearTimeout(timer);
            atlas.gotoRaDec(ra, dec);
            atlas.setFoV(fov * 1.15);
            setSampleState({ loading: false, error: '', loaded: true });
          },
          fail,
          'sample-fits'
        )
      ).catch(fail);
    } catch {
      fail();
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, sample, isSpherex, exposure?.id, exposure?.url, comparisonActive]);

  useEffect(() => {
    if (!ready || !viewer.current || !comparisonActive || !comparisonResult) return;
    const atlas = viewer.current;
    let cancelled = false;
    const urls = [];
    const center = atlas.getRaDec();
    const fov = atlas.getFov()[0];
    const removeLayers = () => {
      for (const name of ['comparison-a', 'comparison-b', 'comparison-difference'])
        atlas.removeImageLayer(name);
      comparisonLayers.current = { a: null, b: null, difference: null };
    };
    removeLayers();
    setComparisonDisplay({ loading: true, error: '', loaded: false });

    const display = (buffer, options, layerName) =>
      new Promise((resolve, reject) => {
        const url = URL.createObjectURL(new Blob([buffer], { type: 'application/fits' }));
        urls.push(url);
        let layer;
        try {
          layer = atlas.displayFITS(
            url,
            { imgFormat: 'fits', ...options },
            (ra, dec, imageFov) => resolve({ layer, view: { ra, dec, fov: imageFov } }),
            () => reject(new Error('Aladin Lite could not display the aligned comparison image.')),
            layerName
          );
        } catch (error) {
          reject(error);
        }
      });

    (async () => {
      const { stats } = comparisonResult;
      if (comparison.mode === 'overlay') {
        const options = {
          name: `Aligned A · ${comparison.a.obsId}`,
          colormap: 'magma',
          stretch: 'asinh',
          ...stats.commonCuts,
          opacity: 1,
        };
        const shownA = await display(comparisonResult.aFits, options, 'comparison-a');
        const shownB = await display(
          comparisonResult.bFits,
          {
            ...options,
            name: `Aligned B · ${comparison.b.obsId}`,
            opacity: comparison.blink ? 0 : overlayOpacities(comparison.opacity).b,
          },
          'comparison-b'
        );
        comparisonLayers.current = { a: shownA.layer, b: shownB.layer, difference: null };
        comparisonView.current = shownA.view;
      } else {
        const normalized = comparison.method === 'normalized';
        const buffer = normalized ? comparisonResult.normalizedFits : comparisonResult.rawFits;
        if (!buffer)
          throw new Error(
            'Raw difference is unavailable because the observations do not declare matching units.'
          );
        const baseLimit = normalized ? stats.normalizedLimit : stats.rawLimit;
        const limit = baseLimit / Math.max(0.5, comparison.contrast);
        const shown = await display(
          buffer,
          {
            name: normalized
              ? 'Normalized visual residual · B − A'
              : `Raw difference · B − A · ${stats.unitA}`,
            colormap: 'rdbu',
            stretch: 'linear',
            minCut: -limit,
            maxCut: limit,
          },
          'comparison-difference'
        );
        comparisonLayers.current = { a: null, b: null, difference: shown.layer };
        comparisonView.current = shown.view;
      }
      if (cancelled) return;
      atlas.gotoRaDec(center[0], center[1]);
      atlas.setFoV(fov);
      setComparisonDisplay({ loading: false, error: '', loaded: true });
      callbacks.current.onComparisonState?.({
        message: 'Comparison ready.',
        error: '',
        stats: comparisonResult.stats,
      });
    })().catch(error => {
      if (cancelled) return;
      setComparisonDisplay({ loading: false, error: error.message, loaded: false });
      callbacks.current.onComparisonState?.({
        message: '',
        error: error.message,
        stats: comparisonResult.stats,
      });
    });

    return () => {
      cancelled = true;
      removeLayers();
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [
    ready,
    comparisonActive,
    comparisonResult,
    comparison?.mode,
    comparison?.method,
    comparison?.contrast,
    comparison?.a?.obsId,
    comparison?.b?.obsId,
  ]);

  useEffect(() => {
    if (!comparisonActive || comparison.mode !== 'overlay' || !comparisonLayers.current.b) return;
    const layer = comparisonLayers.current.b;
    if (!comparison.blink) {
      layer.setOpacity(overlayOpacities(comparison.opacity).b);
      return;
    }
    let showB = false;
    layer.setOpacity(0);
    const timer = setInterval(() => {
      showB = !showB;
      layer.setOpacity(showB ? 1 : 0);
    }, comparison.blinkMs);
    return () => clearInterval(timer);
  }, [
    comparisonActive,
    comparison?.mode,
    comparison?.opacity,
    comparison?.blink,
    comparison?.blinkMs,
    comparisonDisplay.loaded,
  ]);

  useEffect(() => {
    if (isSpherex && cubeLayer.current && cube)
      cubeLayer.current.setFrequency({ value: cubeFrameFrequency(cube, channel), unit: 'Hz' });
  }, [channel, isSpherex, cube]);

  useEffect(() => {
    if (!ready || !viewer.current) return;
    const atlas = viewer.current;
    let cancelled = false;
    let catalog;
    loadAladin().then(A => {
      if (cancelled) return;
      catalog = A.catalog({
        name: 'Candidate markers',
        sourceSize: 18,
        color: '#c4b5fd',
        shape: 'cross',
        onClick: 'showTable',
      });
      atlas.addCatalog(catalog);
      catalog.addSources(
        [marker, reporterMarker]
          .filter(Boolean)
          .map((m, i) =>
            A.source(m.ra, m.dec, { label: i ? 'Reporter marker' : 'Marked position' })
          )
      );
    });
    return () => {
      cancelled = true;
      if (catalog) {
        catalog.removeAll();
        atlas.removeLayer(catalog);
      }
    };
  }, [ready, marker, reporterMarker]);

  const visibleState = comparisonActive ? comparisonDisplay : sampleState;

  return (
    <section className="space-y-3" aria-label="Sky viewer and FITS samples">
      <div
        className="panel mobile:p-4.5 space-y-3 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]"
        data-tour="samples"
      >
        <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
          {comparisonActive
            ? comparison.mode === 'overlay'
              ? 'Aligned observation overlay'
              : 'Difference image · B minus A'
            : exposure
              ? 'Investigate an image'
              : isSpherex
                ? 'Explore the infrared sky'
                : 'Explore a reference image'}
        </div>
        {!exposure && (
          <details className="text-sm">
            <summary className="cursor-pointer text-[#b8b8c2]">Change sky map</summary>
            <label className="mt-3 block">
              Sky map
              <select
                value={sampleId}
                disabled={!ready}
                onChange={event => setSampleId(event.target.value)}
              >
                <option value="spherex">SPHEREx · infrared sky map</option>
                <option value="">Visible-light sky map · DSS2</option>
                {SAMPLE_IMAGES.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </details>
        )}
        {exposure && !comparisonActive && (
          <details className="text-xs text-[#9a9aa3]">
            <summary className="cursor-pointer">Image details & original file</summary>
            <p className="mt-3 leading-relaxed">
              {exposure.obsId} · {exposure.band} · {exposure.observedAt} ·{' '}
              {(exposure.wavelengthMin * 1e6).toFixed(3)}–
              {(exposure.wavelengthMax * 1e6).toFixed(3)} µm (varies across the detector). Original
              IMAGE pixels resampled for display with distortion correction; quality flags are not
              masked.{' '}
              <a className="underline" href={exposure.url} target="_blank" rel="noreferrer">
                Original FITS ↗
              </a>
            </p>
          </details>
        )}
        {comparisonActive && (
          <details className="text-xs text-[#9a9aa3]" open>
            <summary className="cursor-pointer">Derived comparison details</summary>
            <p className="mt-3 leading-relaxed">
              A: {comparison.a.obsId} · {comparison.a.band} · {comparison.a.observedAt}
              <br />
              B: {comparison.b.obsId} · {comparison.b.band} · {comparison.b.observedAt}
              <br />
              Common grid: undistorted tangent plane of A. Only pixels with valid coverage in both
              originals are shown. This derived view is not an original NASA observation and is not
              submitted as one.
            </p>
          </details>
        )}
        {isSpherex && (
          <>
            <p className="text-xs leading-relaxed text-[#9a9aa3]">
              See the sky in infrared light. Colors show brightness, not visible-light colors. Try a
              different wavelength to reveal different details.
            </p>
            {cube && (
              <label>
                Infrared wavelength
                <select
                  value={channel}
                  disabled={!sampleState.loaded}
                  onChange={event => setChannel(Number(event.target.value))}
                >
                  {cube.channels.map(item => (
                    <option key={item.index} value={item.index} disabled={item.blank}>
                      {item.wavelength.toFixed(3)} µm
                      {item.blank ? ' · unavailable' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs leading-relaxed text-[#9a9aa3]">
              This map combines images from different times. To mark an object, find an individual
              image below.
            </p>
            <details className="text-xs text-[#9a9aa3]">
              <summary className="cursor-pointer">About this map & data sources</summary>
              <p className="my-3 leading-relaxed">
                NASA/SPHEREx · Caltech/IPAC · DR1. The map has 102 infrared wavelength layers.
                Wavelengths are measured in micrometers (µm). Two channels have no data. Gaps and
                image artifacts may appear. This combined map cannot be used to compare observation
                dates or make calibrated brightness measurements.
              </p>
              <div className="flex flex-wrap gap-3 text-xs">
                <a
                  className="underline"
                  href={SPHEREX_CUBE_TUTORIAL}
                  target="_blank"
                  rel="noreferrer"
                >
                  Official mosaic tutorial ↗
                </a>
                <a
                  className="underline"
                  href={`${SPHEREX_HIPS}/properties`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Technical metadata ↗
                </a>
              </div>
            </details>
          </>
        )}
        {!exposure && sample && (
          <>
            <p className="muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]">
              {sample.provenance}. This is a reference image, not a SPHEREx observation. It cannot
              be added to an investigation.
            </p>
            <div className="flex flex-wrap gap-3 text-xs">
              <a className="underline" href={sampleImageUrl(sample)} download>
                Download FITS
              </a>
              <a className="underline" href={sample.source} target="_blank" rel="noreferrer">
                Sample source ↗
              </a>
            </div>
          </>
        )}
        <p
          role="status"
          className={
            visibleState.error
              ? 'error text-[0.85rem] text-[#fda4af]'
              : 'muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]'
          }
        >
          {visibleState.loading
            ? comparisonActive
              ? comparisonResult
                ? 'Displaying the aligned comparison…'
                : 'Loading and aligning two original observations…'
              : exposure
                ? 'Loading observation image…'
                : isSpherex
                  ? 'Loading sky map…'
                  : 'Loading reference image…'
            : visibleState.error ||
              (visibleState.loaded
                ? comparisonActive
                  ? comparison.mode === 'overlay'
                    ? 'Aligned overlay ready. Use opacity or blink to inspect changes.'
                    : 'Difference ready. Blue is negative (brighter in A); red is positive (brighter in B).'
                  : exposure
                    ? 'Image ready. Use Mark Object to select a point in the image.'
                    : isSpherex
                      ? 'Sky map connected.'
                      : 'Reference image ready.'
                : 'Reference survey imagery requires internet access.')}
        </p>
        {visibleState.error && <button onClick={retry}>Retry image</button>}
        {exposure && visibleState.loaded && (
          <button
            onClick={() => {
              const view = comparisonActive ? comparisonView.current : science.current?.view;
              if (view && viewer.current) {
                viewer.current.gotoRaDec(view.ra, view.dec);
                viewer.current.setFoV(view.fov * 1.1);
              }
            }}
          >
            Center image
          </button>
        )}
        {!exposure && <SpherexArchive position={position} onAddExposure={onAddExposure} />}
        {markError && (
          <p role="alert" className="text-sm text-rose-300">
            {markError}
          </p>
        )}
      </div>
      <section
        className="viewer mobile:min-h-105 relative min-h-112.5 overflow-hidden rounded-xl bg-[#08080a] [border:1px_solid_#37323f]"
        aria-label="Interactive sky atlas"
        data-tour="atlas"
      >
        <div id={id} className="sky mobile:h-105 h-130 w-full" />
        {(status || (exposure && (visibleState.loading || visibleState.error))) && (
          <div
            className="viewer-status pointer-events-none absolute top-[40%] right-[10%] left-[10%] text-center"
            role="status"
          >
            {status ||
              visibleState.error ||
              (comparisonActive
                ? 'Loading and aligning the comparison…'
                : 'Loading and preparing the observation image…')}
          </div>
        )}
      </section>
    </section>
  );
}
