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
import { scienceImage } from '../lib/fits';
import { validateExposure, IMAGE_VERSION } from '../citizen/model';
export default function SkyViewer({
  position,
  exposure = null,
  marker,
  reporterMarker,
  onMark,
  onAddExposure,
  onExposureReady,
  markMode = false,
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
}) {
  const id = `sky-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const viewer = useRef(null);
  const cubeLayer = useRef(null);
  const [cube, setCube] = useState(null);
  const [channel, setChannel] = useState(62);
  const isSpherex = !exposure && sampleId === 'spherex';
  const science = useRef(null);
  const callbacks = useRef({ onMark, onExposureReady, markMode });
  callbacks.current = { onMark, onExposureReady, markMode };
  const [markError, setMarkError] = useState('');
  const latest = useRef(position);
  latest.current = position;
  const [status, setStatus] = useState('Loading Aladin Lite…');
  const [ready, setReady] = useState(false);
  const [sampleState, setSampleState] = useState({ loading: false, error: '', loaded: false });
  const sample = SAMPLE_IMAGES.find(item => item.id === sampleId);

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
    if (!ready || !viewer.current) return;
    const atlas = viewer.current;
    let cancelled = false;
    atlas.removeImageLayer('sample-fits');
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
        validateExposure(exposure);
        const params = new URLSearchParams({ url: exposure.url });
        const response = await fetch(`/api/spherex-image?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          let message = 'Original exposure unavailable. Retry.';
          try {
            message = (await response.json()).error || message;
          } catch {}
          throw new Error(message);
        }
        const buffer = await response.arrayBuffer();
        const image = scienceImage(buffer);
        if (
          image.header.OBSID !== exposure.obsId ||
          Number(image.header.DETECTOR) !== Number(exposure.band.slice(-1))
        )
          throw new Error('FITS observation identity does not match the selected archive record.');
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), n =>
          n.toString(16).padStart(2, '0')
        ).join('');
        if (exposure.imageHash && hash !== exposure.imageHash)
          throw new Error(
            'The source image differs from the reporter’s saved checksum. Investigation is blocked.'
          );
        const observedAt = new Date(
          image.header['DATE-OBS'] + (/Z$/.test(image.header['DATE-OBS']) ? '' : 'Z')
        ).toISOString();
        const display = exposure.display || {
          ...image.cuts,
          colormap: 'magma',
          stretch: 'asinh',
          extension: 'IMAGE',
        };
        const metadata = {
          ...exposure,
          observedAt,
          imageHash: hash,
          imageVersion: IMAGE_VERSION,
          fitsMetadata: {
            obsId: image.header.OBSID,
            detector: image.header.DETECTOR,
            dateObs: image.header['DATE-OBS'],
            mjdStart: image.header['MJD-BEG'],
            mjdEnd: image.header['MJD-END'],
            bunit: image.header.BUNIT,
            width: image.header.NAXIS1,
            height: image.header.NAXIS2,
          },
          display,
        };
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
  }, [ready, sample, isSpherex, exposure?.id, exposure?.url]);

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

  return (
    <section className="space-y-3" aria-label="Sky viewer and FITS samples">
      <div
        className="panel mobile:p-4.5 space-y-3 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]"
        data-tour="samples"
      >
        <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
          {exposure
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
        {exposure && (
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
            sampleState.error
              ? 'error text-[0.85rem] text-[#fda4af]'
              : 'muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]'
          }
        >
          {sampleState.loading
            ? exposure
              ? 'Loading observation image…'
              : isSpherex
                ? 'Loading sky map…'
                : 'Loading reference image…'
            : sampleState.error ||
              (sampleState.loaded
                ? exposure
                  ? 'Image ready. Use Mark Object to select a point in the image.'
                  : isSpherex
                    ? 'Sky map connected.'
                    : 'Reference image ready.'
                : 'Reference survey imagery requires internet access.')}
        </p>
        {sampleState.error && <button onClick={retry}>Retry image</button>}
        {exposure && sampleState.loaded && (
          <button
            onClick={() => {
              const view = science.current?.view;
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
        {(status || (exposure && (sampleState.loading || sampleState.error))) && (
          <div
            className="viewer-status pointer-events-none absolute top-[40%] right-[10%] left-[10%] text-center"
            role="status"
          >
            {status || sampleState.error || 'Loading and preparing the observation image…'}
          </div>
        )}
      </section>
    </section>
  );
}
