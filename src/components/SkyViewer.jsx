import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { prepareExposureDisplay } from '../lib/prepareExposure';
import { isCurrentComparisonJob, overlayOpacities } from '../lib/comparison';
import { exposureCacheKey, MAX_CACHED_EXPOSURES } from '../lib/exposureCache';
import { identifyObject } from '../api/objects';
import { atlasAim, atlasClick, atlasHover } from '../lib/atlasSound';
export default function SkyViewer({
  position,
  exposure = null,
  prefetchExposures = [],
  markers = [],
  reporterMarkers = [],
  onMark,
  onAddExposure,
  onLoadExposures,
  onExposureReady,
  markMode = false,
  comparison,
  onComparisonState,
  controlsHost,
  controlsInSidebar = false,
}) {
  const [sampleId, setSampleId] = useState('spherex');
  const [attempt, setAttempt] = useState(0);
  // A fresh atlas prevents a stalled remote survey request from blocking FITS loading.
  return (
    <SkyViewerInstance
      key={attempt}
      exposure={exposure}
      prefetchExposures={prefetchExposures}
      markers={markers}
      reporterMarkers={reporterMarkers}
      onMark={onMark}
      onAddExposure={onAddExposure}
      onLoadExposures={onLoadExposures}
      onExposureReady={onExposureReady}
      markMode={markMode}
      comparison={comparison}
      onComparisonState={onComparisonState}
      controlsHost={controlsHost}
      controlsInSidebar={controlsInSidebar}
      position={position}
      sampleId={sampleId}
      setSampleId={setSampleId}
      retry={() => setAttempt(value => value + 1)}
    />
  );
}

function currentAtlasView(atlas) {
  const center = atlas.getRaDec();
  const fov = atlas.getFov();
  return { ra: center[0], dec: center[1], fov: fov[0] };
}

function restoreAtlasView(atlas, view) {
  atlas.gotoRaDec(view.ra, view.dec);
  atlas.setFoV(view.fov);
}

