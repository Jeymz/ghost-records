# Ghost Records v2 — Multi-Provider DNS Security Scanner

## Goal

Build a **JavaScript-only**, container-ready, read-only, **DNS-only** security scanner that inventories authoritative DNS records across supported providers; gathers DNS and ownership evidence; detects distinct classes of DNS security risk; and produces durable, auditable findings. The product must not equate an unrecognized IP address or unresolved hostname with a confirmed subdomain takeover.

Version 2 will preserve the existing Bash implementation as a narrowly documented **legacy AWS Route 53/Elastic IP reference audit**. It will introduce a new modular implementation alongside it rather than expanding `ghost_records.sh` into a multi-provider scanner. This boundary is deliberate: version 1 has a single Bash executable, no package manifest, no test suite, and an AWS EIP membership rule that is unsuitable as the decision model for multi-provider DNS security analysis. [1] [2]

## Requirements

The v2 implementation must use **JavaScript only**, preferably ES modules. It must not use Python, TypeScript, a transpiler, or a mixed-language runtime. Any newly introduced runtime dependencies, framework, persistent storage, public API, CI/CD change, or deployment change is approval-gated before implementation. [3]

V2 must be a **self-hosted, containerized application** that an owner can configure and deploy into its own infrastructure. It must operate correctly as one application instance and as a horizontally scaled multi-instance workload on Kubernetes. All runtime state that must survive a pod restart or coordinate work across instances must reside in MySQL or another explicitly approved external system; no production correctness requirement may depend on container-local disk, in-memory coordination, or a colocated database container.

MySQL is the mandatory persistence technology for v2. The minimum compatibility baseline is **MySQL 8.0+**; v2 must also support MySQL-compatible clustered deployments, including **Percona XtraDB Cluster (PXC)**. The compatibility test matrix must cover a currently supported PXC release in addition to standalone MySQL 8.0+, because PXC 8.0 is end-of-life and PXC 8.4 is the current release line. [11] [12]

**Every application interaction with MySQL must use Sequelize**, including model operations, transactions, migrations, and repository-level access; feature code must not issue raw SQL or introduce another ORM/query layer. The application must support connecting to an independently provisioned and owner-managed MySQL instance through validated, environment-driven configuration and secrets. A Docker Compose, Helm chart, or Kubernetes deployment must never require MySQL to run beside the application. **Database infrastructure provisioning is out of scope for v2:** the application validates supplied configuration, tests connectivity, and applies controlled Sequelize migrations only.

The product team owns forward application/schema upgrade compatibility in future Ghost Records releases through versioned Sequelize migrations, release notes, upgrade tests, and migration preflight checks. The owner remains responsible for database backup, recovery, availability topology, and execution of the documented application upgrade procedure. Default Sequelize pool settings must be modest (`max: 5`, `min: 0`, `acquire: 30000 ms`, and `idle: 10000 ms`) and may be overridden only through centrally AJV-validated owner configuration. The documentation and startup validation must require that `maximum application replicas × configured pool maximum` remains within the owner’s database connection budget after reserved database/admin capacity. [9]

V2 must retain normalized DNS observations sufficient to identify changed terminal IP addresses for CNAME chains over time. It must also retain a time-stamped registration-history observation for each eligible CNAME target domain, using WHOIS and/or RDAP data where lawfully available. The system must capture provenance, retrieval time, domain, selected registration-status fields, and response classification; it must not assume registrant contact data is accessible, accurate, or necessary, and it must minimize collection of personal data.

A network-facing administrative **REST API and web UI** are optional as one control-plane capability. If the owner does not enable a control plane, no HTTP listener will be exposed. If the owner enables it, both REST and UI surfaces are available behind mandatory authentication and authorization; neither surface may operate anonymously. The default enabled control-plane strategy is **local platform authentication and authorization**. An owner may explicitly replace that default with **LDAP supporting Microsoft Active Directory and OpenLDAP-compatible directory services**, OAuth 2.0/OpenID Connect including Azure SSO, or another separately approved external AuthN/AuthZ strategy. Local credentials must be stored only as secure password hashes consistent with OWASP guidance, never encrypted or plaintext passwords. [3] [7] [8]

LDAP configuration must support an owner-defined directory endpoint, base DN, user-search attribute/filter, group-search attribute/filter, service-bind identity, and explicit group-to-role mapping. Production deployments must use LDAPS or StartTLS with certificate validation and must reject anonymous and unauthenticated binds. All user-controlled values inserted into LDAP filters or DNs must be normalized, allow-list validated, and context-appropriately escaped; directory bind identities must be least-privileged read-only accounts. [10]

The scanner must collect DNS zones and records through provider adapters in this approved sequence: **AWS Route 53, Azure DNS, GoDaddy, then Namecheap**. It must normalize records into one internal model while retaining immutable provider evidence such as zone identity, record identity, account/tenant identity, ETag/version where available, timestamps, and collection errors.

The scanner must evaluate at least A, AAAA, CNAME, MX, NS, and supported alias records as separate classes of DNS behavior. It must capture CNAME chains, terminal A and AAAA answers, resolver outcomes, TTLs, and observation times. It must represent collection failures or inaccessible zones as explicit coverage gaps rather than silently treating them as empty inventories. **V2 inspection is DNS-only:** it must not send HTTP, HTTPS, TLS, application-protocol, or service-fingerprinting requests to DNS targets; it must not use DNS results to trigger resource claims, mutations, or endpoint probes.

The scanner must classify observations separately as `coverage_incomplete`, `unknown_external_target`, `resolution_failure`, `dns_drift`, `released_eip_candidate`, `takeover_candidate`, `delegation_risk`, or `mail_routing_risk`. Every result must include evidence, confidence, first-seen and last-seen time, and remediation guidance. A claimable-service result must remain a **candidate** until validated through review; the product must not create, claim, modify, or otherwise manipulate cloud resources or DNS records to prove exploitability.

The authoritative operational record is the MySQL-backed finding and history data exposed through the secured control plane when enabled. Each completed scan must also emit stable, schema-versioned JSON artifacts for automation and Markdown/CSV reports for human review. Centralized structured logs remain mandatory for observability and security investigation but are not the source of truth for findings. SARIF output is explicitly out of scope for v2.

The scanner must support a policy model that records approved external targets, ownership contacts, allowed target patterns, expected change windows, sensitivity, suppression justification, and suppression expiry. Policy must never turn a failed provider collection into a clean result. **Application Security** owns approved-external target policy and suppression governance; it leads finding triage and risk acceptance with service-owner input, and escalates overdue or high-severity findings. DNS or service owners own remediation. Every policy exception and risk acceptance must retain an accountable owner, rationale, approval timestamp, and expiry.

Whenever an owner enables the REST API and web UI control plane, every inbound request body, query parameter, route parameter, webhook, broker message, administrator action, uploaded-file metadata, and externally sourced structured payload must be validated with centralized JSON Schema using AJV before business logic or side effects. Schemas must default to `additionalProperties: false`. The Express application must use Helmet and a strict Content Security Policy. Every valid HTTP request must produce one `http` request record and a linked application log that complies with the centralized logging contract. [3]

The application must be deployable in a container to the internal Kubernetes cluster, with environment-driven configuration and deterministic startup. The build must remain compatible with GitLab CI/CD branches and shared templates. The design must avoid host-bound dependencies and manual deployment-only setup. [3]

Every behavior change must include test coverage or an explicit documented rationale. Provider adapters, parsing, classification, authorization boundaries, redaction, and errors must have recorded fixtures and deterministic tests. Implementation must use repository-defined package scripts for validation once the JavaScript project is initialized. [3]

## Request Summary

Ghost Records v2 will transform a narrow AWS EIP-reference report into an evidence-driven DNS security scanner. The implementation will decouple DNS-zone inventory from cloud-resource ownership checks, retain all unknowns and coverage failures, detect record and endpoint drift over time, and surface potential takeover exposure without performing active claims or remediations.

The specification adopts the supplied engineering constitution as a non-negotiable foundation. The provided security-architect guidance requires an iterative threat model, clear data flows and trust boundaries, security requirements, guardrails, and recorded trade-offs. The supplied analyst guidance requires practical, prioritized findings with precise evidence and verification. The implementation guidance requires that this document remain the source of truth, remain in `docs/plans/`, and stop before code changes until explicit approval is granted. [3] [4] [5] [6]

## Codebase Findings

| Area | Repository evidence | Planning consequence |
| --- | --- | --- |
| Current product | The tracked project is a Bash script (`ghost_records.sh`) plus README and `.gitignore`; it has no JavaScript application structure, dependency manifest, test suite, container configuration, CI configuration, or existing `docs/plans/` directory. [1] | A v2 JavaScript implementation is necessarily a new, separate seam. The legacy script must remain intact and receive only narrowly scoped documentation/label corrections if approved. |
| Current detection model | Version 1 joins Route 53 non-ALIAS A/CNAME data to the scanned AWS EIP inventory and marks public IPv4 values absent from that inventory as dangling. [1] | v2 must not reuse this result rule as a universal decision. DNS collection, ownership evidence, chain resolution, policy, and classification need independent modules. |
| Provider scope | Version 1 calls the AWS CLI directly for Route 53 and EC2 and assumes AWS CLI profiles, `jq`, and `dig`. [1] | v2 must define a provider-adapter contract with independent identity, pagination, retry, credential, record-shape, and error behavior. |
| Execution environment | The active environment is Linux with Bash, Node.js 22.13.0, and npm 10.9.2. No `package.json` exists in the repository. | Before implementation, the team must approve the initial package/runtime layout and its package scripts. Any command execution must use those scripts once present. |
| Constitutional constraints | `AGENTS.md` mandates JavaScript, ES-module preference, AJV at all inbound trust boundaries, structured logging, strict browser controls for Express, and container/Kubernetes readiness. [3] | The initial v2 architecture must be JavaScript ES modules, use centralized configuration and logging, and either avoid HTTP in the first release or comply fully with the HTTP constitution. |

