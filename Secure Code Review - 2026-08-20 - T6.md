# Secure Code Review — 2026-08-20 — T6

**Author:** Manus AI

**Scope:** T6 bounded DNS-only resolution evidence collection on `feat-ghost_records_v2_implementation`

**Reviewed diff:** T5 commit `6e39bb9` through the uncommitted T6 candidate

**Overall disposition:** **Accept with documented resolver-trust limitations.** The changed DNS collector uses only the native DNS resolver API, validates resolver inputs at a strict AJV boundary, enforces bounded chain/query/concurrency/timeout/answer behavior, and contains no HTTP/TLS/service-probing path. Two implementation findings were remediated during review. The remaining limitation is that the native API cannot prove DNSSEC, authoritative-server provenance, or the concrete system resolver transport; this must remain an evidence-confidence constraint rather than a silent security conclusion.

## 1. Executive Summary

The T6 change adds the path **validated DNS request → hostname normalization → bounded native DNS resolver → CNAME chain → A/AAAA TTL answers → canonical DNS observation**. The collector operates on hostnames only and rejects URLs, ports, wildcards, whitespace, and IP literals. It does not use HTTP, TLS, sockets, child processes, shell commands, provider mutations, persistence writes, or resource-claiming behavior.

The resolver runs through `node:dns/promises`, which performs DNS protocol resolution rather than the operating-system `dns.lookup()` path. Each query has a timeout and cancellation path; CNAME depth, total query count, terminal answer count, and concurrent observations are centrally configured and range-validated. Errors become explicit `NXDOMAIN`, `NODATA`, `SERVFAIL`, `REFUSED`, `TIMEOUT`, or coverage-gap evidence; no failure is converted into a clean empty success.

| Metric | Result |
| --- | --- |
| Resolved implementation findings | 2 |
| Residual material limitation | 1 medium operational/evidence-confidence limitation |
| Informational scope observations | 1 |
| Current unit test result | 87 passed; 1 owner-provided MySQL integration test skipped |

## 2. Scope and Assumptions

### Repository-confirmed scope

The review covers `src/dns/`, T6 extensions to the central config and canonical schemas, DNS fixtures/tests, the architecture guard, and `docs/dns/dns-only-resolution.md`. The legacy Bash scanner has no diff. The changed source contains no `fetch`, HTTP, HTTPS, TLS, datagram, child-process, or service-probing import/use in the DNS module.

The resolver receives a `recordKey`, hostname target, and query type through `validateDomainObject('dnsResolutionRequest', ...)`. It runs bounded CNAME/A/AAAA lookups using the runtime’s system-configured resolver and returns an immutable canonical observation. No HTTP route, user authentication, credential, filesystem, database, or report-generation path is added in T6.

### Operator-stated assumptions

The application is self-hosted and intended for owner-controlled internal deployment. The owner configures DNS infrastructure, egress, secret delivery, and scan scope. V2 is DNS-only; it must not probe application endpoints or claim resources.

### `UNKNOWN` items

> **UNKNOWN:** No owner-controlled resolver, split-horizon environment, DNSSEC policy, or production DNS egress configuration was available for integration validation. Fixtures validate code behavior but do not prove runtime resolver provenance or DNSSEC enforcement.

> **ASSUMPTION:** The container/runtime resolver is operated by the deployment owner and is an approved DNS egress path. T6 reports it only as `system-configured`; it does not assert resolver address, transport, DNSSEC state, or authoritative origin.

## 3. Strengths

- `src/domain/schemas.js` defines strict `dnsResolutionRequest`, batch-request, and enriched `dnsObservation` schemas. Unknown properties are rejected and all observations carry explicit coverage and resolver-limit evidence.
- `src/dns/hostname.js` rejects URL syntax, ports, wildcard input, whitespace, and IP literals before DNS work begins.
- `src/dns/resolver.js` uses `node:dns/promises` and bounds CNAME depth, total queries, timeout, answer volume, and the concurrency of both direct and batch calls.
- `src/dns/resolver.js` preserves explicit failure states. `ENODATA` remains a complete no-data observation, while timeout, NXDOMAIN, SERVFAIL, refusal, chain-cycle, depth, query-limit, malformed response, and partial family failure are distinguishable.
- `src/dns/address-classification.js` classifies terminal answers locally without making secondary network calls or treating private/split-horizon evidence as a security conclusion.
- `src/test/persistence/architecture-boundary.test.js` rejects HTTP, HTTPS, TLS, datagram, process-execution, socket-connect, and `fetch` paths from the DNS module.

## 4. Prioritized Findings

### T6-SCR-001 — Resolved: Direct resolution calls could have bypassed the configured concurrency limit

| Field | Assessment |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Resource exhaustion / operational control |
| Where | `src/dns/resolver.js:251-274, 294-380` |
| Status | Resolved before commit |

**Risk and impact.** A batch-local worker cap alone would not limit callers that invoke `resolve()` repeatedly. High-volume callers could otherwise create more active DNS observations than the owner-configured ceiling, increasing DNS egress volume and reducing predictable worker behavior.

**Evidence.** The initial design had a bounded `resolveMany` worker pool but exposed `resolve` directly. The implementation now wraps both entry points in a shared `createConcurrencyLimiter`. `src/test/dns/resolver.test.js` verifies that a second direct call remains queued until the first observation completes when `maxConcurrency` is one.

**Recommendation and verification.** The remediation is complete. Preserve the direct-call concurrency test whenever the resolver API is extended; any future streaming or job scheduler must use the same limiter or a documented higher-level lease/concurrency boundary.

