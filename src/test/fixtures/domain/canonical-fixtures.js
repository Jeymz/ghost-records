export const observedAt = '2026-08-19T19:30:00.000Z';

export const providerAccount = {
  provider: 'route53',
  accountId: '123456789012',
  displayName: 'production-route53',
  collectionScope: 'approved-zones',
  observedAt,
};

export const dnsZone = {
  provider: 'route53',
  providerAccountId: '123456789012',
  zoneId: 'Z1234567890',
  name: 'example.com.',
  visibility: 'public',
  observedAt,
};

export const dnsRecord = {
  recordKey: 'route53:Z1234567890:CNAME:app.example.com',
  provider: 'route53',
  providerAccountId: '123456789012',
  zoneId: 'Z1234567890',
  recordId: 'app.example.com-CNAME',
  fqdn: 'app.example.com.',
  type: 'CNAME',
  values: ['service.example.net.'],
  ttl: 300,
  alias: null,
  version: 'etag-001',
  observedAt,
};

export const dnsObservation = {
  recordKey: dnsRecord.recordKey,
  queryName: 'app.example.com.',
  queryType: 'CNAME',
  chain: ['app.example.com.', 'service.example.net.'],
  terminalName: 'service.example.net.',
  answers: ['203.0.113.10'],
  answerRecords: [
    {
      address: '203.0.113.10',
      family: 4,
      ttl: 300,
      classification: 'documentation',
    },
  ],
  rcode: 'NOERROR',
  coverage: { status: 'complete', reason: 'complete' },
  resolverEvidence: {
    resolver: 'system-configured',
    transport: 'system',
    queriedAt: observedAt,
    queryCount: 3,
    maxQueries: 32,
    maxDepth: 8,
    timeoutMs: 3000,
  },
  observedAt,
};

export const dnsResolutionRequest = {
  recordKey: dnsRecord.recordKey,
  target: 'service.example.net.',
  queryType: 'CNAME',
};

export const ownershipEvidence = {
  subject: '203.0.113.10',
  source: 'aws-eip-inventory',
  scope: 'account:123456789012',
  classification: 'owned',
  confidence: 'high',
  observedAt,
  coverage: 'complete',
};

export const completeCoverageEvent = {
  component: 'route53-collection',
  provider: 'route53',
  scope: 'zone:Z1234567890',
  status: 'complete',
  reason: 'complete',
  observedAt,
};

export const partialCoverageEvent = {
  component: 'route53-collection',
  provider: 'route53',
  scope: 'zone:Z0987654321',
  status: 'partial',
  reason: 'throttling',
  observedAt,
};

export const authorizationFailureCoverageEvent = {
  component: 'route53-collection',
  provider: 'route53',
  scope: 'account:123456789012',
  status: 'failed',
  reason: 'authorization',
  observedAt,
};

export const paginationFailureCoverageEvent = {
  component: 'route53-collection',
  provider: 'route53',
  scope: 'zone:Z1234567890',
  status: 'failed',
  reason: 'pagination',
  observedAt,
};

export const scanJob = {
  jobId: 'scan-job-001',
  scope: 'zone:Z1234567890',
  status: 'completed',
  leaseOwner: null,
  leaseExpiresAt: null,
  startedAt: observedAt,
  completedAt: observedAt,
};

export const finding = {
  findingId: 'finding-001',
  type: 'cname-resolution-drift',
  severity: 'medium',
  confidence: 'high',
  recordKey: dnsRecord.recordKey,
  evidenceRefs: ['observation-001'],
  status: 'open',
  firstSeenAt: observedAt,
  lastSeenAt: observedAt,
  remediation: 'Confirm the target address and ownership boundary.',
};

export const scanArtifact = {
  artifactId: 'artifact-001',
  jobId: scanJob.jobId,
  schemaVersion: '2.0.0',
  format: 'json',
  contentHash: 'a'.repeat(64),
  recordCount: 1,
  createdAt: observedAt,
};

export const providerCollectionRequest = {
  provider: 'route53',
  providerAccountId: providerAccount.accountId,
  scope: providerAccount.collectionScope,
  zoneIds: [dnsZone.zoneId],
};

export const providerSuccessOutcome = {
  outcome: 'success',
  provider: 'route53',
  providerAccount,
  zones: [dnsZone],
  records: [dnsRecord],
  coverageEvents: [completeCoverageEvent],
};

export const providerPartialOutcome = {
  outcome: 'partial',
  provider: 'route53',
  providerAccount,
  zones: [dnsZone],
  records: [dnsRecord],
  coverageEvents: [partialCoverageEvent],
};

export const providerAuthorizationFailureOutcome = {
  outcome: 'failure',
  provider: 'route53',
  providerAccountId: providerAccount.accountId,
  coverageEvents: [authorizationFailureCoverageEvent],
  failure: {
    category: 'authorization',
    retryable: false,
  },
};

export const providerPaginationFailureOutcome = {
  outcome: 'failure',
  provider: 'route53',
  providerAccountId: providerAccount.accountId,
  coverageEvents: [paginationFailureCoverageEvent],
  failure: {
    category: 'pagination',
    retryable: true,
  },
};

export const ownershipEvidenceRequest = {
  subject: '203.0.113.10',
  subjectType: 'ipv4',
  scope: 'account:123456789012',
  provider: 'route53',
};

export const ownershipSuccessOutcome = {
  outcome: 'success',
  evidence: ownershipEvidence,
};
