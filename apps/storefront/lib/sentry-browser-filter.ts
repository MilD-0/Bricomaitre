type BrowserExceptionEvent = {
  exception?: {
    values?: Array<{
      value?: string;
      stacktrace?: { frames?: Array<{ filename?: string | null }> };
    }>;
  };
};

const injectedScript = /^(?:chrome-extension|moz-extension|safari-web-extension|app):\/\//i;

export function filterInjectedScriptError<TEvent extends BrowserExceptionEvent>(event: TEvent) {
  const values = event.exception?.values;
  if (!values?.length || values.some((value) => !value.stacktrace?.frames?.length)) return event;
  const frames = values.flatMap((value) => value.stacktrace?.frames ?? []);
  return frames.every((frame) => frame.filename && injectedScript.test(frame.filename))
    ? null
    : event;
}
