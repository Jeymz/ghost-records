# DNS-Only Resolution Evidence

Ghost Records v2 uses the Node.js `node:dns/promises` resolver API to collect **DNS protocol evidence only**. It does not issue HTTP, HTTPS, TLS, service-fingerprinting, application-protocol, reverse-DNS, resource-claiming, or cloud-mutation requests. The resolver obtains CNAME, A, and AAAA evidence through the system-configured DNS resolver; it deliberately does not use `dns.lookup()`, which can use operating-system name-resolution facilities rather than performing DNS protocol queries.[1]

> DNS evidence is observational. A successful answer, unresolved name, or private address is not by itself proof of ownership, claimability, compromise, or a takeover condition.

## Central Configuration

All resolver limits are loaded through the central configuration boundary. They are environment-driven and container-compatible; no DNS module reads environment variables directly.

| Environment variable | Default | Valid range | Purpose |
| --- | ---: | ---: | --- |
| `GHOST_RECORDS_DNS_MAX_CHAIN_DEPTH` | 8 | 1–32 | Maximum normalized names retained while following CNAME hops. |
| `GHOST_RECORDS_DNS_MAX_QUERIES` | 32 | 1–128 | Maximum CNAME/A/AAAA requests for one observation. |
| `GHOST_RECORDS_DNS_MAX_CONCURRENCY` | 4 | 1–32 | Maximum concurrent target observations accepted by `resolveMany`. |
| `GHOST_RECORDS_DNS_QUERY_TIMEOUT_MS` | 3000 | 1–30000 | Per-query timeout; the resolver is cancelled on expiry. |
| `GHOST_RECORDS_DNS_MAX_ANSWERS` | 100 | 1–100 | Maximum retained terminal A/AAAA answers. |

Configuration outside these ranges fails AJV validation before DNS work begins. The resolver normalizes hostnames, rejects URL syntax, wildcard names, ports, whitespace, IP literals, and non-hostname labels, then validates the request against the canonical domain schema.

## Evidence Model

A DNS observation contains the original normalized target, query type, CNAME chain, terminal hostname, A/AAAA answers, per-answer TTL/family/address classification, resolver status, coverage status, query count, configured limits, and observation timestamp.

| Outcome | `rcode` | Coverage treatment |
| --- | --- | --- |
| Terminal A/AAAA answers | `NOERROR` | `complete / complete` |
| Authoritative no-data result | `NODATA` | `complete / complete` |
| Name not found | `NXDOMAIN` | `failed / resolver-failure` |
| Server failure or refusal | `SERVFAIL` or `REFUSED` | `failed / resolver-failure` |
| Timeout/cancel | `TIMEOUT` | `failed / timeout` |
| CNAME cycle, depth or query limit | `UNKNOWN` | `partial` with a specific `chain-cycle`, `depth-limit`, or `query-limit` reason |
| One address family succeeds while another fails | Resolver-specific status | `partial / resolver-failure` with retained successful terminal evidence |

The Node resolver can return A/AAAA records with TTL values when `ttl: true` is requested.[1] CNAME TTL is not fabricated when the native resolver does not expose it; only returned terminal A/AAAA TTL values are retained.

## Address Classification

Terminal answers are classified locally as `public`, `private`, `reserved`, `loopback`, `link-local`, `multicast`, `unspecified`, `documentation`, or `unknown`. Classification does not block or probe an address. It exists to preserve evidence context for later ownership and analyzer tasks.

A private or link-local answer may reflect valid split-horizon DNS. Likewise, a response that appears wildcard-derived cannot be established from this resolver alone. T6 records the answer and its classification while leaving ownership/authority conclusions to later policy and evidence tasks.

## Resolver Trust and Deployment Guidance

The implementation reports the resolver evidence as `system-configured` with transport `system` because the Node resolver uses the deployment’s configured DNS servers. It does not claim DNSSEC validation, authoritative-server provenance, resolver identity, EDNS details, or transport-level DNS observability that the API does not expose.

Owners should configure Kubernetes, container-host, or VM DNS according to their internal resolver and zero-trust policy; restrict DNS egress at the infrastructure layer; maintain clock/network monitoring; and test their intended split-horizon behavior before enabling scheduled scans. Do not interpret a T6 observation as an internet-authoritative result when the runtime resolver is internal or policy-routed.

## Validation Boundaries

The T6 architecture regression test rejects HTTP, HTTPS, TLS, datagram, child-process, `fetch`, socket-connect, and process-execution paths in `src/dns/`. Tests use resolver doubles and sanitized in-memory records; they do not query public DNS during the repository test suite.

## Reference

[1] [Node.js, *DNS API*](https://nodejs.org/api/dns.html)
