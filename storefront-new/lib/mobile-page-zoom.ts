const zoomResetViewport = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
const restoreDelayMs = 300;

export function resetMobilePageZoom() {
  if (!window.visualViewport || window.visualViewport.scale <= 1.01) return;
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!viewport) return;

  const originalContent = viewport.content;
  viewport.content = zoomResetViewport;
  window.setTimeout(() => {
    viewport.content = originalContent;
  }, restoreDelayMs);
}
