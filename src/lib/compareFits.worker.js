import { compareFitsBuffers } from './compareFits.js';

self.onmessage = ({ data }) => {
  const { jobId, aBuffer, bBuffer } = data;
  try {
    const result = compareFitsBuffers(aBuffer, bBuffer);
    const transfer = [result.aFits, result.bFits, result.normalizedFits];
    if (result.rawFits) transfer.push(result.rawFits);
    self.postMessage({ jobId, result }, transfer);
  } catch (error) {
    self.postMessage({ jobId, error: error.message });
  }
};
