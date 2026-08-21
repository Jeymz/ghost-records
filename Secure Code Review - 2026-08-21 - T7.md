# Secure Code Review — 2026-08-21 — T7

## Executive summary

The review covers the uncommitted T7 change set for the internal, self-hosted Ghost Records v2 worker. The changed surface adds a direct AWS STS/EC2 ownership-evidence path, exact-match approved-external policy evaluation, strict configuration, and associated tests. The review began from the current feature-branch diff and prioritized the direct signing, credential, XML parsing, region selection, and ownership-classification flows.

Repository-confirmed strengths include centralized AJV validation, a fixed direct AWS Query client rather than an SDK, strict XML size/depth/declaration controls, exact policy scopes, typed coverage outcomes, and architecture tests that prohibit mutable AWS calls, role assumption, ambient credential discovery, and SDK imports. Two material implementation issues discovered during this review were remediated in the task: non-calendar policy expiry acceptance and an endpoint model that could have been applied to unsupported AWS partitions.

The remaining significant validation item is operational rather than a confirmed code flaw. The native Signature Version 4 implementation has deterministic repository tests, but no owner-provided non-production AWS account has yet verified an actual signed STS/EC2 request and least-privilege IAM policy. Production credentials should not be configured until that validation is complete.

| Metric | Result |
| --- | --- |
| Review scope | T7 uncommitted direct AWS ownership and approved-external policy change set |
| Confirmed open critical/high findings | None |
| Remediated in-task findings | 2 |
| Remaining follow-up | 1 medium-confidence operational validation item |
| Review basis | Repository source/tests/docs plus operator-stated self-hosted internal deployment |

## Scope and assumptions

The in-scope files are `src/adapters/aws/query-sigv4.js`, `src/adapters/aws/client.js`, `src/adapters/aws/xml.js`, `src/adapters/ec2/ownership-adapter.js`, `src/policy/approved-external.js`, central configuration/domain schemas, architecture tests, and T7 documentation. The legacy Bash scanner, DNS resolver behavior outside T6, persistence, analyzers, control plane, authentication, and deployment manifests are out of scope.

The operator has stated that v2 is intended for internal access through a VPN or zero-trust gateway, is DNS-only, uses owner-managed infrastructure, and receives credentials through environment variables. The repository confirms that no HTTP control plane exists yet and that T7 does not make requests to scanned targets. **UNKNOWN:** No owner-provided AWS non-production account, role, region set, or IAM policy test has been supplied. **ASSUMPTION:** The configured `route53` static/session credentials are intentionally authorized to perform the approved STS and EC2 reads.

Sensitive assets are the AWS access key, secret access key, optional session token, account identifier, EIP allocation context, policy owner/reason metadata, and inventory coverage state. The central high-risk flow is: `environment JSON → AJV/configuration validation → credential resolution → fixed endpoint/SigV4 request → bounded XML parsing → typed ownership coverage outcome`.

## Strengths

The configuration loader rejects unknown Ghost Records keys and validates the new region and policy JSON before it reaches the adapter. The policy evaluator in `src/policy/approved-external.js` uses exact normalized target and scope matching, preserving expiry as evidence rather than an active suppression control. The direct client in `src/adapters/aws/client.js` derives EC2 endpoints from validated explicit regions, fixes STS to HTTPS, rejects redirects, bounds retry attempts, and treats malformed/non-XML bodies as typed failures.

The parser in `src/adapters/aws/xml.js` rejects DTD/entity declarations, oversized bodies, excessive nesting, unexpected roots, and malformed required fields. The ownership adapter in `src/adapters/ec2/ownership-adapter.js` reports incomplete regional inventory as `unknown`/partial rather than claiming an IP is unowned. The architecture test prohibits AWS SDK import, EIP mutation names, role assumption, dynamic region discovery, and ambient credential paths.

## Prioritized findings

### T7-F1 — Resolved: Unsupported AWS partitions could have received incorrect direct endpoints

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Outbound integration / endpoint correctness |
| Where | `src/config/load-configuration.js`, `src/adapters/aws/client.js` |

**Risk and evidence.** The EC2 client constructs an endpoint using the standard-partition hostname pattern. AWS China, GovCloud, and isolated partitions have distinct endpoint/STS considerations; applying the standard pattern without an explicit design could cause failed requests or misleading ownership coverage. This was identified while reviewing the endpoint construction flow.

