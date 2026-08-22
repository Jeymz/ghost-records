# Secure Code Review — 2026-08-22 — T8

## Executive Summary

This review covers the T8 diff for minimized RDAP registration observations, historical-evidence persistence, retention, and related configuration. The deployment model is **operator-stated** as self-hosted and internally reachable; the new RDAP acquisition flow is an outbound Internet trust boundary. **Repository-confirmed** controls include centralized AJV configuration/domain validation, owner-approved RDAP service-root allowlisting, fixed IANA bootstrap access, HTTPS-only root normalization, redirect refusal, response-size/time bounds, Sequelize-only persistence, leased retention, and architecture tests forbidding WHOIS and raw RDAP response storage.

The review found three code-anchored implementation issues during T8 development. All three were remediated before this report: response-body allocation before enforcement, bootstrap cache reuse across domain suffixes, and configuration that could otherwise leave a future raw-evidence path insufficiently constrained. No unresolved Critical, High, or Medium code finding remains in the reviewed T8 diff. `UNKNOWN`: an owner-provided non-production RDAP validation run has not occurred, so real registry compatibility, allowlist completeness, rate limits, and egress policy behavior remain operational follow-ups.

## Scope and Assumptions

| Item | Assessment |
| --- | --- |
| In scope | `src/registration/`, `src/history/`, `src/retention/`, T8 Sequelize models/repositories/migration, central configuration/domain schemas, tests, and operational documentation. |
| Out of scope | HTTP/API/UI/authentication; WHOIS; raw-evidence encryption/capture; DNS probing; analyzer findings; reporting artifacts; MySQL/PXC production integration. |
| Sensitive data | Registration responses can include contact/vCard values and other personal data. T8 stores only minimized fields. |
| Outbound trust boundary | Fixed IANA bootstrap request, then HTTPS roots selected from bootstrap data **and** an owner-configured allowlist. |
| Database ownership | Operator-stated owner-managed MySQL/PXC; the local opt-in integration test has not received an owner database. |

## Strengths

The `input → validation → sink` flows are deliberately narrow. Runtime structured configuration is parsed and AJV-validated before normalization in `src/config/load-configuration.js`; normalized RDAP roots are then constrained to credential-free HTTPS hostnames. A registration request is validated through `registrationObservationRequest` before `src/registration/rdap-client.js` builds an outbound URL. The client accepts a root only when the IANA bootstrap suffix mapping and the owner allowlist intersect, then projects a response to a minimized registration object and validates that projection before the Sequelize repository persists it.

The RDAP client rejects redirects, response bodies larger than one megabyte, malformed JSON, non-domain object classes, and mismatched returned domains. It does not retain raw response bodies. The architecture regression at `src/test/persistence/architecture-boundary.test.js` rejects WHOIS, raw-response symbols, redirect following, and non-RDAP network imports in the registration module. The retention path uses a row-locked database lease and bounded model deletion; it emits counts rather than deleted content.

## Prioritized Findings

### T8-SCR-1 — Response-size enforcement occurred after full body allocation — **Remediated**

| Field | Evidence |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Outbound resource exhaustion |
| Where | `src/registration/rdap-client.js`, previous response-body handling path; regression in `src/test/registration/rdap-client.test.js`. |
| Risk and impact | A malicious or faulty RDAP service could send a large response. Checking size only after full text allocation permits avoidable heap pressure. |
| Remediation | The client now checks declared content length and reads `Response.body` incrementally, canceling the reader once the one-megabyte limit is crossed. |
| Verification | The oversized-response regression passes; normal bootstrap and domain fixtures still pass. |

### T8-SCR-2 — Bootstrap cache risked returning a first-domain suffix mapping for later domains — **Remediated**

| Field | Evidence |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Evidence integrity / outbound destination correctness |
| Where | `src/registration/rdap-client.js`, bootstrap cache and `extractBootstrapRoots`; regression in `src/test/registration/rdap-client.test.js`. |
| Risk and impact | Caching roots instead of the validated bootstrap document could reuse `.com` roots for a later `.net` lookup, producing invalid evidence or an incorrect allowed destination decision. |
| Remediation | The cache now stores the bootstrap document and re-evaluates longest-suffix roots for every requested domain. |
| Verification | The cross-suffix cache regression proves that `.com` and `.net` lookups use their own bootstrap mappings while making only one bootstrap request. |

### T8-SCR-3 — Raw registration evidence required an explicit hard-disable rather than a future plaintext toggle — **Remediated**

| Field | Evidence |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Privacy / sensitive-data retention |
| Where | `src/config/schemas.js`, `src/config/load-configuration.js`, and `docs/registration/rdap-minimized-evidence.md`. |
| Risk and impact | RDAP entity/vCard values can include contact data. A general raw-capture boolean without an approved encryption/key-management boundary would create an avoidable plaintext persistence risk. |
| Remediation | T8 enforces `GHOST_RECORDS_RAW_EVIDENCE_ENABLED=false` and `GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS=0`; no raw-response model, repository path, or registration-client output exists. |
| Verification | Configuration regression tests reject a true raw-evidence setting, the migration test confirms no raw evidence table, and the architecture test rejects raw response symbols. |

## Code Quality Notes

The T8 diff is focused and uses existing seams. It does, however, add several persistence entities ahead of T9/T10 consumers. This is plan-aligned, but future work should avoid exposing raw Sequelize models outside the existing repository/service boundary. The current RDAP response projection intentionally ignores extension fields and entities except a registrar handle; this is appropriate for minimized evidence, but operators will need allowlist updates as desired TLD coverage expands.

## Remediation Plan

**Quick wins:** Run the documented non-production RDAP smoke test with a single allowlisted public registry root and verify that logs contain no domain response content or contact data. Confirm owner egress rules permit only the IANA bootstrap source and approved RDAP roots.

**Medium fixes:** Before enabling any future raw evidence, design and approve envelope encryption, key rotation, operator key custody, export exclusions, and a dedicated secure review. Add a controlled test database to exercise the T8 migration and leased retention path against supported MySQL/PXC.

**Structural guardrails:** Add CI secret/PII scanning as part of the future CI task, maintain an operator review process for RDAP root allowlist changes, and retain the architecture test that prevents WHOIS/raw-response drift.

## Suggested Follow-up Validation

1. Use a non-production domain with an owner-approved registry root and verify IANA bootstrap selection, exact root allowlisting, and minimized persistence.
2. Run the owner-provided MySQL/PXC integration path with the T8 migration, a retention actor, expired rows, and a contention scenario.
3. Validate that RDAP server rate limits or a 404 produce coverage evidence rather than an ownership or takeover conclusion.
4. Confirm that retention logs contain aggregate counts only and that database rows contain no entity/vCard/contact fields.

## Open Questions

| Question | Owner |
| --- | --- |
| Which RDAP service roots should be approved for the organization’s enabled TLDs? | Application Security and DNS owner |
| What outbound egress policy and proxy behavior applies to IANA and RDAP roots? | Infrastructure owner |
| When is encrypted raw evidence justified, and who owns key rotation/recovery? | Application Security and service owner |
| Which non-production MySQL/PXC environment will validate the T8 migration and retention lease? | Database owner |
