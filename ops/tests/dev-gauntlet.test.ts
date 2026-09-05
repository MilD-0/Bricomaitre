import { afterEach, describe, expect, it, vi } from 'vitest';

// @ts-expect-error CLI modules run as plain Node JavaScript.
const { gauntlet } = await import('../dev/gauntlet.mjs');

afterEach(() => vi.restoreAllMocks());

describe('gauntlet discovery without service access', () => {
  it('registers every lane and filters scenarios without opening a browser or querying fixtures', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    await gauntlet(['all', '--list']);
    const all = JSON.parse(output.mock.calls.at(-1)![0]) as Array<{ id: string }>;
    expect(new Set(all.map((item) => item.id)).size).toBe(all.length);
    for (const lane of ['storefront', 'orders', 'management']) {
      expect(all.some((item) => item.id.startsWith(`${lane}-`))).toBe(true);
      await gauntlet([
        lane,
        '--list',
        '--match',
        all.find((item) => item.id.startsWith(`${lane}-`))!.id,
      ]);
      const filtered = JSON.parse(output.mock.calls.at(-1)![0]);
      expect(filtered).toHaveLength(1);
    }
  });

  it('rejects typos and empty selections instead of silently running a different audit', async () => {
    await expect(gauntlet(['unknown', '--list'])).rejects.toThrow('Choose all');
    await expect(gauntlet(['orders', '--list', '--bogus'])).rejects.toThrow('Unknown gauntlet');
    await expect(gauntlet(['orders', '--list', '--match'])).rejects.toThrow('--match requires');
    await expect(gauntlet(['orders', '--list', '--match', 'no-such-scenario'])).rejects.toThrow(
      'No matching',
    );
  });
});
