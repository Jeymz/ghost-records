# Secure Code Review — 2026-08-19

## Executive Summary

This focused review covers the T2 diff on branch `feat-ghost_records_v2_implementation`: the AJV configuration loader and schemas, application error taxonomy, structured logger, recursive redaction helper, associated unit tests, and the addition of AJV. Changed files were reviewed first, then compared against the v2 plan and repository engineering constitution.

The new configuration path is a meaningful security improvement over the pre-T2 foundation. It centralizes the only new `process.env` access, allowlists Ghost Records runtime keys, applies strict AJV validation before normalized configuration is returned, and deep-freezes the resulting object. The logger uses stable logical sources, performs recursive redaction, and now preserves canonical message/source/level metadata against caller attributes.

The review identified three code-anchored risks during T2 implementation. All three were remediated in the current diff and have regression tests. The primary residual risk is not a current defect but an implementation gap: no worker or HTTP request pipeline exists yet, so the configuration/logger contract must be correctly adopted by later tasks rather than bypassed with direct environment reads or ad hoc logging.

| Review dimension | Result |
| --- | --- |
| Scope | T2 configuration, validation, errors, redaction, logging, tests, and AJV dependency. |
| Exposure assumption | Operator-stated recommended deployment is internal-only through VPN/zero trust; no HTTP listener is implemented in T2. |
| Changed-file validation | `npm run lint` and `npm run test:run` pass after remediation. |
| Dependency posture | `npm audit --audit-level=high` reported zero vulnerabilities during T2 installation. |
| Material findings | Three resolved findings; no open High/Critical repository-confirmed finding in the T2 diff. |

## Scope and Assumptions

**Repository-confirmed:** T2 introduces `src/config/load-configuration.js`, `src/config/schemas.js`, `src/errors/application-error.js`, `src/logging/logger.js`, and `src/logging/redact.js`. There is no Express server, database integration, provider adapter, DNS worker implementation, route, session, or deployment artifact in scope. The only T2 runtime dependency is AJV as recorded in `package.json`.

**Operator-stated:** V2 must remain DNS-only, use externally provided MySQL/PXC configuration, default its control plane to disabled, and avoid exposing secrets in logs. The recommended future deployment is internal-only, but deployment choices remain owner-controlled.

**ASSUMPTION:** Future worker and control-plane entrypoints will call `loadConfiguration()` once during startup and will use `createLogger()` rather than directly accessing environment values or writing arbitrary console records.

**UNKNOWN:** The exact future secret-delivery platform, trusted ingress configuration, database topology, and provider credential scopes are not implemented or testable in T2.

## Strengths

The configuration loader projects only allowlisted Ghost Records keys and rejects unknown `GHOST_RECORDS_*` keys before normalizing values (`src/config/load-configuration.js:58–79`). It validates raw string configuration and the normalized structured result with strict AJV schemas, whose objects set `additionalProperties: false` (`src/config/schemas.js:39–109`, `139–218`). This is a strong foundation for the repository’s validation constitution.

The design preserves the DNS-only boundary at configuration time by requiring `GHOST_RECORDS_DNS_ONLY` to equal `true` (`src/config/schemas.js:69–72`). It also retains safe defaults for disabled control-plane behavior, TLS enabled, modest connection-pool values, and raw evidence disabled (`src/config/load-configuration.js:23–39`).

The logger has a stable caller-independent source (`src/logging/logger.js:38–70`) and provides a reusable HTTP request-record validator that requires `reqInfo.requestID` and `reqInfo.hostname` (`src/logging/logger.js:14–23`). Recursive redaction protects nested sensitive fields and detects cycles (`src/logging/redact.js:4–30`).

## Prioritized Findings

### F-1: Safe application-error serialization could expose sensitive `details` fields — Resolved

| Field | Assessment |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Secrets / error handling |
| Where | `src/errors/application-error.js:1–18`; regression coverage in `src/test/errors/application-error.test.js:10–29`. |
| Risk | A caller can include secret-bearing values in `details`; returning that object directly from `toSafeJSON()` could propagate it to a future response or log sink. |
| Impact | Database passwords, provider credentials, session data, or tokens could be exposed through error handling. |
| Evidence | The initial T2 error object returned `this.details` without sanitization. The final diff imports the centralized `redact()` helper and applies it before safe serialization. |
| Recommendation | **Implemented:** retain centralized redaction on all `toSafeJSON()` details and prohibit direct serializing of raw causes. |
| Verification | The regression test creates a configuration error with a password and asserts the safe JSON contains `[REDACTED]`; `npm run test:run` passes. |

