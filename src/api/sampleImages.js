// Real, locally served tutorial images; neither file is SPHEREx data.
export const SAMPLE_IMAGES = [
  {
    id: 'horsehead',
    label: 'Horsehead Nebula · DSS optical',
    file: 'horsehead.fits',
    source: 'https://www.astropy.org/astropy-data/',
    provenance: 'Astropy tutorial sample; STScI/MAST Digitized Sky Survey',
  },
  {
    id: 'galactic-center-j',
    label: 'Galactic Center · 2MASS J infrared',
    file: 'galactic-center-2mass-j.fits',
    source: 'https://www.astropy.org/astropy-data/',
    provenance: 'Astropy galactic_center/gc_2mass_j.fits sample; 2MASS J band',
  },
];

export function sampleImageUrl(sample) {
  return `${import.meta.env.BASE_URL}samples/${sample.file}`;
}