## Security Architecture and Threat Model

### System Overview

The proposed scanner has five logical planes. The **collection plane** retrieves zones and records from DNS-provider APIs using read-only credentials. The **resolution plane** performs bounded DNS queries and records chains and response outcomes. The **ownership plane** queries approved cloud/resource inventories and policy data to identify whether targets are owned, approved external dependencies, unknown, or absent. The **analysis plane** applies deterministic rules to provider/record patterns, DNS evidence, ownership context, policy, and historical drift only. The **reporting plane** persists observations and emits findings, coverage reports, and structured logs.

The required delivery shape is a self-hosted container application with independently scalable **scanner-worker** and **control-plane** roles. A single instance may run both roles for simple deployments; a Kubernetes deployment may run one or more control-plane instances and one or more workers against the same external MySQL database. The scanner-worker may run without exposing HTTP. The optional control plane is disabled by default; when enabled, it serves both the REST API and web UI for configuration and findings access after mandatory authentication and authorization using the **local platform strategy by default**. The owner may explicitly select an external strategy. It must satisfy the HTTP, AJV, Helmet, strict CSP, session/token, CSRF, rate-limit, and request-linked logging constitution in full. Kubernetes-native leader election or database-backed job leasing must prevent duplicate work from causing inconsistent baselines or unbounded duplicate scans.

### Assets

| Asset | Security objective |
| --- | --- |
| DNS-provider credentials | Preserve confidentiality; restrict each credential to read-only inventory access; never emit it to logs, reports, process arguments, or persisted observations. |
| Cloud inventory credentials | Preserve confidentiality and tenant/account boundaries; use read-only scopes; record inventory coverage without recording secrets. |
| DNS zone and record data | Preserve integrity, provenance, provider identity, and collection timestamp; treat it as externally sourced input. |
| Policy and suppression data | Preserve integrity, ownership, approval state, and expiry; unauthorized changes could hide real findings. |
| Baseline/observation store | Preserve integrity and availability; unauthorized modification could hide drift or create false positives. |
| Findings and reports | Preserve confidentiality according to deployment policy, because they reveal external dependencies, target infrastructure, and potentially sensitive ownership information. |
| Structured logs | Preserve integrity and confidentiality; redact credentials, bearer tokens, personal data, and full sensitive config values. |
| Local identities, sessions, roles, and external identity mappings | Preserve confidentiality and authorization integrity; password hashes and identity-provider metadata require stricter access and retention controls than ordinary findings. |
| WHOIS/RDAP observations | Minimize collected personal data, preserve source and timestamp, and restrict access because registrar records can include protected or inaccurate information. |

### Trust Boundaries and Data Flows

| Flow | Boundary crossed | Primary validation/control |
| --- | --- | --- |
| Runtime configuration → scanner | Deployment environment into application configuration | Centralized configuration loader; typed/JSON Schema validation; secret redaction; fail closed on missing required configuration. |
| Provider API response → adapter | External DNS-provider response into application | Adapter-specific JSON/XML parsing; normalize into a canonical record object; reject or quarantine unexpected fields and emit coverage errors. |
| DNS response → resolution collector | Recursive/authoritative resolver response into application | Bounded query depth/count/timeouts; canonicalize names; retain RCODE and evidence; do not treat absence as ownership proof. |
| Policy file/store → analysis | Administrative policy into findings engine | AJV schema validation; explicit owner, reason, and expiry for exceptions; immutable audit trail once persistence is approved. |
| Baseline → drift engine | Prior persisted evidence into a current scan | Stable provider record identity, snapshot version, integrity checks, and explicit “no baseline” state. |
| MySQL → application instance | Shared persistent observations, jobs, policy, users, roles, and migrations into a single or multi-instance application | Sequelize-only repository/model boundary; TLS-capable connection settings; least-privilege database user; migrations executed through a controlled, single-writer release process. |
| Identity provider → optional control plane | Microsoft Active Directory, OpenLDAP-compatible LDAP, OIDC/OAuth issuer, Azure SSO, or local identity into application authentication | Provider-specific adapter; issuer/directory validation; TLS and bind validation; safely encoded directory filters/DNs; centrally validated claims; least-privilege role mapping; no password disclosure to external providers. |
| Finding/log → external systems | Internal scanner output into consumers | Structured schema; redaction; no secrets or untrusted raw data rendered as executable content. |
| Future HTTP/admin action → application | User-controlled input into scanner operation | AJV before business logic, mandatory authentication/authorization, CSRF/CSP/Helmet controls, rate limiting, request and application logs. |

### Top Threats and Mitigations

| Rank | Threat | Risk | Prevention | Detection/response |
| --- | --- | --- | --- | --- |
| 1 | Credential disclosure through configuration, command line, error text, or logs | Provider and cloud accounts could be enumerated or altered outside scanner controls. | Central configuration module; injected secrets; read-only least-privilege roles; redaction at logging/reporting boundaries; never pass secrets in CLI arguments. | Secret-scanning CI; redaction tests; audit provider credential use. |
| 2 | False takeover finding from incomplete inventory or ambiguous resolution | Teams could remediate legitimate records, create incidents, or lose trust in the scanner. | Separate evidence states and confidence; coverage gates; policy inventory; DNS/ownership evidence only; and a manual review requirement. | Report coverage summary; fixture tests for unknown/NXDOMAIN/third-party cases; review workflow. |
| 3 | Silent collection failure or pagination loss | The system may report an incomplete estate as clean. | Provider adapters must return typed success/error/partial coverage; fail scans according to policy; retain page and zone counts. | `coverage_incomplete` findings and scan-level exit state; alert on coverage regression. |
| 4 | DNS rebinding or resource exhaustion via crafted target names | DNS resolution of attacker-controlled names could consume resources or produce misleading target observations. | Permit only defined DNS query types; reject/flag private, loopback, link-local, multicast, and reserved target addresses; bound recursion, response size, concurrency, deadlines, and total queries; prohibit all HTTP/TLS/application probing. | Query audit logs without secrets; resource limits; tests with hostile DNS fixtures and an egress test proving no target HTTP/TLS connection path exists. |
| 5 | Policy/suppression tampering | Exposure can be hidden through overbroad or perpetual exceptions. | Schema validation; owner/reason/expiry mandatory; least-privilege policy changes; review/approval process. | Expiry alerts; policy-diff audit; reports list active suppressions. |
| 6 | Supply-chain compromise | A malicious package or compromised build can exfiltrate infrastructure data. | Pinned lockfile; dependency review; SBOM/SCA/provenance controls; minimal dependencies; CI build controls. | Dependabot/SCA or approved equivalent; image scanning; reproducible build checks. |
| 7 | Optional API/admin interface bypass or misconfiguration | Attackers could trigger scans, change policy, or retrieve sensitive findings if a control plane is exposed without complete identity controls. | Control plane disabled by default; when enabled, authentication and authorization are mandatory, with AJV, Helmet/CSP, rate limiting, CSRF model if cookie-based, and request-linked logging. | Authz tests, security review gate, configuration-validation tests, and monitoring for denied/admin actions. |
| 8 | MySQL contention, uncoordinated migrations, or over-sized pools in multi-instance deployments | Pods can exhaust database capacity or race on schema/work state, causing scan loss or inconsistent baselines. | One Sequelize instance per process; configured pool budget derived from total replicas; controlled migration job; row/job leasing with transaction boundaries; liveness/readiness checks. | Pool saturation metrics, migration audit, concurrency/integration tests, and dead-letter/failed-job visibility. |
| 9 | Local-account compromise or insecure identity mapping | Weak password storage, account enumeration, overly broad group-to-role mappings, or misconfigured OIDC/LDAP can expose policy and findings. | Local accounts use Argon2id with OWASP-recommended parameters, per-user salts, optional separately stored pepper, generic failure messages, throttling, secure session/token handling, and reauthentication for sensitive changes. External identities are mapped by stable subject/object identifiers and allowlisted claims/groups. | Password/session/authz test suite, identity-provider configuration validation, audit logs, and periodic role-mapping review. |
| 10 | WHOIS/RDAP privacy or integrity failure | Personal data may be collected unnecessarily, and stale/redirected registry data may be mistaken for ownership proof. | Prefer minimized registration-status fields; retain raw output only under explicit policy; record source/time/response; treat data as corroborative evidence, never sole proof. | Data-retention tests, access audit, source/error metrics, and analyst review for high-severity findings. |

### Security Requirements

The scanner must use a centralized configuration module and must not scatter `process.env` reads across features. It must redact confidential configuration fields and provider credentials before any log or error output. Its logger must support stable logical sources, structured events, and the HTTP contract whenever the control plane is enabled. [3]

The enabled web UI must be delivered through the control plane under the same authorization policy as the REST API. It must use Helmet with a strict Content Security Policy, avoid unsafe directives unless explicitly approved, avoid raw/untrusted HTML rendering, protect cookie-based interactions from CSRF, and enforce authorization server-side for every API operation regardless of any UI state. All browser-facing routes, API inputs, and administrative actions must be centrally AJV-validated before business logic. [3]