**Remediation.** The configuration loader now rejects `cn-`, `us-gov-`, and `us-iso-` region prefixes with a typed unsupported-scope error. The operator documentation names this standard-partition boundary and requires separate approval before supporting another partition.

**Verification.** The configuration test rejects `us-gov-west-1`; run it through `npm run test:run -- src/test/config/load-configuration.test.js`.

### T7-F2 — Resolved: Syntactically shaped but non-calendar policy expiry dates could have produced unreliable suppression behavior

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | High |
| Category | Input validation / policy lifecycle |
| Where | `src/config/load-configuration.js`, `src/policy/approved-external.js` |

**Risk and evidence.** The policy schema validates timestamp shape, but a runtime date parser can normalize invalid calendar values such as a nonexistent day. If accepted, a policy exception could expire at an unintended instant. Because approved-external evidence affects later suppression behavior, this is security relevant even though the current evaluator requires an exact target and scope.

**Remediation.** The central loader now compares the parsed ISO calendar second with the supplied value and rejects invalid calendar timestamps. Expired valid policies remain permitted in configuration because the evaluator returns them as non-suppressing contextual evidence.

**Verification.** The configuration regression rejects `2026-02-30T00:00:00Z`; the policy suite separately verifies that a valid expired policy cannot return the approved state.

### T7-F3 — Follow-up required: Native SigV4 correctness requires owner-provided AWS integration verification

| Field | Value |
| --- | --- |
| Severity | Medium |
| Confidence | Medium |
| Category | Cryptographic request signing / outbound integration |
| Where | `src/adapters/aws/query-sigv4.js`, `src/adapters/aws/client.js` |

**Risk and evidence.** The native signer has deterministic unit tests for canonical parameter ordering, session-token signing, STS scope, and regional EC2 scope. However, those tests use a repository-derived fixed vector rather than a successful request validated by AWS. A subtle canonicalization difference may still result in rejected production requests. This is availability and coverage-integrity risk, not evidence of credential disclosure or AWS mutation.

**Recommendation.** Before configuring production credentials, execute a non-production owner-provided smoke test with a least-privilege role that permits only `ec2:DescribeAddresses`; capture only safe request identifiers/statuses in logs. Confirm `GetCallerIdentity`, `DescribeAddresses` for a known non-sensitive EIP, a regional access-denied case, and `aws:RequestedRegion` enforcement.

**Verification.** Add an explicit opt-in AWS integration test only after the owner supplies a non-production account and approves test credentials. Do not substitute a live production account or broaden the IAM policy.

## Code quality notes

The direct Query signer is intentionally small but duplicates several SigV4 primitives already present in the Route 53 signer. This is acceptable for the current task’s service-specific boundary, but a future shared signed-request library should be planned only after more direct AWS services need it; premature refactoring could expand the security-sensitive blast radius.

Approved-external policies are configuration-only in T7. They have no persistence, multi-user authorization, or change audit trail until later approved persistence/control-plane tasks. This is an expected task boundary, not a finding against the current worker-only scope.

## Remediation plan

**Quick win.** Complete the owner-provided non-production STS/EC2 and IAM smoke test before production credential deployment. Document the approved region list and confirm it matches the IAM `aws:RequestedRegion` condition.

**Medium fix.** When later provider scope requires China, GovCloud, or isolated partitions, create a separate ADR, endpoint/signing test matrix, and IAM policy documentation before relaxing the T7 validation guard.

**Structural guardrail.** Maintain the architecture test as future AWS adapters are added. Add an opt-in integration-test harness only with strict non-production credentials, safe output redaction, and no mutation actions.

## Suggested follow-up validation

Run `npm ci`, `npm run audit`, `npm run lint`, `npm run test:run`, `npm run coverage`, and `npm run build`. Review structured logs during the owner-provided smoke test to verify that access keys, secrets, session tokens, authorization headers, and raw XML are absent. Confirm that unavailable regional inventory produces partial coverage and does not produce an ownership or claimability conclusion.

## Open questions

| Question | Owner | Status |
| --- | --- | --- |
| Which explicit EC2 regions should the first production deployment inspect? | Service owner | Pending deployment configuration |
| Can a non-production AWS account and least-privilege role be supplied for opt-in direct-API verification? | AWS account owner | Pending |
| Is support for China, GovCloud, or isolated partitions required in a later release? | Product and application security | Deferred |
