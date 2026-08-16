import { describe, expect, it, vi } from 'vitest';

import { isPublicIpAddress, isSafeRemoteHttpsUrl } from './remote-url-safety';

describe('remote URL safety', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.2',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('rejects non-public address %s', (address) => expect(isPublicIpAddress(address)).toBe(false));

  it.each(['93.184.216.34', '2606:4700:4700::1111'])('accepts public address %s', (address) =>
    expect(isPublicIpAddress(address)).toBe(true),
  );

  it('requires HTTPS without embedded credentials and rejects hostnames resolving to any private address', async () => {
    const publicLookup = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    const mixedLookup = vi.fn().mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.2', family: 4 },
    ]);

    await expect(
      isSafeRemoteHttpsUrl('https://cdn.example.test/image.jpg', publicLookup),
    ).resolves.toBe(true);
    await expect(
      isSafeRemoteHttpsUrl('https://cdn.example.test/image.jpg', mixedLookup),
    ).resolves.toBe(false);
    await expect(
      isSafeRemoteHttpsUrl('http://cdn.example.test/image.jpg', publicLookup),
    ).resolves.toBe(false);
    await expect(
      isSafeRemoteHttpsUrl('https://user:pass@cdn.example.test/image.jpg', publicLookup),
    ).resolves.toBe(false);
  });
});