All externally sourced structured data that crosses an application boundary must be validated with centralized AJV schemas before it reaches business logic. This includes provider API payloads after parsing, policy documents, persisted observation records read from an external store, scan-job messages, webhook payloads, and every future HTTP input. Schemas must reject unexpected properties by default. Where an external provider response cannot be represented with strict full-payload validation, the adapter must validate a narrow extracted payload into the canonical internal schema and retain raw evidence only under a documented, redacted evidence policy. [3]

The scanner must have no mutation capability in its provider adapters. It must not create cloud resources, update/delete DNS records, or register domains. Remediation remains a human-owned action outside v2. This limitation is both a safety control and a product requirement.

### V2 Operational Ownership Model

| Responsibility | Accountable owner | Required system support |
| --- | --- | --- |
| Approved-external target policy and suppression governance | Application Security | Owner, rationale, approval time, scope, and expiry fields; expiry alerts and audit history. |
| Finding triage and risk acceptance | Application Security, with service-owner input | Findings queue, evidence, status, comments/decision history, and time-bound acceptance records. |
| DNS, cloud-resource, and application remediation | DNS or service owner | Assigned owner/contact, remediation guidance, status tracking, and re-scan verification. |
| Overdue or high-severity escalation | Application Security | Configurable severity/age thresholds, escalation state, and audit record. |

### Data Retention and Access Policy

All retention limits are **owner-configurable**, centrally defined, and validated with AJV before application startup or an authorized control-plane configuration change takes effect. Retention values use whole days; configuration must reject negative values, invalid types, ambiguous units, and a raw-evidence retention setting when raw evidence is disabled. Retention changes are privileged administrative actions that require the same server-side authorization and audit handling as policy changes. Purge operations must use Sequelize, run as bounded/idempotent jobs, record aggregate success/failure metrics without logging deleted sensitive values, and remain safe under multi-instance job leasing.

| Data class | Default retention | Access boundary | Configuration key |
| --- | --- | --- | --- |
| Normalized DNS observations, CNAME resolution history, findings, and remediation history | 365 days | Application Security and the assigned DNS/service owner through scoped control-plane authorization. | `RETENTION_FINDINGS_DAYS` |
| Minimized WHOIS/RDAP registration observations | 90 days | Application Security and the assigned DNS/service owner where required for finding review. | `RETENTION_REGISTRATION_DAYS` |
| Raw WHOIS/RDAP and provider API evidence | Disabled by default; 30 days only when approved troubleshooting capture is enabled | Application Security only, with audit logging and encrypted storage where raw capture is used. | `RAW_EVIDENCE_ENABLED`, `RETENTION_RAW_EVIDENCE_DAYS` |
| Identity/security audit events | 365 days | Application Security and authorized platform administrators. | `RETENTION_AUDIT_DAYS` |
| Local and external session records | Until session expiry or revocation | The authenticated principal and authorized platform administrators as necessary for incident response. | Session lifetime and revocation configuration |
| JSON, Markdown, and CSV scan artifacts | 90 days | The same scoped authorization boundary as their related findings. | `RETENTION_ARTIFACTS_DAYS` |

The owner may change these default limits through validated deployment or authorized configuration. Normalized data is the preferred retained evidence; raw provider/registration responses are exceptional, disabled by default, and must never become a general-purpose archive of registrar contact information.

## Architecture Decision Record

### ADR-001: Build v2 as an isolated JavaScript ES-module application beside the legacy Bash scanner

**Context.** The original project is a compact Bash tool with direct AWS CLI orchestration and no reusable module or test seams. The engineering constitution prohibits Python and TypeScript and directs contributors to preserve existing seams and avoid broad refactors without approval. [1] [3]

**Decision.** Subject to implementation approval, create a JavaScript ES-module v2 application in a new, self-contained directory while retaining `ghost_records.sh` unchanged as a legacy utility. The v2 package will be responsible for its own package manifest, scripts, configuration, schemas, tests, and container build. The legacy script will not become a provider adapter.

**Alternatives considered.** Extending Bash was rejected because each additional provider and evidence source would add incompatible authentication, response format, persistence, and test requirements to a monolith. Building v2 in Python was rejected by the explicit JavaScript-only constitution. Replacing version 1 in place was rejected because it would remove a useful narrow control and make migration/review needlessly risky.

**Consequences.** The repository gains a new application seam and dependency lifecycle, which requires explicit approval before implementation. The team must decide package layout, persistence, execution mode, and CI/container files before code changes. Version 1 documentation must accurately limit its claim.

### ADR-002: Support headless scanning by default and a secured control plane by configuration

**Context.** A general scanner needs scheduled execution, durable reports, and single/multi-instance deployment. Some owners will operate only a scanner-worker; others will require interactive configuration and findings access. The constitution imposes substantial controls whenever an Express application is introduced. [3]

**Decision.** Deliver a containerized Node.js application with a scanner-worker role and an optional control-plane role. The scanner-worker can run as a standalone process, Kubernetes CronJob, or horizontally scaled workload without exposing HTTP. The control plane is disabled by default. When it is enabled, it provides both authenticated/authorized REST API and web UI functionality for configuration and findings, and it must meet every HTTP security, validation, logging, and browser-security requirement in the constitution.

**Alternatives considered.** A permanently headless-only tool would be simpler but fails the owner’s stated need for configurable identity security. An always-on anonymous API/UI was rejected because it exposes sensitive findings and policy. A local-only developer utility fails the container-ready operating requirement.

**Consequences.** Headless deployments retain a minimal network attack surface. Deployments enabling the control plane accept a clearly bounded identity, authorization, operational, and testing scope rather than gaining an unsecured convenience interface.

### ADR-003: Require external MySQL with Sequelize-only persistence for both single- and multi-instance operation

**Context.** The v2 product must retain CNAME terminal-IP changes, registration-history observations, policy, identity data, and findings. It must also operate as a single application or a Kubernetes-scaled system without requiring a bundled database instance.

**Decision.** Use an owner-provisioned MySQL 8.0+ instance or compatible PXC cluster as the required durable data store and Sequelize as the sole persistence interface. The application will connect through centralized, validated runtime configuration; it will not provision MySQL implicitly, run a database sidecar, or require a database service in its Docker Compose/Helm deployment. Schema changes will be immutable Sequelize migrations executed by a controlled migration job before application rollout. The product team owns forward migration compatibility in future releases, while owners own backup/recovery and execute the documented upgrade procedure. The release design must ensure that only one migration actor runs for a database at a time. Each process uses a modest default Sequelize pool (`max: 5`, `min: 0`, 30-second acquire timeout, 10-second idle timeout); validated owner overrides must respect the global connection budget across replicas. [7] [9] [11]

**Alternatives considered.** Container-local SQLite or files were rejected because they cannot safely coordinate or retain multi-instance state. A database bundled in Compose/Helm was rejected because it violates the owner-managed infrastructure requirement. Raw SQL or a second query layer was rejected by the Sequelize-only requirement.

**Consequences.** Database availability becomes an explicit deployment prerequisite. The owner must provide the MySQL/PXC endpoint, database, least-privilege application user, TLS configuration where required, backups/recovery controls, connection budget, and secret delivery. V2 validates the supplied configuration, tests connectivity, and applies controlled migrations; it does not create database infrastructure, manage an IaC state, or integrate with a database operator or cloud database control plane. Future Ghost Records releases must publish migration compatibility, upgrade steps, and rollback/recovery prerequisites before schema-changing versions are released.

### ADR-004: Make optional control-plane exposure secure by construction

**Context.** Owners may choose a headless scanner deployment or may require a user-facing/API control plane. Exposing the latter without identity controls would materially weaken the system.

**Decision.** Disable the control plane by default. When `CONTROL_PLANE_ENABLED` is true and no external strategy is explicitly configured, the application must select the local platform authentication and authorization strategy. An owner may explicitly configure LDAP for Microsoft Active Directory or OpenLDAP-compatible directories, OIDC/OAuth 2.0 (including Azure SSO), or another separately approved external AuthN/AuthZ strategy. The configuration loader must reject an enabled control plane without a valid strategy, session/token protection configuration, and role mapping. LDAP modes must require TLS, authenticated least-privilege binding, strict filter/DN handling, and explicit group-to-role mappings. Local accounts use OWASP-aligned Argon2id password hashing; password hashes, recovery secrets, API tokens, and session secrets are never logged or returned by the API. [3] [8] [10]

**Alternatives considered.** Anonymous UI/API mode was rejected because its purpose is to access sensitive configuration and findings. Making authentication mandatory for the scanner-worker was rejected because a worker has no interactive user boundary and should run under Kubernetes/service identity instead.

**Consequences.** Headless deployments retain a minimal attack surface. Control-plane deployments require an explicit identity and role design, and every HTTP endpoint is subject to the full AJV/Helmet/CSP/logging constitution.

## Canonical Domain Model

The following model is normative at the application boundary. Exact JavaScript object schemas will be implemented centrally using JSON Schema/AJV only after approval.

