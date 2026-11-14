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
export default function SkyViewer({ position }) {
  const [sampleId, setSampleId] = useState('spherex');
  const [attempt, setAttempt] = useState(0);
  // A fresh atlas prevents a stalled remote survey request from blocking FITS loading.
  return (
    <SkyViewerInstance
      key={`${sampleId}-${attempt}`}
      position={position}
      sampleId={sampleId}
      setSampleId={setSampleId}
      retry={() => setAttempt(value => value + 1)}
    />
  );
}

function SkyViewerInstance({ position, sampleId, setSampleId, retry }) {
  const id = `sky-${useId().replace(/[^a-z0-9]/gi, '')}`;
  const viewer = useRef(null);
  const cubeLayer = useRef(null);
  const [cube, setCube] = useState(null);
  const [channel, setChannel] = useState(62);
  const isSpherex = sampleId === 'spherex';
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
            successCallback: loaded => {
              if (cancelled || controller.signal.aborted) return;
              clearTimeout(timer);
              cubeLayer.current = loaded;
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
  }, [ready, sample, isSpherex]);

  useEffect(() => {
    if (isSpherex && cubeLayer.current && cube)
      cubeLayer.current.setFrequency({ value: cubeFrameFrequency(cube, channel), unit: 'Hz' });
  }, [channel, isSpherex, cube]);

  return (
    <section className="space-y-3" aria-label="Sky viewer and FITS samples">
      <div
        className="panel mobile:p-4.5 space-y-3 rounded-xl bg-[#141418] p-5.5 [border:1px_solid_var(--line)] [&_h2]:mt-2 [&_h2]:font-[inherit] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em]"
        data-tour="samples"
      >
        <div className="eyebrow text-[0.65rem] leading-[1.7] font-semibold tracking-[0.16em] text-(--accent) uppercase">
          {isSpherex ? 'SPHEREx DR1 · live IRSA mosaic' : 'Reference imagery · not SPHEREx'}
        </div>
        <label>
          Image source
          <select
            value={sampleId}
            disabled={!ready}
            onChange={event => setSampleId(event.target.value)}
          >
            <option value="spherex">SPHEREx DR1 · all-sky wavelength cube</option>
            <option value="">DSS2 reference sky · remote tiles</option>
            {SAMPLE_IMAGES.map(item => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {isSpherex && (
          <>
            <p className="text-xs leading-relaxed text-[#9a9aa3]">
              NASA/SPHEREx · Caltech/IPAC. Live DR1 visualization mosaic with 102 wavelength layers.
              This combines observations; it is not an epoch image or a calibrated photometry tool.
            </p>
            {cube && (
              <label>
                SPHEREx wavelength
                <select
                  value={channel}
                  disabled={!sampleState.loaded}
                  onChange={event => setChannel(Number(event.target.value))}
                >
                  {cube.channels.map(item => (
                    <option key={item.index} value={item.index} disabled={item.blank}>
                      {item.wavelength.toFixed(3)} µm · band {item.band}, channel {item.channel}
                      {item.blank ? ' · blank dichroic channel' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="text-xs leading-relaxed text-[#9a9aa3]">
              Changing wavelength updates the atlas. Blank dichroic channels are disabled. Mosaic
              artifacts and coverage gaps may be visible; use the science products for measurements.
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
                Live source metadata ↗
              </a>
            </div>
          </>
        )}
        {sample && (
          <>
            <p className="muted text-[0.75rem] leading-[1.75] text-[#9a9aa3]">
              {sample.provenance}. This is a standalone image; the mock timeline and band controls
              do not change it.
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
            ? isSpherex
              ? 'Connecting to the IRSA SPHEREx mosaic…'
              : 'Loading local FITS image…'
            : sampleState.error ||
              (sampleState.loaded
                ? isSpherex
                  ? 'IRSA mosaic connected. Image tiles stream over the internet as you navigate.'
                  : 'Local FITS image loaded and centered using its WCS coordinates.'
                : 'Reference survey imagery requires internet access.')}
        </p>
        {sampleState.error && <button onClick={retry}>Retry image</button>}
        <SpherexArchive position={position} />
      </div>
      <section
        className="viewer mobile:min-h-105 relative min-h-112.5 overflow-hidden rounded-xl bg-[#08080a] [border:1px_solid_#37323f]"
        aria-label="Interactive sky atlas"
        data-tour="atlas"
      >
        <div id={id} className="sky mobile:h-105 h-130 w-full" />
        {status && (
          <div
            className="viewer-status pointer-events-none absolute top-[40%] right-[10%] left-[10%] text-center"
            role="status"
          >
            {status}
          </div>
        )}
      </section>
    </section>
  );
}
