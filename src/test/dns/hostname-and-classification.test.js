import { describe, expect, it } from 'vitest';

import { classifyAddress } from '../../dns/address-classification.js';
import { normalizeHostname } from '../../dns/hostname.js';

describe('DNS target normalization', () => {
  it('normalizes hostnames without treating them as URLs or service endpoints', () => {
    expect(normalizeHostname('App.Example.COM.')).toBe('app.example.com.');

    for (const target of [
      'https://app.example.com',
      'app.example.com:443',
      '*.example.com',
      '127.0.0.1',
      'app example.com',
    ]) {
      expect(() => normalizeHostname(target)).toThrow('DNS resolution target');
    }
  });
});

describe('DNS terminal address classification', () => {
  it('classifies public, private, documentation, reserved, loopback, link-local, and IPv6 ranges deterministically', () => {
    expect(classifyAddress('8.8.8.8')).toBe('public');
    expect(classifyAddress('10.0.0.1')).toBe('private');
    expect(classifyAddress('192.0.2.42')).toBe('documentation');
    expect(classifyAddress('198.18.0.1')).toBe('reserved');
    expect(classifyAddress('127.0.0.1')).toBe('loopback');
    expect(classifyAddress('169.254.1.1')).toBe('link-local');
    expect(classifyAddress('2001:db8::1')).toBe('documentation');
    expect(classifyAddress('fd00::1')).toBe('private');
    expect(classifyAddress('fe80::1')).toBe('link-local');
    expect(classifyAddress('ff02::1')).toBe('multicast');
  });
});
