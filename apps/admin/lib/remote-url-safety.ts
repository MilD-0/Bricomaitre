import { lookup as lookupDns } from 'node:dns/promises';
import { isIP } from 'node:net';

type LookupAddress = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<LookupAddress[]>;

function isPublicIpv4(address: string) {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  )
    return false;
  const [a, b, c] = octets;

  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

export function isPublicIpAddress(address: string) {
  const normalized = address.toLowerCase().split('%', 1)[0];
  const family = isIP(normalized);
  if (family === 4) return isPublicIpv4(normalized);
  if (family !== 6) return false;

  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPublicIpv4(mappedIpv4);

  return !(
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff') ||
    normalized.startsWith('2001:db8:')
  );
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
