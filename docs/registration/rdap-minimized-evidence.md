# RDAP Minimized Registration Evidence

Ghost Records v2 obtains registration context through the **Registration Data Access Protocol (RDAP)** only. It does not send WHOIS queries, and it does not perform application-service probing. The RDAP lookup path is limited to an exact, read-only domain query after the client retrieves the IANA DNS bootstrap document from the fixed HTTPS location `https://data.iana.org/rdap/dns.json`.[1] [2]

The bootstrap document identifies potential authoritative RDAP roots by domain suffix. A bootstrap-discovered root is not automatically trusted for egress: an owner must include its normalized HTTPS service root in `GHOST_RECORDS_RDAP_ALLOWED_ROOTS_JSON` before Ghost Records issues a domain request. Roots must use an HTTPS hostname, contain no credentials, port, query, fragment, or IP literal, and are normalized with a trailing slash. The client rejects redirects and bounds response size and request duration.

| Configuration | Default | Meaning |
| --- | --- | --- |
| `GHOST_RECORDS_RDAP_ALLOWED_ROOTS_JSON` | `[]` | JSON array of owner-approved RDAP HTTPS service roots. An empty list leaves registration collection unavailable by policy rather than guessing an endpoint. |
| `GHOST_RECORDS_RDAP_BOOTSTRAP_CACHE_TTL_MS` | `86400000` | Cache lifetime for the validated bootstrap document; minimum 60 seconds and maximum 7 days. |
| `GHOST_RECORDS_RETENTION_REGISTRATION_DAYS` | `90` | Owner-configurable retention period for minimized registration observations. |
| `GHOST_RECORDS_RAW_EVIDENCE_ENABLED` | `false`, enforced | Raw RDAP JSON is not collected or persisted in this version. |
| `GHOST_RECORDS_RETENTION_RAW_EVIDENCE_DAYS` | `0` | Raw-evidence retention is disabled together with raw capture. |

Only minimized evidence is persisted: the normalized domain/handle, source root, registrar handle, status values, selected registration/expiration/update event timestamps, nameserver names, SHA-256 response fingerprint, typed coverage state, and observation time. The client intentionally excludes entity objects, vCard data, registrant/contact names, addresses, telephone values, email values, raw JSON, and response bodies. ICANN’s registration-data policy describes public registration data and applicable redaction requirements; Ghost Records treats contact material as outside the T8 evidence model.[3]

A successful request is evidence of a public RDAP response, not proof of domain ownership or takeover feasibility. `unsupported-scope`, `not-found`, malformed-response, and network outcomes are retained as coverage evidence. Owners should run the least-privilege RDAP smoke test against a non-production target before depending on the collection path in production.

## References

[1]: https://www.iana.org/assignments/rdap-dns/rdap-dns.xhtml "IANA Bootstrap Service Registry for Domain Name Space"
[2]: https://www.rfc-editor.org/rfc/rfc9082.html "RFC 9082: Registration Data Access Protocol Query Format"
[3]: https://www.icann.org/en/contracted-parties/consensus-policies/registration-data-policy "ICANN Registration Data Policy"
