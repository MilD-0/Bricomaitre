export function readBrowserErrorSource(event: Pick<ErrorEvent, 'filename' | 'lineno' | 'colno'>) {
  let sourceUrl = event.filename || null;
  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      sourceUrl = url.toString();
    } catch {
      // Browsers also report relative paths and native wrapper pseudo-URLs.
      sourceUrl = sourceUrl.split(/[?#]/, 1)[0] || null;
    }
  }
  return {
    sourceUrl: sourceUrl?.slice(0, 1024) || null,
    lineNumber: event.lineno > 0 ? event.lineno : null,
    columnNumber: event.colno > 0 ? event.colno : null,
  };
}
