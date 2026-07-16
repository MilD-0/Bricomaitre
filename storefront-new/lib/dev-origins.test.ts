import { describe, expect, it } from 'vitest';

import { getAllowedDevOrigins } from './dev-origins';

describe('development origins', () => {
  it('allows loopback and active external IPv4 addresses used by physical phones', () => {
    expect(getAllowedDevOrigins({
      lo: [{
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8',
      }],
      wifi: [{
        address: '192.168.202.47',
        netmask: '255.255.255.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:01',
        internal: false,
        cidr: '192.168.202.47/24',
      }],
      vpn: [{
        address: '::1',
        netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
        family: 'IPv6',
        mac: '00:00:00:00:00:02',
        internal: false,
        cidr: '::1/128',
        scopeid: 0,
      }],
    })).toEqual(['127.0.0.1', '192.168.202.47']);
  });
});
