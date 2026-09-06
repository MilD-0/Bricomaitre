import { lookup as lookupDns } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

type LookupAddress = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

const nonPublicAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const) {
  nonPublicAddresses.addSubnet(address, prefix, 'ipv4');
}
for (const [address, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
] as const) {
  nonPublicAddresses.addSubnet(address, prefix, 'ipv6');
}

export function isPublicIpAddress(address: string) {
  const normalized = address.split('%', 1)[0];
  const family = isIP(normalized);
  if (!family) return false;
  // BlockList handles IPv4-mapped IPv6 in both dotted and hexadecimal notation.
  return !nonPublicAddresses.check(normalized, family === 4 ? 'ipv4' : 'ipv6');
}

const defaultLookupAll: LookupAll = (hostname) =>
  lookupDns(hostname, { all: true, verbatim: true });

export async function isSafeRemoteHttpsUrl(value: string, lookupAll: LookupAll = defaultLookupAll) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return false;

  const literalAddress = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literalAddress)) return isPublicIpAddress(literalAddress);

  try {
    const addresses = await lookupAll(url.hostname);
    return addresses.length > 0 && addresses.every(({ address }) => isPublicIpAddress(address));
  } catch {
    return false;
  }
}
