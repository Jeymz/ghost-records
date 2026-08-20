import { isIP } from 'node:net';

function classifyIpv4(address) {
  const [first, second, third] = address.split('.').map(Number);

  if (first === 0) return 'unspecified';
  if (first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168)) {
    return 'private';
  }
  if (first === 127) return 'loopback';
  if (first === 169 && second === 254) return 'link-local';
  if (first >= 224 && first <= 239) return 'multicast';
  if (first >= 240) return 'reserved';
  if (
    first === 192 && second === 0 && third === 2 ||
    first === 198 && second === 51 && third === 100 ||
    first === 203 && second === 0 && third === 113
  ) {
    return 'documentation';
  }
  if (
    first === 100 && second >= 64 && second <= 127 ||
    first === 192 && second === 0 && third === 0 ||
    first === 198 && (second === 18 || second === 19)
  ) {
    return 'reserved';
  }
  return 'public';
}

function classifyIpv6(address) {
  const normalized = address.toLowerCase();

  if (normalized === '::') return 'unspecified';
  if (normalized === '::1') return 'loopback';
  if (normalized.startsWith('fe80:')) return 'link-local';
  if (/^f[ef][0-9a-f]{0,2}:/u.test(normalized)) return 'multicast';
  if (/^(?:fc|fd)[0-9a-f]{2}:/u.test(normalized)) return 'private';
  if (normalized.startsWith('2001:db8:')) return 'documentation';
  if (normalized.startsWith('::ffff:')) return 'reserved';
  return 'public';
}

export function classifyAddress(address) {
  const family = isIP(address);

  if (family === 4) return classifyIpv4(address);
  if (family === 6) return classifyIpv6(address);
  return 'unknown';
}
