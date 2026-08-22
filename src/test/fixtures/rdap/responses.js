export const bootstrapResponse = Object.freeze({
  version: '1.0',
  publication: '2026-08-22T00:00:00Z',
  services: [
    [['com'], ['https://rdap.example.test/rdap/']],
    [['net'], ['https://rdap.net.example.test/']],
  ],
});

export const domainResponse = Object.freeze({
  objectClassName: 'domain',
  ldhName: 'external.example.com',
  handle: 'EXAMPLE-TEST',
  status: ['active'],
  events: [
    { eventAction: 'registration', eventDate: '2025-01-01T00:00:00Z' },
    { eventAction: 'expiration', eventDate: '2027-01-01T00:00:00Z' },
  ],
  nameservers: [{ ldhName: 'ns1.example.net' }],
  entities: [
    {
      roles: ['registrar'],
      handle: 'REGISTRAR-TEST',
      vcardArray: ['vcard', [['fn', {}, 'text', 'must-not-persist']]],
    },
    {
      roles: ['registrant'],
      handle: 'REGISTRANT-TEST',
      vcardArray: ['vcard', [['email', {}, 'text', 'private@example.test']]],
    },
  ],
});

export const malformedBootstrapResponse = Object.freeze({ services: 'not-an-array' });
export const malformedDomainResponse = Object.freeze({ objectClassName: 'entity' });
