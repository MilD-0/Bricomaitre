export type DependencyCheck = {
  configured: boolean;
  ok: boolean;
  latencyMs: number | null;
  error?: string;
};

export async function runDependencyCheck(options: {
  configured: boolean;
  label: string;
  execute: () => Promise<unknown>;
  timeoutMs?: number;
}): Promise<DependencyCheck> {
  if (!options.configured) {
    return {
      configured: false,
      ok: false,
      latencyMs: null,
      error: `${options.label} is not configured`,
    };
  }

  const timeoutMs = options.timeoutMs ?? 1_500;
  const startedAt = performance.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      options.execute(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${options.label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);

    return {
      configured: true,
      ok: true,
      latencyMs: Number((performance.now() - startedAt).toFixed(1)),
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      latencyMs: Number((performance.now() - startedAt).toFixed(1)),
      error: error instanceof Error ? error.message : `Unknown ${options.label} error`,
    };
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
