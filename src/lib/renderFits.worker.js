import { renderFitsImage } from './renderFits.js';
self.onmessage = ({ data }) => {
  try {
    const buffer = renderFitsImage(data);
    self.postMessage({ buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