| Entity | Required identity/evidence fields | Purpose |
| --- | --- | --- |
| `providerAccount` | `provider`, `accountId`, `displayName`, `collectionScope`, `observedAt` | Establishes credential scope and coverage boundary. |
| `dnsZone` | `provider`, `providerAccountId`, `zoneId`, `name`, `visibility`, `observedAt` | Identifies the authoritative collection unit. |
| `dnsRecord` | `provider`, `providerAccountId`, `zoneId`, `recordId`, `fqdn`, `type`, `values`, `ttl`, `alias`, `version`, `observedAt` | Canonical immutable record representation used by analysis. |
| `dnsObservation` | `recordKey`, `queryName`, `queryType`, `chain`, `answers`, `rcode`, `resolverEvidence`, `observedAt` | Captures DNS evidence without declaring a security conclusion. |
| `ownershipEvidence` | `subject`, `source`, `scope`, `classification`, `confidence`, `observedAt`, `coverage` | States owned, approved external, unknown, not found, or unavailable with source context. |
| `coverageEvent` | `component`, `provider`, `scope`, `status`, `reason`, `observedAt` | Ensures partial scans and failures cannot be hidden. |
| `policyRule` | `ruleId`, `scope`, `match`, `decision`, `owner`, `reason`, `expiresAt`, `version` | Controls approved external targets and bounded suppressions. |
| `finding` | `findingId`, `type`, `severity`, `confidence`, `recordKey`, `evidenceRefs`, `status`, `firstSeenAt`, `lastSeenAt`, `remediation` | Provides an auditable, actionable security result. |
| `cnameResolutionSnapshot` | `recordKey`, `declaredTarget`, `chainHash`, `terminalAddresses`, `rcode`, `ttlSummary`, `observedAt` | Enables deterministic identification of changed resolving IPs and chain behavior. |
| `domainRegistrationObservation` | `domain`, `source`, `retrievedAt`, `responseClassification`, `registrar`, `statuses`, `nameservers`, `expirationDate`, `evidenceRetentionRef` | Retains minimized WHOIS/RDAP history for eligible CNAME targets without using registration data as sole ownership proof. |
| `scanJob` | `jobId`, `scope`, `status`, `leaseOwner`, `leaseExpiresAt`, `startedAt`, `completedAt` | Coordinates workers safely across one or many application instances. |
| `user` | `userId`, `username`, `email`, `status`, `passwordHashRef`, `createdAt`, `updatedAt` | Represents a local platform identity only when local authentication is enabled. |
| `externalIdentity` | `identityId`, `providerType`, `issuerOrDirectoryId`, `subjectOrDn`, `userId`, `lastAuthenticatedAt` | Maps LDAP/directory or OIDC/Azure identities to a local authorization principal. |
| `role` / `permission` / `roleBinding` | Stable role/permission identifiers, subject binding, scope, and expiry | Supports least-privilege authorization for control-plane access. |

## Proposed Implementation Plan

### Stage 0 — Approve scope and guarded decisions

Record the delivery model, persistence choice, initial output contract, provider order, credential mechanism, and release ownership. Formal approval is required before adding a JavaScript package, dependencies, a storage model, container/CI files, public interfaces, or third-party integration libraries.

### Stage 1 — Establish the self-hosted application foundation

Create the approved JavaScript ES-module package layout, central configuration loader, AJV schema registry, structured logger/redaction utility, error taxonomy, result schema, and repository-defined scripts. Add the Sequelize/MySQL module, model/repository boundary, controlled migration runner, connection-pool configuration, schema/migration conventions, fixture conventions, and baseline unit tests. Start with the modest documented per-process pool defaults (`max: 5`, `min: 0`, 30-second acquire, 10-second idle) and validate owner overrides against declared replica/connection-budget configuration. The work must remain isolated from the legacy scanner. The database deployment contract must require externally provisioned MySQL 8.0+ or compatible PXC rather than deploy a sidecar or bundled MySQL instance.

### Stage 2 — Implement the collection contract and Route 53 adapter

Define the adapter interface and canonical DNS objects. Implement a read-only Route 53 adapter that carries explicit zone, record, pagination, and partial-coverage outcomes. Normalize A, AAAA, CNAME, MX, NS, and alias data. Add recorded API-response fixtures and tests for pagination, private/public visibility policy, malformed input, throttling, authorization failures, and partial scans.

### Stage 3 — Implement passive resolution and evidence collection

Build bounded DNS-chain collection with strict host-name normalization, maximum depth, timeout, concurrency, response-size, and query-count controls. Store declared record values separately from observed chain/terminal answers. Ensure resolver errors generate `resolution_failure` or `coverage_incomplete`, not automatic takeover findings.

### Stage 4 — Implement ownership, retention, policy, and baseline comparison

Implement AWS EIP and selected FQDN/resource inventory evidence through read-only adapters, approved-external target policy, and a versioned MySQL/Sequelize baseline store. Persist CNAME resolution snapshots so that changes to declared targets, chains, terminal A/AAAA answers, TTLs, and provider versions can be detected. Add minimized WHOIS/RDAP registration observations for eligible CNAME-target domains, with provenance and centrally configurable retention controls. Require policy rule owner, reason, and expiry. Implement bounded, idempotent Sequelize retention jobs that purge data and artifacts according to the owner-configured limits while preserving required audit evidence.

### Stage 4A — Implement multi-instance work coordination and optional secured control plane

Implement database-backed scan-job leasing and idempotency so one instance and multiple Kubernetes replicas can run safely against the same MySQL database. Implement the control plane as an explicit disabled-by-default REST API and web UI pair. When enabled, implement centralized authentication adapters for LDAP/directory, OAuth 2.0/OIDC including Azure SSO, and local accounts, with centrally validated authorization roles/permissions, secure sessions/tokens, OWASP-aligned password handling, AJV route validation, Helmet, strict CSP, CSRF protections where applicable, server-side authorization, and the complete HTTP constitution.

### Stage 5 — Implement analyzers and reporting

Implement deterministic analyzers that emit the defined finding types, confidence, evidence references, coverage context, and remediation from provider/record patterns, DNS evidence, ownership context, policy, and historical drift. V2 must not use HTTP/TLS/application service fingerprints, create resource claims, mutate resources, or probe endpoints. Persist the authoritative findings/history record in MySQL; expose it through the secured control plane when enabled; and emit stable schema-versioned JSON artifacts plus human-readable Markdown/CSV reports for each completed scan. Centralized logs are observability evidence rather than the authoritative finding source. SARIF is out of scope for v2.

### Stage 6 — Add non-AWS DNS-provider adapters

Add **Azure DNS, GoDaddy, then Namecheap** adapters in that approved order, one at a time, using the shared contract proven by Route 53. Azure DNS collection should be paired with its corresponding Azure resource-ownership evidence work. Each adapter must have centralized configuration, scoped read-only credentials, provider-specific pagination/error handling, normalized fixture tests, and explicit collection coverage reporting. No provider is considered supported merely because records can be fetched; it must meet the evidence, test, and coverage contract.

### Stage 7 — Containerization and operational hardening

Add the approved container build, Kubernetes job/deployment manifest pattern, shared GitLab CI integration, SBOM/SCA/image-scanning controls, execution resource limits, log-ingestion configuration, and operational runbook. Do not add these deployment changes until the implementation approval gate is passed.

## Assumptions

| Assumption | Reason | Must be confirmed before implementation? |
| --- | --- | --- |
| V2 remains in this repository and preserves `ghost_records.sh` as a legacy utility. | It provides a safe migration boundary and retains existing narrow value. | Yes, as part of approval. |
| V2 uses Node.js 22 and JavaScript ES modules. | The active environment provides Node.js 22.13.0 and the constitution mandates JavaScript/ES-module preference. | No language approval is required; Node version support should be confirmed in deployment. |
| V2 uses externally provisioned MySQL 8.0+ or compatible PXC for retained application state and Sequelize for every database interaction. | The owner explicitly required MySQL/Sequelize, cluster compatibility, and single/multi-instance support. | No; this is a confirmed constraint. |
| Owners manage database availability, backups, recovery, and connection budget; Ghost Records owns future application/schema upgrade compatibility. | The owner explicitly assigned operational and product responsibilities. | No; this is a confirmed constraint. |
| The application can run as one combined instance or as horizontally scaled worker/control-plane roles on Kubernetes. | The owner explicitly requires both deployment modes. | No; operational topology details remain to be specified. |
| The control plane is optional and disabled by default; if enabled, local platform authentication and authorization are selected by default, unless the owner explicitly configures an approved external strategy. | The owner confirmed a local-by-default identity strategy and no anonymous control-plane access. | No; this is a confirmed constraint. |
| Provider credentials are supplied at runtime through the organization’s approved secret mechanism and are read-only. | The constitution requires environment-driven configuration and protects secrets. | **Yes, credential mechanism and scopes.** |
| Provider support follows the approved sequence: Route 53, Azure DNS, GoDaddy, then Namecheap. | Azure DNS pairs with Azure ownership evidence; GoDaddy and Namecheap follow as focused DNS-inventory adapters. | No; this is a confirmed constraint. |
| Retention defaults are 365 days for normalized findings/history and audit events, 90 days for minimized registration observations and artifacts, and 30 days for opt-in raw evidence; owners may override these through centrally validated configuration. | The owner accepted these defaults but required configurable limits. | No; this is a confirmed constraint. |
| Scans and reports contain sensitive infrastructure metadata and may expose registration/identity data. | DNS records and endpoint ownership disclose architecture; raw registration data may contain protected information. | No; the access and retention boundary is confirmed above. |

## Open Questions

All material design questions have been resolved. The remaining decision is formal approval of this specification before implementation begins.

