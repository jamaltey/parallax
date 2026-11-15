export function overlayOpacities(percent) {
  const opacity = Math.max(0, Math.min(100, Number(percent))) / 100;
  return { a: 1, b: opacity };
}

export const isCurrentComparisonJob = (activeJobId, resultJobId) => activeJobId === resultJobId;