### T6-SCR-002 — Resolved: Duplicate terminal DNS answers could violate canonical evidence uniqueness

| Field | Assessment |
| --- | --- |
| Severity | Low |
| Confidence | High |
| Category | Input normalization / evidence availability |
| Where | `src/dns/resolver.js:101-130` |
| Status | Resolved before commit |

**Risk and impact.** The canonical observation schema requires unique answer records. A resolver returning duplicate A or AAAA records could have caused the canonical validation boundary to reject an otherwise usable observation, transforming a benign upstream duplicate into an avoidable collection failure.

**Evidence.** `normalizeAnswerRecords` now deduplicates by address and retains the shortest observed TTL. `src/test/dns/resolver.test.js` verifies duplicate inputs become one answer record with the most conservative TTL.

**Recommendation and verification.** The remediation is complete. Keep this behavior documented as normalization rather than DNS authority inference; future record metadata should preserve only data that the native resolver actually returns.

### T6-SCR-003 — Residual: Native system resolver evidence cannot establish DNSSEC or authoritative provenance

| Field | Assessment |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Trust boundary / evidence confidence |
| Where | `src/dns/resolver.js:66-76`; `docs/dns/dns-only-resolution.md` |
| Status | Open operational limitation |

**Risk and impact.** Node’s native resolver API returns DNS records but does not expose the system resolver address/transport, authoritative-server path, DNSSEC validation result, or resolver policy details. A compromised, misconfigured, or split-horizon resolver could return answers that appear technically well-formed but are not representative of intended public DNS. This must not become a confirmed takeover/ownership conclusion.

**Evidence.** Every observation records `resolver: 'system-configured'` and `transport: 'system'`. The source does not configure upstream DNS servers or validate DNSSEC. `docs/dns/dns-only-resolution.md` explicitly records the limitation.

**Recommendation.** Deployment guidance should require owner-managed DNS egress policy, an approved resolver, and split-horizon validation. Future policy/analyzer tasks must retain resolver provenance/coverage context and must not elevate a single T6 observation to a confirmed ownership or takeover finding.

**Verification.** In an owner-controlled test environment, execute fixture-equivalent observations through the intended resolver; confirm private/split-horizon names produce expected classified evidence, resolver failures remain coverage gaps, and no application endpoint traffic occurs.

### T6-SCR-004 — Informational: DNS collection intentionally permits externally hosted CNAME targets

| Field | Assessment |
| --- | --- |
| Severity | Informational |
| Confidence | High |
| Category | Intended outbound DNS behavior |
| Where | `src/dns/hostname.js:12-40`; `src/dns/resolver.js:298-380` |
| Status | Intentional, documented scope |

**Risk and impact.** Resolving an external CNAME target necessarily sends DNS queries for that target. This is product-required behavior for detecting unresolved/external dependencies, but it means a malicious or unexpected target can cause DNS-only egress to a hostname outside an owner’s zones.

**Evidence.** Input normalization prevents URL/service endpoints and raw addresses, but does not restrict valid hostnames to owned zones. This aligns with the approved objective to inspect CNAME chains and terminal answers.

**Recommendation and verification.** Maintain infrastructure DNS-egress controls and scan-scope governance. Do not add HTTP/TLS follow-on behavior. The existing architecture test must remain in place and expand if new DNS client modules appear.

## 5. Code Quality Notes

The resolver correctly centralizes limits but has no current runtime logger invocation. This is acceptable for the isolated T6 library because no worker/job or HTTP request entrypoint exists yet; future scan orchestration should emit safe standalone collection events through the established logger without logging raw DNS responses unnecessarily.

The answer classification table is intentionally contextual. It is not a geolocation, ownership, reputation, or security verdict. IPv4/IPv6 special-purpose ranges evolve over time, so this helper should be reviewed when a later analyzer begins using classifications for severity or remediation logic.

## 6. Remediation Plan

| Priority | Action | Owner |
| --- | --- | --- |
| Quick win | Validate intended resolver behavior, split-horizon records, and DNS egress policy in an owner-controlled non-production environment. | Deployment owner |
| Quick win | Confirm resolver timeout and negative-answer behavior against the organization’s DNS infrastructure. | Deployment owner / Application Security |
| Medium | Ensure later worker orchestration emits safe standalone DNS collection events and retains coverage context. | Product team |
| Structural | Reassess DNSSEC, resolver provenance, authoritative-query requirements, and multi-resolver comparison only if a future approved design requires stronger evidence confidence. | Product owner / Application Security |

## 7. Suggested Follow-Up Validation

Run `npm ci`, `npm run audit`, `npm run lint`, `npm run test:run`, `npm run test:integration`, `npm run coverage`, and `npm run build`. Review the staged T6 diff for new HTTP/TLS/application-probing imports, `fetch`, dynamic resolver-server configuration, direct `process.env` access, DNS response logging, or endpoint/resource-claim behavior.

Before scheduled deployment, the owner should verify that an intended internal/public resolver is available to the runtime, conduct split-horizon test lookups, confirm external CNAME DNS queries meet policy, and preserve DNS-only egress boundaries.

## 8. Open Questions

| Question | Owner | Reason |
| --- | --- | --- |
| Does the owner require DNSSEC validation or authoritative-server evidence in a future release? | Product owner / Application Security | Node’s system resolver API does not expose either control in T6. |
| Which resolver address, egress policy, and split-horizon conventions apply to each target deployment? | Deployment owner | The T6 observation intentionally records `system-configured`, not a claimed resolver identity. |
| Should later scan orchestration log per-observation metadata, summaries only, or coverage transitions? | Product owner / Application Security | T6 provides library evidence only; T11 will add worker coordination. |