## Risks / Edge Cases

The project must not label a target as dangling merely because it does not appear in an inventory. A valid external dependency, a missing account, a CloudFront/CDN rotation, stale resolver cache, split-horizon name, BYOIP range, or temporary provider outage can produce the same observation. Unknown, not found, unavailable, and claimable are separate states.

The scanner must distinguish NXDOMAIN, NODATA, SERVFAIL, timeout, and policy-blocked collection. DNS answers can be multi-valued, IPv6-only, cyclic, wildcard-derived, TTL-dependent, geolocated, and resolver-specific. Both chain depth and total query cost must be bounded.

Provider APIs have materially different pagination, authorization, delegation, record identity, alias, visibility, and response-format behavior. Successful retrieval from a domain registrar does not prove that it is the active authoritative DNS provider. All adapters must expose their collection boundary and failure state.

Record drift is not inherently malicious. CDN and load-balancer changes must be policy-aware; unexpected movement from owned to unknown, a change in NS delegation, or a change to a known claimable SaaS namespace warrants higher severity and review.

Any future HTTP API, UI, or inbound scan-job message materially expands the trust boundary. It must be separately designed and approved; it cannot be introduced incidentally as part of adapter or reporting work.

## Acceptance Criteria

| ID | Testable criterion |
| --- | --- |
| AC-1 | The v2 implementation is JavaScript ES modules only; no Python, TypeScript, transpiler, or mixed-language runtime is introduced. |
| AC-2 | The legacy `ghost_records.sh` remains operationally unchanged by v2 feature code, and its documentation clearly states its limited Route 53/AWS EIP scope. |
| AC-3 | Every supported provider adapter returns canonical zones/records or explicit typed coverage events for authentication failures, pagination failure, inaccessible scopes, and malformed responses. No failure is silently converted to an empty result. |
| AC-4 | Canonical internal objects and every configured external structured input are validated by centralized AJV JSON Schemas before analysis; schemas reject unexpected properties by default. |
| AC-5 | The scanner evaluates A, AAAA, CNAME, MX, and NS records as independent analysis paths, captures bounded chain/answer evidence, and never reports a confirmed takeover based solely on a DNS resolution or inventory result. |
| AC-6 | Findings conform to the defined taxonomy; each finding includes type, severity, confidence, evidence, coverage context, first/last seen timestamps, and remediation guidance. |
| AC-7 | A failed or incomplete provider/resource collection emits `coverage_incomplete` and causes a policy-configurable non-clean scan outcome. |
| AC-8 | Policy exceptions require a valid owner, reason, scope, approval timestamp, and expiry; expired suppressions no longer silence findings. Application Security governance, service-owner remediation, risk acceptance, and high-severity/overdue escalation follow the approved V2 operational ownership model. |
| AC-9 | Logs do not include passwords, API keys, bearer/session tokens, or unredacted sensitive configuration. Whenever the optional control plane is enabled, every valid HTTP request meets the required request-record plus linked application-log contract. |
| AC-10 | The scanner has no DNS/resource mutation capability and has automated tests that demonstrate no write request paths are available to provider adapters. |
| AC-10A | V2 performs DNS-only inspection. Automated egress/architecture tests demonstrate that target evaluation has no HTTP, HTTPS, TLS, application-protocol, service-fingerprinting, endpoint-probing, or resource-claim request path. |
| AC-11 | Fixture-driven tests cover canonicalization, validation rejection, pagination, provider errors, chain depth, NXDOMAIN/NODATA/SERVFAIL/timeouts, unknown ownership, known owned target, approved external target, drift, and coverage gaps. |
| AC-11A | Provider-adapter delivery proceeds in the approved order: Route 53, Azure DNS, GoDaddy, then Namecheap. Each provider has adapter-specific read-only credential guidance, normalized fixtures, pagination/error tests, and explicit collection-coverage tests before the next provider begins. |
| AC-12 | The approved v2 container can run deterministically with environment-driven configuration in the target Kubernetes/GitLab CI model, using repository-defined package scripts for linting, tests, build, and execution. |
| AC-12A | MySQL-backed findings/history exposed through the secured control plane are the authoritative operational record. Each completed scan emits a schema-versioned JSON artifact and Markdown/CSV reports that reconcile to that record. Centralized logs are not the authoritative findings source, and no SARIF output is emitted in v2. |
| AC-13 | The application runs correctly as a single instance and as multiple Kubernetes replicas against an externally provisioned MySQL 8.0+ database and a tested compatible PXC release, with no requirement for a bundled database/sidecar or container-local persistent state. |
| AC-14 | All application persistence uses Sequelize models, repositories, transactions, and migrations; automated architectural tests reject raw SQL, direct driver access, and additional ORM/query layers outside the approved Sequelize infrastructure boundary. |
| AC-15 | CNAME resolution snapshots persist declared target, chain evidence, terminal A/AAAA answers, response status, and observation time; the scanner deterministically identifies a terminal-IP change without treating every expected CDN/load-balancer change as an incident. |
| AC-16 | Eligible CNAME targets receive minimized, time-stamped WHOIS/RDAP registration observations with source provenance and owner-configurable retention policy; the analyzer never promotes that data alone to ownership or takeover proof. |
| AC-16A | The application applies the documented configurable retention defaults, validates all retention configuration centrally with AJV, restricts retention changes to authorized administrators, and executes idempotent Sequelize-only purge jobs that respect multi-instance leasing. Raw evidence is disabled by default and, when enabled, uses its own configured retention/access controls. |
| AC-17 | Database migrations run exactly once per target MySQL/PXC database release, are tracked by Sequelize migration history, and are validated in standalone MySQL and compatible PXC upgrade/rollback test paths before multi-instance application rollout. Each future schema-changing release supplies documented migration compatibility and owner-run upgrade/recovery prerequisites. |
| AC-17A | V2 requires an owner-provisioned MySQL 8.0+/compatible-PXC endpoint and contains no database-infrastructure provisioning, bundled database, IaC state management, database-operator, or cloud database-control-plane capability. It validates supplied configuration and reports failed connectivity before starting scanner work. |
| AC-17B | Default per-process Sequelize pooling is `max: 5`, `min: 0`, 30-second acquire, and 10-second idle. Owner overrides are AJV-validated and rejected when the declared maximum replicas multiplied by the requested pool maximum exceeds the configured available connection budget. |
| AC-18 | When the optional control plane is disabled, the application exposes no administrative HTTP listener. When enabled, it serves both REST API and web UI behind the same local-by-default authentication and server-side authorization policy. Startup fails closed if the local strategy or an explicitly selected supported external identity mode lacks valid session/token and authorization configuration. |
| AC-19 | Microsoft Active Directory LDAP, OpenLDAP-compatible LDAP, OIDC/OAuth 2.0 including Azure SSO, and local-account adapters enforce least-privilege role mapping. LDAP tests verify TLS/certificate validation, no anonymous or unauthenticated bind, safely encoded user input in filters/DNs, and deny-by-default group mapping. Local accounts use Argon2id, unique salts, generic authentication failures, throttling, secure session/token controls, and redacted audit logs. |
| AC-20 | An enabled web UI is protected by Helmet and a strict CSP, avoids raw/untrusted HTML rendering, uses AJV-validated backend inputs, receives no authorization decision solely from client state, and applies CSRF protections to cookie-authenticated state-changing interactions. |

## Implementation Checklist

- [x] Confirm the required self-hosted single-instance and Kubernetes-scaled deployment model.
- [x] Confirm externally provisioned MySQL and Sequelize-only persistence.
- [x] Confirm retention requirements for CNAME terminal-IP changes and CNAME target WHOIS/RDAP history.
- [x] Confirm optional control-plane identity capability and required supported identity families.
- [x] Confirm that an enabled control plane includes both REST API and web UI, secured by the same identity and authorization policy.
- [x] Confirm MySQL 8.0+ baseline, compatible PXC support, owner-managed backup/recovery, Ghost Records-owned future upgrade compatibility, and modest configurable Sequelize pooling.
- [x] Confirm documented owner provisioning: v2 validates supplied MySQL configuration, connectivity, and migrations but does not provision database infrastructure.
- [x] Confirm MySQL/control-plane findings history as authoritative, with JSON artifacts and Markdown/CSV reports; centralized logs are non-authoritative and SARIF is deferred.
- [x] Confirm the V2 operating ownership model: Application Security governs policy, triage, risk acceptance, and escalation; DNS/service owners remediate.
- [x] Confirm provider-adapter delivery order: Route 53, Azure DNS, GoDaddy, then Namecheap.
- [x] Confirm DNS-only inspection: no HTTP/TLS/service fingerprinting, endpoint probing, or resource claiming in V2.
- [x] Confirm owner-configurable retention limits with V2 defaults and scoped access boundaries for normalized, raw, identity, audit, and report data.
- [x] Confirm LDAP support for both Microsoft Active Directory and OpenLDAP-compatible directory services.
- [x] Confirm that the enabled control plane uses local authentication/authorization by default and does not permit anonymous access; external AuthN/AuthZ is an explicit owner configuration.
- [ ] Approve the V2 architecture decisions, including ADR-001 through ADR-004.
- [ ] Obtain explicit implementation approval for the package layout, dependencies, MySQL/Sequelize schema, provider integrations, optional control-plane/API/UI, CI/container changes, and all public contracts.
- [ ] Initialize the isolated JavaScript ES-module package and repository scripts.
- [ ] Implement central configuration, AJV schemas, structured logging/redaction, error taxonomy, and tests.
- [ ] Define canonical schemas and adapter contracts.
- [ ] Implement and test the Route 53 adapter with coverage reporting.
- [ ] Implement bounded DNS evidence collection and tests.
- [ ] Implement approved storage, policy, ownership evidence, baseline, and drift functionality.
- [ ] Implement analyzers, report formats, and passive-only fingerprint policy.
- [ ] Add Azure DNS, GoDaddy, and Namecheap adapters in approved order.
- [ ] Add approved container/Kubernetes/GitLab CI configuration and operational runbook.
- [ ] Complete security architecture review, supply-chain review, and release validation.

