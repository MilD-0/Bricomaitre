export function readBrowserErrorSource(event: Pick<ErrorEvent, 'filename' | 'lineno' | 'colno'>) {
  let sourceUrl = event.filename?.split(/[?#]/, 1)[0]?.slice(0, 1024) || null;
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      url.username = '';
      url.password = '';
      sourceUrl = url.toString();
    } catch {
      // Browsers also report relative paths and native wrapper pseudo-URLs.
    }
  }
  return {
    sourceUrl,
    lineNumber: event.lineno > 0 ? event.lineno : null,
    columnNumber: event.colno > 0 ? event.colno : null,
  };
}
