import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

type NetworkInterfaces = NodeJS.Dict<NetworkInterfaceInfo[]>;

export function getAllowedDevOrigins(interfaces: NetworkInterfaces = networkInterfaces()) {
  const origins = new Set(['127.0.0.1']);

  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (!address.internal && address.family === 'IPv4') {
        origins.add(address.address);
      }
    }
  }

  return [...origins];
}