## Approval Status

**Ready for Approval**

## Implementation Notes

Reserved for implementation-phase updates. No implementation has been authorized or performed.

## Change Summary

Reserved for post-implementation summary.

## Modified Files

Reserved for post-implementation file list.

## Validation

Planning validation completed: the specification reflects the supplied engineering constitution, application-security/implementation role guidance, and every resolved material decision recorded during this collaboration. Repository evidence confirms that no current JavaScript package, test framework, deployment configuration, or planning directory exists. Implementation validation is intentionally deferred until the guarded architecture decisions and explicit approval are complete.

## References

[1] [Ghost Records upstream repository](https://github.com/ja1sh/ghost-records)

[2] [Prior Ghost Records architecture assessment](../../ghost_records_architecture_assessment.md)

[3] `AGENTS.md`, supplied by the user, revision reviewed 17 August 2026.

[4] `application-security-analyst.toml`, supplied by the user, revision reviewed 17 August 2026.

[5] `application-security-architect.toml`, supplied by the user, revision reviewed 17 August 2026.

[6] `feature-implementor.toml` and `robotti-developer.toml`, supplied by the user, revisions reviewed 17 August 2026.

[7] [Sequelize, *Migrations*](https://sequelize.org/docs/v6/other-topics/migrations/)

[8] [OWASP, *Password Storage Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

[9] [Sequelize, *Connection Pool*](https://sequelize.org/docs/v6/other-topics/connection-pool/)

[10] [OWASP, *LDAP Injection Prevention Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/LDAP_Injection_Prevention_Cheat_Sheet.html)

[11] [Percona, *Percona XtraDB Cluster 8.4 Documentation*](https://docs.percona.com/percona-xtradb-cluster/8.4/index.html)

[12] [Percona, *Percona XtraDB Cluster 8.0 Documentation*](https://docs.percona.com/percona-xtradb-cluster/8.0/index.html)


## Implementation Plan

### 1. Feature Summary

Ghost Records v2 will be built as a new JavaScript ES-module application beside the retained Bash legacy utility. The current tracked repository contains only the legacy `ghost_records.sh`, `README.md`, `.gitignore`, and this specification. The v1 script is a direct AWS CLI/JQ/DIG workflow with Route 53 and Elastic IP behavior concentrated in one file; it must remain unchanged while v2 establishes a modular provider, DNS, ownership, persistence, reporting, and optional control-plane architecture.

### 2. Relevant Existing Architecture

| Area | Repository-confirmed state | Planning consequence |
| --- | --- | --- |
| Legacy scanner | `ghost_records.sh` performs AWS profile, EIP, Route 53, A/CNAME, and `dig`-based checks in one Bash file. | Preserve it as an unchanged legacy reference; do not migrate or refactor it in place. |
| Current build/test scaffold | No JavaScript package, test framework, migration framework, container definition, CI configuration, or web application exists. | T1 must introduce the isolated v2 scaffold before any domain behavior. |
| Current output model | V1 writes local Markdown/CSV and an optional minimal JSON summary. | V2 must define and test the canonical finding/artifact contract rather than inherit v1 CSV assumptions. |
| Existing deployment behavior | No container/Kubernetes/GitLab implementation is present. | Container, Kubernetes, and CI work is a late, explicitly approved implementation task. |
| Approved v2 contract | `docs/plans/ghost-records-v2.md` defines JavaScript-only, Sequelize-only MySQL persistence, DNS-only inspection, explicit coverage states, and optional secured REST/UI control plane behavior. | Every task must satisfy the specification acceptance criteria and constitution before later tasks depend on it. |

### 3. Proposed Approach

The safest implementation path is to build the v2 application in thin vertical slices. The first slice establishes the JavaScript/validation/logging/persistence boundaries without scanning. The second establishes canonical DNS and provider contracts, then proves them with the Route 53 adapter. Subsequent slices add DNS-only resolution, ownership and retention evidence, deterministic analysis, reporting, multi-instance coordination, the optional control plane, and provider adapters in the approved order. The legacy Bash utility remains untouched and serves only as a behavior reference.

Every task is independently reviewable. A task may begin only after all listed predecessors are complete and its required approval gate remains satisfied. The implementation workflow will execute one task at a time; discovery of a material discrepancy between a task and this specification stops implementation and returns the plan to review.

### 4. Impacted Areas

| Area | Expected scope |
| --- | --- |
| `ghost_records.sh` | Explicitly out of scope for v2 feature code; no behavior change. |
| `README.md` | Later documentation updates must distinguish legacy v1 from v2 and document approved deployment/configuration behavior. |
| `docs/plans/ghost-records-v2.md` | Maintains task status, implementation notes, modified-file list, and post-task validation evidence. |
| New v2 package area | Introduced only after approval; contains JavaScript ES modules, AJV schemas, Sequelize infrastructure, worker/control-plane modules, tests, and repository package scripts. |
| New tests/fixtures area | Introduced with the relevant task; includes provider fixtures, DNS fixtures, database integration coverage, security regressions, and artifact snapshots. |
| New documentation/reports area | Threat-model and secure-code-review reports are review artifacts; future product documentation is task-scoped. |
| Container/CI/Kubernetes configuration | Deferred to T23 and must not be introduced incidentally by earlier tasks. |

### 5. Task Breakdown

#### T1: Create the isolated v2 JavaScript foundation

- **Objective:** Establish a JavaScript ES-module package boundary and repository-defined validation commands without touching the legacy scanner.
- **Specific changes:** Add the approved v2 package structure, Node.js 22-compatible package metadata, minimal package scripts, test runner/linter configuration, and placeholder module boundaries for worker and control-plane roles. Record the chosen package location and scripts in this document. Do not introduce scanning, HTTP, database, provider, or container behavior.
- **Definition of done:** The repository has a deterministic JavaScript ES-module entrypoint and documented scripts; `ghost_records.sh` remains byte-for-byte unchanged.
- **Expected tests / validation:** Run the defined package scripts; verify the legacy file has no diff; perform an initial dependency and supply-chain review.
- **Predecessors:** Formal implementation approval and explicit package/dependency approval.

#### T2: Implement centralized configuration, errors, and structured redaction

- **Objective:** Create the trusted application boundary for runtime configuration and error/log handling.
- **Specific changes:** Add one centralized configuration loader; AJV schemas for environment/config inputs; typed error taxonomy; logical-source structured logger; secret redaction; and configuration validation for DNS-only mode, external MySQL, provider credentials, pool limits, retention limits, and disabled-by-default control-plane settings.
- **Definition of done:** Feature modules do not read `process.env` directly; invalid configuration fails closed before worker activity; confidential fields are redacted in error/log test cases.
- **Expected tests / validation:** Unit tests for required/invalid/unknown configuration, schema rejection, redaction, and error serialization; secure-code review focused on secrets, logging, and configuration.
- **Predecessors:** T1.

#### T3: Establish Sequelize-only MySQL infrastructure and migration lifecycle

- **Objective:** Create the owner-provisioned MySQL 8.0+/compatible-PXC persistence boundary.
- **Specific changes:** Add Sequelize initialization, a repository/model boundary, connection/TLS/pool configuration, controlled single-writer migration runner, migration tracking, health/readiness checks, and connection-budget validation based on configured replica limits. Do not provision MySQL or introduce raw SQL/direct-driver feature access.
- **Definition of done:** The application validates owner-provided MySQL connectivity and supports controlled migrations using Sequelize only; no bundled database or infrastructure provisioning capability exists.
- **Expected tests / validation:** Standalone MySQL integration tests; compatible PXC test plan/fixture or supported-environment integration path; migration repeatability/rollback-path tests; architecture checks rejecting raw SQL/direct driver access outside approved infrastructure.
- **Predecessors:** T2 and explicit Sequelize/MySQL schema approval.

#### T4: Define canonical domain schemas and adapter contracts

- **Objective:** Make provider data, DNS observations, coverage events, findings, and jobs unambiguous before any provider implementation.
- **Specific changes:** Implement centrally validated canonical objects for provider accounts, zones, records, DNS observations, ownership evidence, coverage events, scan jobs, findings, and artifacts. Define provider-adapter and ownership-adapter interfaces with typed success, partial, and failure outcomes.
- **Definition of done:** All boundary objects reject unexpected properties by default and provider failures cannot be represented as an empty successful inventory.
- **Expected tests / validation:** JSON-schema/AJV fixture tests for valid, malformed, unknown-field, partial-coverage, authorization-failure, and pagination-failure scenarios.
- **Predecessors:** T2 and T3 where persisted types are required.

#### T5: Implement Route 53 collection with explicit coverage reporting

- **Objective:** Prove the provider-adapter contract through a read-only AWS Route 53 implementation.
- **Specific changes:** Add Route 53 credential/config handling, hosted-zone and record pagination, public/private visibility handling, A/AAAA/CNAME/MX/NS/alias normalization, account/zone/record evidence, and typed coverage events. Use read-only operations only.
- **Definition of done:** Route 53 produces normalized records or explicit coverage gaps for inaccessible scopes, authentication failures, throttling, malformed responses, and pagination faults.
- **Expected tests / validation:** Recorded/sanitized API fixtures for normal pages, repeated/absent tokens, empty zones, private zones, authorization denial, throttling, malformed data, and partial scans. Verify there is no provider mutation request path.
- **Predecessors:** T4 and approved AWS SDK/dependency choice.

#### T6: Implement bounded DNS-only resolution evidence collection

- **Objective:** Collect DNS chain and terminal-answer evidence without HTTP/TLS/application probing.
- **Specific changes:** Add normalized hostname handling, bounded A/AAAA/CNAME resolution, resolver outcome taxonomy, recursion/query/concurrency/response/time limits, chain cycle handling, TTL capture, and private/reserved-address classification. Persist only through approved repositories when required.
- **Definition of done:** The resolver records declared target, chain, terminal answers, status, and observation time while classifying NXDOMAIN, NODATA, SERVFAIL, timeout, and coverage gaps distinctly.
- **Expected tests / validation:** Deterministic resolver fixtures for CNAME loops, multi-value/IPv6 answers, resolver errors, wildcard/split-horizon assumptions, depth/query limits, and DNS-only egress architecture tests proving no HTTP/TLS/application target path exists.
- **Predecessors:** T3 and T4.

#### T7: Implement AWS ownership evidence and approved-external policy

- **Objective:** Add the initial ownership/context layer needed to distinguish owned, approved external, unknown, unavailable, and not-found targets.
- **Specific changes:** Implement read-only AWS Elastic IP/resource inventory evidence, approved-external target policy records, policy owner/reason/scope/expiry requirements, and coverage-aware ownership classification.
- **Definition of done:** Unknown or inaccessible inventory is never reported as confirmed claimability; expired policy exceptions stop suppressing findings.
- **Expected tests / validation:** Fixtures for owned, idle EIP, cross-account, missing-account, unavailable inventory, approved external, expired policy, and unowned cases. Review read-only IAM credential documentation.
- **Predecessors:** T3, T4, and T5.

#### T8: Persist CNAME history, registration observations, and configurable retention

- **Objective:** Implement the durable evidence needed for CNAME terminal-IP drift and minimized WHOIS/RDAP history.
- **Specific changes:** Add Sequelize models/repositories/migrations for resolution snapshots, registration observations, policy decisions, finding history, and retention metadata. Add bounded/idempotent leased retention jobs, disabled-by-default raw-evidence capture, and centrally validated retention configuration.
- **Definition of done:** The system identifies terminal-IP/chain drift from persisted observations, retains minimized registration evidence with provenance, and purges according to owner-configured policy without logging deleted sensitive content.
- **Expected tests / validation:** Migration tests, retention boundary tests, concurrent purge lease tests, drift/no-baseline tests, raw-evidence-disabled tests, and data-access authorization tests where the control-plane domain is introduced.
- **Predecessors:** T3, T4, T6, and T7.

#### T9: Implement deterministic analyzers and finding lifecycle

- **Objective:** Turn canonical evidence into explainable DNS-only findings.
- **Specific changes:** Implement analyzers for `coverage_incomplete`, `unknown_external_target`, `resolution_failure`, `dns_drift`, `released_eip_candidate`, `takeover_candidate`, `delegation_risk`, and `mail_routing_risk`; add evidence references, confidence, first/last seen, severity, suppression state, remediation, and lifecycle transitions.
- **Definition of done:** No analyzer reports a confirmed takeover solely from DNS or inventory; findings retain sufficient evidence and coverage context for review.
- **Expected tests / validation:** Rule-table fixtures covering benign CDN/load-balancer drift, expected change windows, ambiguous external dependencies, EIP cases, CNAME failures, delegation/mail cases, and incomplete coverage.
- **Predecessors:** T5 through T8.

#### T10: Implement authoritative storage and scan-report artifacts

- **Objective:** Deliver the agreed MySQL-backed finding history plus JSON and Markdown/CSV artifacts.
- **Specific changes:** Persist authoritative findings/history, generate schema-versioned JSON artifacts and Markdown/CSV reports, add artifact retention/access metadata, and reconcile artifact output to the stored finding state. Do not add SARIF.
- **Definition of done:** Each completed scan has an authoritative stored result and artifacts that reconcile to it; logs are observability evidence rather than the findings authority.
- **Expected tests / validation:** Artifact schema/snapshot tests, reconciliation tests, retention tests, and redaction tests for reporting/error paths.
- **Predecessors:** T8 and T9.

#### T11: Implement multi-instance scan-job coordination

- **Objective:** Make worker execution correct for both a single process and multiple Kubernetes replicas.
- **Specific changes:** Add leased/idempotent scan jobs, safe retry/expiry behavior, concurrency controls, scan state transitions, and metrics/audit events using Sequelize transactions and the shared MySQL store.
- **Definition of done:** A task executes once per intended lease, expired workers can be recovered safely, and concurrent instances do not corrupt baselines or duplicate authoritative results.
- **Expected tests / validation:** Multi-worker integration tests, lease-expiry/retry tests, idempotency tests, pool-budget validation, and operational metric checks.
- **Predecessors:** T3, T8, T9, and T10.

#### T12: Implement control-plane foundation with disabled-by-default exposure

- **Objective:** Add the optional REST API and web UI hosting boundary without enabling it by default.
- **Specific changes:** Add Express application composition, strict Helmet/CSP baseline, request/application logging contract, centralized AJV middleware, rate limiting, error boundaries, static UI hosting boundary, and startup refusal when enabled configuration is incomplete.
- **Definition of done:** A disabled control plane opens no administrative listener; an enabled one enforces centralized validation, logging, and security middleware before business logic.
- **Expected tests / validation:** Startup configuration tests, middleware-order tests, CSP/Helmet header tests, malformed request rejection, rate-limit tests, request-log linkage tests, and security architecture review.
- **Predecessors:** T1, T2, T3, T10, and explicit HTTP/API/UI/dependency approval.

#### T13: Implement local authentication and server-side authorization

- **Objective:** Deliver the default control-plane identity strategy securely.
- **Specific changes:** Add local users, roles/permissions/role bindings, Argon2id password storage, bootstrap/admin lifecycle, generic authentication failures, throttling, secure session/token controls, CSRF protection for cookie workflows, audit events, and server-side authorization enforcement for findings/policy/configuration actions.
- **Definition of done:** The enabled control plane defaults to local authentication; anonymous access is impossible; authorization is enforced independent of UI state.
- **Expected tests / validation:** Password/security regression tests, authn/authz matrix tests, BOLA/IDOR-style scoped-access tests, CSRF tests, session revocation/expiry tests, logging-redaction tests, and focused secure-code review.
- **Predecessors:** T12 and explicit local-auth storage/security approval.

#### T14: Implement external identity adapters

- **Objective:** Add explicitly configured alternatives to the local default: Active Directory LDAP, OpenLDAP-compatible LDAP, OAuth 2.0/OIDC, and Azure SSO.
- **Specific changes:** Implement separate adapters, strict TLS/certificate/bind configuration and filter/DN handling for LDAP, issuer/claim validation for OIDC/Azure, external-identity mapping, group/claim-to-role mapping, and fail-closed configuration.
- **Definition of done:** External identity is opt-in; LDAP rejects anonymous/unauthenticated and insecure production binding; all adapters map only allowlisted identities/groups/claims into least-privilege roles.
- **Expected tests / validation:** Adapter fixtures/mocks; LDAP escaping and TLS/certificate tests; OIDC issuer/audience/expiry/claim tests; group/claim mapping denial tests; secure-code review of identity flows.
- **Predecessors:** T13 and explicit external identity dependency approval.

#### T15: Implement the authenticated web UI workflows

- **Objective:** Provide the approved UI over the secured API for findings, evidence, policy, configuration, and audit-relevant actions.
- **Specific changes:** Add minimal UI routes/components, authenticated session handling, scoped findings/history views, policy administration with expiry/ownership fields, configuration views, error/empty/loading states, and safe rendering of untrusted DNS/provider data.
- **Definition of done:** The UI uses the same authorization policy as the API, does not render raw/untrusted HTML, and cannot perform actions the server does not authorize.
- **Expected tests / validation:** UI/component tests, route authorization tests, XSS-safe rendering tests, CSRF state-change tests, accessibility checks for critical workflows, and browser-security regression checks.
- **Predecessors:** T12 through T14.

#### T16: Implement the Azure DNS and Azure ownership adapters

- **Objective:** Deliver the first non-AWS provider in the approved sequence with paired ownership context.
- **Specific changes:** Add Azure DNS zone/record collection and Azure resource-ownership evidence using read-only credentials, canonical normalization, pagination/error coverage, and provider-specific fixtures.
- **Definition of done:** Azure DNS findings meet the same coverage/evidence contract as Route 53 and do not assume a subscription/resource inventory is complete when access is partial.
- **Expected tests / validation:** Azure fixtures for zone/record pagination, permissions, throttling, malformed responses, aliases, and partial scope; read-only credential documentation; analyzer parity tests.
- **Predecessors:** T4, T9, T10, and explicit Azure SDK/dependency approval.

#### T17: Implement the GoDaddy adapter

- **Objective:** Add GoDaddy DNS inventory in the approved provider order.
- **Specific changes:** Implement scoped read-only configuration, domain/record collection, canonical normalization, provider-specific error/pagination coverage, and collection-boundary reporting.
- **Definition of done:** GoDaddy retrieval is distinguished from proof of authoritative DNS hosting, and failures/partial visibility remain explicit coverage events.
- **Expected tests / validation:** Sanitized provider fixtures, authorization/error tests, domain/zone authority edge cases, normalization tests, and analyzer parity tests.
- **Predecessors:** T4, T9, T10, and T16; explicit provider dependency approval.

#### T18: Implement the Namecheap adapter

- **Objective:** Add Namecheap DNS inventory as the final approved provider adapter.
- **Specific changes:** Implement scoped read-only configuration, host-record collection, canonical normalization, provider-specific error handling, and explicit coverage results.
- **Definition of done:** Namecheap results meet the shared contract and never transform unavailable or partial API data into an empty authoritative inventory.
- **Expected tests / validation:** Sanitized provider fixtures, authentication/throttling/error tests, record-normalization tests, and analyzer parity tests.
- **Predecessors:** T4, T9, T10, and T17; explicit provider dependency approval.

#### T19: Containerize and add Kubernetes/GitLab operational hardening

- **Objective:** Package the approved worker/control-plane deployment pattern and its operational safeguards.
- **Specific changes:** Add container build, deployment/job manifest patterns, resource limits, probes, secret/config injection documentation, GitLab CI integration, SBOM/SCA/image scan controls, log-ingestion integration, and an upgrade/rollback/runbook package. Do not provision MySQL.
- **Definition of done:** The application can run as a combined single instance or scaled worker/control-plane deployment against owner-managed MySQL/PXC with documented operational prerequisites.
- **Expected tests / validation:** Container build, image scan, deployment-manifest validation, startup/readiness checks, migration-job validation, CI script execution, and restore/upgrade runbook exercise.
- **Predecessors:** T11 through T15 and explicit container/CI/Kubernetes approval.

#### T20: Perform milestone security review and release validation

- **Objective:** Validate the completed v2 scope before release consideration.
- **Specific changes:** Run the repository-grounded secure-code-review workflow against changed files first; update the threat model for implementation evidence; resolve or formally accept material findings; finalize supply-chain, authorization, DNS-only egress, migration, data-retention, and provider-coverage evidence.
- **Definition of done:** Review artifacts identify evidence-based strengths/findings, all acceptance criteria are mapped to validation evidence, and any residual risk has an accountable owner and expiry.
- **Expected tests / validation:** Full repository test suite, dependency/SBOM/image review, rendered/validated Mermaid diagrams, security regression suite, multi-instance and database upgrade tests, and release checklist sign-off.
- **Predecessors:** T19 and completion of all in-scope provider tasks.

### 6. Risks and Edge Cases

| Risk or edge case | Planned handling |
| --- | --- |
| Legacy-v2 confusion | T1 and later documentation preserve the Bash file unchanged and clearly separate its scope from v2. |
| Missing prerequisites | Each task lists predecessors; execution stops rather than silently creating unapproved dependencies or architecture. |
| Provider-specific inventory semantics | T4 establishes the contract; T5/T16–T18 use provider fixtures and explicit coverage events rather than treating empty results as authoritative. |
| Misclassification of DNS drift | T6–T9 retain bounded evidence, ownership context, historical state, policy, and confidence; no DNS-only conclusion becomes a confirmed takeover. |
| DNS-only boundary erosion | T6, T9, and T20 include architecture/egress tests prohibiting HTTP/TLS/application probing and resource claims. |
| Database contention or unsafe migrations | T3, T8, and T11 use Sequelize-only access, a controlled migration actor, configured pool budget, and leased/idempotent jobs. |
| Control-plane attack surface | T12–T15 are explicitly deferred and gated; they include AJV, Helmet, strict CSP, local-by-default identity, server-side authorization, CSRF where relevant, and identity-specific security tests. |
| Retention/privacy drift | T8 centralizes owner-configurable limits, disables raw evidence by default, and uses bounded/auditable purge jobs. |
| Deployment assumptions | T19 starts only after the application-level tasks are complete and explicit container/Kubernetes/CI approval is reconfirmed. |

### 7. Open Questions / Assumptions

All material product-design questions are resolved in the approved specification. The following implementation-time gates remain deliberately unresolved until the relevant task is selected: the exact dependency choices; credential-secret delivery mechanism and provider scopes; target MySQL/PXC test environment; OIDC/Azure/LDAP tenant-specific connection details; UI framework choice; GitLab shared-template requirements; and Kubernetes deployment conventions. These are **approval gates**, not permission to make assumptions.

### 8. Suggested Execution Order

1. **T1–T4:** Establish the isolated JavaScript, configuration, persistence, and canonical-contract foundations before any external provider behavior.
2. **T5–T11:** Prove Route 53, DNS-only resolution, ownership, retention, analyzers, reporting, and multi-instance worker correctness.
3. **T12–T15:** Add the optional REST/UI control plane and its local/external identity strategies only after the authoritative worker/reporting path exists.
4. **T16–T18:** Add Azure DNS, GoDaddy, and Namecheap in the approved sequence with the shared coverage/evidence contract.
5. **T19–T20:** Add deployment hardening and complete security/release validation after application behavior is mature.

No task in this implementation plan is authorized for code execution until the user selects the specific task and confirms the applicable approval gates.

## Planning Workflow Reconciliation

The imported `plan-feat` workflow has been applied by adding this task-level plan. The imported `implement-feat` workflow governs future execution: one selected task only, no silent scope expansion, validation alongside code, explicit blocker reporting, and task-status updates only after the definition of done is satisfied. The imported threat-model and secure-code-review workflows are required pre-implementation and at the security-sensitive/release milestones stated above. Their helper scripts remain external review tools and are not application dependencies or repository content.

## Task Status

All tasks T1–T20 are **Pending**. No application code, dependency, runtime, schema, API, UI, or deployment configuration has been introduced by this planning update.

## Approval Status

**Task-Level Plan Ready for Review**


## Database Lifecycle and Logical Export Amendment

The owner is solely responsible for the MySQL/PXC database lifecycle, including provisioning, topology, availability, encryption, backups, recovery, monitoring, capacity, and execution of database-level restore operations. Ghost Records will provide configuration guidance, migration compatibility, upgrade notes, and documented backup/restore validation guidance; it does not operate, manage, warrant, or assume responsibility for database backup, availability, degradation, or data loss. This boundary applies equally to single-instance and Kubernetes deployments.

V2 must provide a **logical administrative data-export capability** to assist owners with their backup and recovery processes. This feature is not a replacement for database-native backup or restore tooling and must not be described as a guaranteed, complete, point-in-time, or physical MySQL backup. V2 does not include data import, automatic restoration, database dump orchestration, or database lifecycle management.

| Logical export requirement | V2 requirement |
| --- | --- |
| Authorization | Expose export only through the enabled control plane to an explicitly authorized administrative permission. It is unavailable while the control plane is disabled. |
| Data scope | Support bounded exports of normalized findings/history, DNS observations, policy records, retention metadata, and audit-relevant application records. Exclude secrets, provider credentials, database credentials, password hashes, session tokens, recovery secrets, raw confidential configuration, and any excluded raw evidence. |
| Format and provenance | Produce versioned JSON and CSV formats with an export manifest declaring schema version, creation time, requested scope, record counts, excluded categories, and application version. |
| Delivery | Generate exports by bounded server-side streaming or a leased job with an authorized download path. Do not rely on container-local disk for durability or correctness. |
| Security controls | Enforce server-side scope authorization, centralized AJV validation, row/record limits, rate limiting, audit logging, redaction, safe content-disposition headers, and retention/deletion according to the owner-configured artifact policy. |
| Operations guidance | Document that owners must use their MySQL/PXC-native backup and restore tooling for database recovery, validate logical exports for their own environment, and periodically test their documented recovery procedure. |

### T15A: Implement secured administrative logical data export

- **Objective:** Provide a controlled administrative export path that assists owner-managed backup and recovery operations without asserting database-backup responsibility.
- **Specific changes:** Add an authorization permission and scoped control-plane export workflow; implement centrally validated filters, bounded JSON/CSV serialization, a versioned manifest, safe streaming or leased-job delivery, export audit events, rate limits, redaction/exclusion rules, artifact-retention integration, and user-facing guidance that explains the logical-export limitation.
- **Definition of done:** Authorized administrators can export only their permitted, non-secret logical application data; every export is auditable and bounded; no export includes credentials, password hashes, tokens, session records, raw confidential configuration, or excluded raw evidence; and no behavior claims a physical or point-in-time database backup.
- **Expected tests / validation:** Authorization-scope and BOLA/IDOR tests; secret-exclusion/redaction tests; schema/manifest tests; row-limit and rate-limit tests; CSV formula-injection-safe serialization tests; streaming/job-resume tests; artifact-retention tests; security review of export/download flows; and documentation review against owner-managed database responsibility.
- **Predecessors:** T10, T12, T13, and T15.

### Execution-order amendment

T15A follows T15 and precedes T19. T20 must include logical-export authorization, secret-exclusion, retention, and recovery-guidance validation. This amendment supersedes any earlier wording that could imply Ghost Records performs database backup, recovery, or lifecycle management.
