
declare global {
  interface Window {
    ttq?: any;
  }
}

export const tiktokTrack = (event: string, data?: object) => {
  if (typeof window !== "undefined" && window.ttq) {
    window.ttq.track(event, data);
  }
};