function SkyViewerInstance({
  position,
  sampleId,
  setSampleId,
  retry,
  exposure,
  prefetchExposures,
  markers,
  reporterMarkers,
  onMark,
  onAddExposure,
  onLoadExposures,
  onExposureReady,
  markMode,
  comparison,
  onComparisonState,
  controlsHost,
  controlsInSidebar,
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
  const [identifyMode, setIdentifyMode] = useState(false);
  const identifyModeRef = useRef(false);
  identifyModeRef.current = identifyMode;
  const lookupAbort = useRef(null);
  const [lookupState, setLookupState] = useState({ loading: false, error: '', result: null });
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
  const exposureLayers = useRef(new Map());
  const exposureLayerSequence = useRef(0);
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
          showSimbadPointerControl: false,
          showContextMenu: false,
        });
        viewer.current.on('objectHovered', (source, point) =>
          atlasHover(document.getElementById(id), source, point)
        );
        atlasAim(viewer.current);
        viewer.current.on('click', event => {
          if (event.isDragging) return;
          atlasClick(document.getElementById(id), event.x, event.y);
          const atlas = viewer.current;
          const point = atlas.pix2world(event.x, event.y, 'icrs');
          if (identifyModeRef.current) {
            if (!point) {
              setLookupState({
                loading: false,
                error: 'Could not read this sky position.',
                result: null,
              });
              return;
            }
            const [ra, dec] = point;
            const radius = Math.min(2 / 60, Math.max(2 / 3600, atlas.getFov()[0] / 60));
            lookupAbort.current?.abort();
            const controller = new AbortController();
            lookupAbort.current = controller;
            setIdentifyMode(false);
            setLookupState({ loading: true, error: '', result: null });
            identifyObject({ ra, dec, radius, signal: controller.signal })
              .then(result => {
                if (!controller.signal.aborted)
                  setLookupState({ loading: false, error: '', result });
              })
              .catch(error => {
                if (!controller.signal.aborted)
                  setLookupState({ loading: false, error: error.message, result: null });
              });
            return;
          }
          if (!callbacks.current.markMode || !science.current) return;
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
      lookupAbort.current?.abort();
      viewer.current = null;
    };
  }, [id]);

  useEffect(() => {
    if (markMode) setIdentifyMode(false);
  }, [markMode]);

  useEffect(
    () => () => {
      for (const entry of exposureLayers.current.values()) URL.revokeObjectURL(entry.blobUrl);
      exposureLayers.current.clear();
    },
    []
  );

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
        const aBuffer = loadedA.buffer.slice(0);
        const bBuffer = loadedB.buffer.slice(0);
        worker.postMessage({ jobId, aBuffer, bBuffer }, [aBuffer, bBuffer]);
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
    const hideExposureLayers = exceptKey => {
      for (const [key, entry] of exposureLayers.current)
        if (key !== exceptKey) entry.layer.setOpacity(0);
    };
    if (comparisonActive) {
      hideExposureLayers();
      setSampleState({ loading: false, error: '', loaded: false });
      return;
    }
    if (exposure) {
      const cacheKey = exposureCacheKey(exposure);
      const cachedLayer = exposureLayers.current.get(cacheKey);
      if (
        cachedLayer &&
        (!exposure.imageHash || exposure.imageHash === cachedLayer.metadata.imageHash)
      ) {
        const retainedView = currentAtlasView(atlas);
        exposureLayers.current.delete(cacheKey);
        exposureLayers.current.set(cacheKey, cachedLayer);
        hideExposureLayers(cacheKey);
        cachedLayer.layer.setOpacity(1);
        restoreAtlasView(atlas, retainedView);
        const metadata = {
          ...cachedLayer.metadata,
          ...exposure,
          display: exposure.display || cachedLayer.metadata.display,
        };
        science.current = { image: cachedLayer.image, metadata, view: cachedLayer.view };
        setSampleState({ loading: false, error: '', loaded: true, cached: true });
        callbacks.current.onExposureReady?.(true, metadata);
        return () => {
          science.current = null;
        };
      }
      const controller = new AbortController();
      let blobUrl;
      let layerCommitted = false;
      science.current = null;
      callbacks.current.onExposureReady?.(false);
      setSampleState({ loading: true, error: '', loaded: false });
      const timer = setTimeout(() => {
        controller.abort();
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
        const { image, metadata, displayBuffer } = await prepareExposureDisplay(exposure, {
          signal: controller.signal,
        });
        const display = metadata.display;
        if (cancelled || controller.signal.aborted) return;
        // Retain the original buffer for provenance and marking. Aladin 3.8.2
        // renders these TAN-SIP images blank, so resample only the display copy.
        blobUrl = URL.createObjectURL(new Blob([displayBuffer], { type: 'application/fits' }));
        const layerName = `exposure-${++exposureLayerSequence.current}`;
        let layer;
        const pixelScale = Math.max(
          Math.hypot(image.header.CD1_1 || image.header.CDELT1 || 0, image.header.CD2_1 || 0),
          Math.hypot(image.header.CD1_2 || 0, image.header.CD2_2 || image.header.CDELT2 || 0)
        );
        const initialView = {
          ra: image.header.CRVAL1,
          dec: image.header.CRVAL2,
          fov: Math.max(image.header.NAXIS1, image.header.NAXIS2) * pixelScale,
        };
        // Aladin automatically frames a newly displayed FITS layer. Timeline
        // navigation should only replace the image, so retain the user's live
        // camera and restore it both immediately and after rendering finishes.
        const retainedView = currentAtlasView(atlas);
        let finishRender;
        let failRender;
        const renderCompletion = new Promise((resolve, reject) => {
          finishRender = resolve;
          failRender = reject;
        });
        try {
          layer = atlas.displayFITS(
            blobUrl,
            { name: `SPHEREx ${exposure.obsId} ${exposure.band}`, imgFormat: 'fits', ...display },
            (ra, dec, fov) => {
              if (!cancelled) restoreAtlasView(atlas, retainedView);
              finishRender({ ra, dec, fov });
            },
            () => failRender(new Error('Could not render the original FITS exposure.')),
            layerName
          );
          Promise.resolve(layer).catch(failRender);
        } catch (error) {
          failRender(error);
          renderCompletion.catch(() => {});
          throw error;
        }
        restoreAtlasView(atlas, retainedView);
        if (cancelled || controller.signal.aborted) {
          atlas.removeImageLayer(layerName);
          return;
        }
        const layerEntry = {
          layer,
          layerName,
          blobUrl,
          view: initialView,
          image,
          metadata,
        };
        exposureLayers.current.set(cacheKey, layerEntry);
        hideExposureLayers(cacheKey);
        layer.setOpacity(1);
        layerCommitted = true;
        renderCompletion
          .then(rendered => {
            const cached = exposureLayers.current.get(cacheKey);
            if (cached?.layer === layer) cached.view = rendered;
            if (science.current?.metadata.id === metadata.id)
              science.current = { ...science.current, view: rendered };
          })
          .catch(error => {
            const cached = exposureLayers.current.get(cacheKey);
            if (cached?.layer === layer) {
              exposureLayers.current.delete(cacheKey);
              atlas.removeImageLayer(layerName);
              URL.revokeObjectURL(blobUrl);
            }
            if (!cancelled && science.current?.metadata.id === metadata.id) {
              science.current = null;
              setSampleState({ loading: false, loaded: false, error: error.message });
              callbacks.current.onExposureReady?.(false);
            }
          });
        while (exposureLayers.current.size > MAX_CACHED_EXPOSURES) {
          const oldestKey = exposureLayers.current.keys().next().value;
          const oldest = exposureLayers.current.get(oldestKey);
          exposureLayers.current.delete(oldestKey);
          atlas.removeImageLayer(oldest.layerName);
          URL.revokeObjectURL(oldest.blobUrl);
        }
        clearTimeout(timer);
        restoreAtlasView(atlas, retainedView);
        science.current = { image, metadata, view: initialView };
        setSampleState({ loading: false, error: '', loaded: true, cached: false });
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
        science.current = null;
        if (blobUrl && !layerCommitted) URL.revokeObjectURL(blobUrl);
      };
    }
    hideExposureLayers();
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
    const catalogs = [];
    loadAladin().then(A => {
      if (cancelled) return;
      const groups = [
        {
          name: 'Current image marker',
          color: '#c4b5fd',
          size: 20,
          rows: markers.filter(item => item.isActive),
          label: item => `Current image · ${item.obsId}`,
        },
        {
          name: 'Other image markers',
          color: '#67e8f9',
          size: 16,
          rows: markers.filter(item => !item.isActive),
          label: item => `Image ${item.timelineIndex} · ${item.obsId}`,
        },
        {
          name: 'Reporter markers',
          color: '#fbbf24',
          size: 15,
          rows: reporterMarkers,
          label: item => `Reporter · image ${item.timelineIndex} · ${item.obsId}`,
        },
        {
          name: 'SIMBAD lookup',
          color: '#86efac',
          size: 18,
          rows: lookupState.result ? [lookupState.result] : [],
          label: item => `${item.name} · ${item.objectType}`,
        },
      ];
      for (const group of groups) {
        if (!group.rows.length) continue;
        const catalog = A.catalog({
          name: group.name,
          sourceSize: group.size,
          color: group.color,
          shape: 'cross',
          onClick: 'showTable',
        });
        atlas.addCatalog(catalog);
        catalog.addSources(
          group.rows.map(item =>
            A.source(item.ra, item.dec, {
              label: group.label(item),
              observation: item.obsId,
              observedAt: item.observedAt,
            })
          )
        );
        catalogs.push(catalog);
      }
    });
    return () => {
      cancelled = true;
      for (const catalog of catalogs) {
        catalog.removeAll();
        atlas.removeLayer(catalog);
      }
    };
  }, [ready, markers, reporterMarkers, lookupState.result]);

  const prefetchKey = prefetchExposures.map(frame => frame.id).join('|');
  useEffect(() => {
    if (!exposure || comparisonActive || !sampleState.loaded || !prefetchExposures.length) return;
    const controller = new AbortController();
    (async () => {
      for (const frame of prefetchExposures) {
        if (controller.signal.aborted) return;
        await prepareExposureDisplay(frame, { signal: controller.signal });
      }
    })().catch(error => {
      if (error.name !== 'AbortError') console.warn('Could not preload a nearby exposure.', error);
    });
    return () => controller.abort();
  }, [exposure?.id, comparisonActive, sampleState.loaded, prefetchKey]);

  const visibleState = comparisonActive ? comparisonDisplay : sampleState;

  const controlsPanel = (
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
            {(exposure.wavelengthMin * 1e6).toFixed(3)}–{(exposure.wavelengthMax * 1e6).toFixed(3)}{' '}
            µm (varies across the detector). Original IMAGE pixels resampled for display with
            distortion correction; quality flags are not masked.{' '}
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
            {sample.provenance}. This is a reference image, not a SPHEREx observation. It cannot be
            added to an investigation.
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
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-pressed={identifyMode}
          disabled={!ready || lookupState.loading}
          onClick={() => {
            setIdentifyMode(value => !value);
            setLookupState(previous => ({ ...previous, error: '' }));
          }}
        >
          {identifyMode ? 'Cancel identification' : 'Identify catalog object'}
        </button>
        {lookupState.result && (
          <button onClick={() => setLookupState({ loading: false, error: '', result: null })}>
            Clear identification
          </button>
        )}
      </div>
      {identifyMode && (
        <p role="status" className="text-sm text-emerald-200">
          Click a visible object to search the official Harvard and IDIA SIMBAD mirrors.
        </p>
      )}
      {lookupState.loading && (
        <p role="status" className="text-sm text-[#b8b8c2]">
          Searching SIMBAD mirrors…
        </p>
      )}
      {lookupState.error && (
        <p role="alert" className="text-sm leading-relaxed text-rose-300">
          {lookupState.error}
        </p>
      )}
      {lookupState.result && (
        <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/5 p-3 text-sm">
          <p className="font-semibold text-emerald-200">{lookupState.result.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#b8b8c2]">
            {lookupState.result.objectType}
            {lookupState.result.spectralType
              ? ` · spectral type ${lookupState.result.spectralType}`
              : ''}{' '}
            · {lookupState.result.separationArcsec.toFixed(2)}″ from the clicked position
            <br />
            {lookupState.result.provider} · RA {lookupState.result.ra.toFixed(6)}° · Dec{' '}
            {lookupState.result.dec.toFixed(6)}°
          </p>
          <a
            className="mt-2 inline-block text-xs text-emerald-200 underline"
            href={lookupState.result.objectUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open mirror record ↗
          </a>
          <p className="mt-2 text-xs leading-relaxed text-[#9a9aa3]">
            This is the nearest SIMBAD catalog match, not automatic confirmation that it is the same
            source visible in SPHEREx.
          </p>
        </div>
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
      {markError && (
        <p role="alert" className="text-sm text-rose-300">
          {markError}
        </p>
      )}
    </div>
  );

  return (
    <section className="space-y-3" aria-label="Sky viewer and FITS samples">
      {controlsInSidebar
        ? controlsHost && createPortal(controlsPanel, controlsHost)
        : controlsPanel}
      <section
        className="viewer mobile:min-h-105 relative min-h-112.5 overflow-hidden rounded-xl bg-[#08080a] [border:1px_solid_#37323f]"
        aria-label="Interactive sky atlas"
        data-tour="atlas"
      >
        <div id={id} className="sky mobile:h-105 h-130 w-full" />
        {(status ||
          (exposure &&
            (visibleState.error ||
              (visibleState.loading && exposureLayers.current.size === 0)))) && (
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
      {!exposure && (
        <SpherexArchive
          position={position}
          onAddExposure={onAddExposure}
          onLoadExposures={onLoadExposures}
          standalone
        />
      )}
    </section>
  );
}