### F-2: Logger attributes could overwrite canonical source, level, or message — Resolved

| Field | Assessment |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Logging integrity / repudiation |
| Where | `src/logging/logger.js:52–58`; regression coverage in `src/test/logging/logger.test.js:16–46`. |
| Risk | If user-controlled or otherwise untrusted attributes are logged, spreading attributes after the canonical log fields permits them to replace `source`, `level`, or `message`. |
| Impact | Tampered log classification or source attribution can undermine central ingestion, alerting, and incident investigation. |
| Evidence | The initial object construction placed `...attributes` after canonical metadata. The final diff places attributes first and writes canonical fields afterward. |
| Recommendation | **Implemented:** preserve canonical metadata precedence. Continue to keep route/request-derived fields nested under dedicated structures in later HTTP work. |
| Verification | The logger regression test supplies untrusted `source`, `level`, and `message` attributes and asserts the emitted record retains the trusted values. |

### F-3: Sensitive-key detection did not include common cloud access-key names — Resolved

| Field | Assessment |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Secrets / logging redaction |
| Where | `src/logging/redact.js:1–33`; regression coverage in `src/test/logging/logger.test.js:16–46`. |
| Risk | `awsAccessKeyId` and similarly named access-key fields would not match the initial sensitive-key pattern. |
| Impact | Provider credential material may be emitted to the centralized log pipeline. |
| Evidence | The initial pattern included API keys, tokens, passwords, and secrets but omitted `accessKey`. The final pattern explicitly includes `access[-_]?key`. |
| Recommendation | **Implemented:** retain this centralized pattern and add representative fields whenever a future identity/provider adapter introduces a new secret-bearing key convention. |
| Verification | The logger regression test injects `awsAccessKeyId` and asserts it becomes `[REDACTED]`. |

## Code Quality Notes

The configuration schema and normalization logic are concentrated in a small set of modules and are straightforward to test. The two-stage AJV validation is appropriate because it validates both raw environment strings and the normalized application object. `GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON` intentionally carries only environment-variable names, not secret values; later adapters must preserve this separation.

The error module imports the redaction helper from the logging area. This works without a circular import today, but future module growth should consider moving redaction into a neutral `security` or `observability` utility layer so errors and logging can depend on the same lower-level service without layering ambiguity. This is an **Informational** maintainability note, not a current vulnerability.

The logger validates its own internally constructed records but does not use AJV. This is acceptable in T2 because logger calls are internal programming interfaces rather than an external trust boundary. HTTP, worker-message, artifact, provider-response, and administrative inputs must use centralized AJV schemas before reaching logger or business logic in their respective tasks.

## Remediation Plan

| Timeframe | Action |
| --- | --- |
| Quick wins | Preserve the new redaction and metadata-precedence tests; keep `npm run audit`, lint, test, coverage, and build required for each task. |
| Medium fixes | In T3/T4, add schema-backed configuration for database/provider domains and enforce startup use of `loadConfiguration()` from the actual application entrypoints. |
| Structural guardrails | Add an architectural regression check once entrypoints exist to reject direct `process.env` reads outside the configuration module; move redaction to a neutral shared layer if module dependency growth warrants it; run focused secure reviews after T3, T12–T15A, and T20. |

## Suggested Follow-up Validation

T3 should verify that Sequelize database configuration is sourced only from `loadConfiguration()` and that database failure logs do not disclose connection strings or passwords. T4/T5 should validate every provider response using centralized schemas and confirm provider credentials never appear in fixtures, errors, reports, or log records. T12 should use the logger’s HTTP record support to meet the request/application linked-log contract with a trusted-proxy design. T15A should test export/log/error paths for the same redaction guarantees.

## Open Questions

| Question | Owner |
| --- | --- |
| Which secret-manager integrations will be added after v2 environment-variable support? | Product / Platform Engineering |
| What trusted proxy networks and TLS termination modes are supported in each deployment template? | Platform / deployment owner |
| Which provider-specific credential key naming conventions need redaction fixtures when adapters are implemented? | Engineering + Application Security |
| Should a neutral shared redaction module replace the current logging-owned helper after additional modules depend on it? | Engineering during T3/T4 architecture review |
