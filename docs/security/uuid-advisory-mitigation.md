# Temporary UUID Advisory Acceptance and Mitigation

## Decision

Ghost Records v2 temporarily retains stable `sequelize` 6.37.8, which declares `uuid ^8.3.2`, rather than forcing a transitive UUID override or adopting the prerelease Sequelize v7 package family. This is a **time-bounded exception** for [GHSA-w5hq-g745-h8pq][1] / CVE-2026-41907, not a statement that the advisory is resolved upstream.

## Advisory Scope

The advisory affects UUID library API methods **v3, v5, and v6** when an application supplies an external output buffer or offset that does not have room for a complete UUID write. The primary consequence is a silent partial write that can affect integrity or robustness. It does not describe a network parser, database protocol, or automatic remote code-execution issue by itself.[1] [2]

## Repository Reachability Assessment

| Evidence type | Observation |
| --- | --- |
| Repository-confirmed | Ghost Records application source does not import `uuid` or expose UUID-generation inputs. |
| Repository-confirmed | The installed Sequelize 6.37.8 source imports and invokes UUID **v1** and **v4** helpers; its source does not invoke UUID v3, v5, or v6 in the observed utility path. |
| Repository-confirmed | T3 installs a guard at Sequelize client creation that accepts only the non-buffered v4 boundary and rejects affected algorithms, caller-provided buffers, and offsets. |
| Operator decision | The owner rejected transitive version forcing and prerelease ORM adoption. |
| UNKNOWN | A future Sequelize release’s dependency tree and UUID API use cannot be assumed; audit and reachability review are required at every dependency upgrade. |

## Active Mitigation

`src/security/uuid-advisory-mitigation.js` is the removable mitigation module. `createSequelizeClient()` invokes `enforceSequelizeUuidBoundary()` before constructing the ORM client. The guard rejects v3, v5, and v6 requests and rejects any caller-supplied output buffer or offset, which removes the vulnerable application-controlled usage pattern from Ghost Records code.

The persistence architecture test rejects direct `uuid` imports, direct MySQL-driver imports, and direct SQL/query calls from application persistence code. The mitigation tests cover allowed non-buffered v4 usage and rejection of all affected algorithm/buffer paths without reproducing an out-of-bounds write.

## Residual Risk and Acceptance Boundary

The application-side guard cannot patch code inside the installed third-party package. The residual risk is limited to an unanticipated transitive library path that introduces an affected API call with a caller-supplied buffer or offset. This risk is accepted only while all of the following remain true:

1. Application source does not expose direct UUID v3/v5/v6 usage or caller-supplied UUID buffers/offsets.
2. The installed Sequelize source remains limited to the observed v1/v4 UUID utility calls for Ghost Records’ supported usage.
3. `npm audit`, the architecture regression test, and the UUID mitigation tests execute on every change to Sequelize or the dependency lockfile.
4. No credible evidence identifies a reachable affected UUID API path through the supported Sequelize/MySQL configuration.

## Retirement Criteria

Remove this mitigation and delete this acceptance document only after a supported, non-prerelease Sequelize release supports the project’s Node.js/MySQL requirements and its resolved UUID dependency is outside the affected range. The removal change must include:

1. A clean dependency audit for this advisory.
2. A dependency-tree review demonstrating the resolved UUID version.
3. A focused review of Sequelize UUID call paths.
4. Removal of the mitigation module and its tests in the same commit.

Until then, review this exception at each dependency update and at least quarterly.

## References

[1]: https://github.com/advisories/GHSA-w5hq-g745-h8pq
[2]: https://github.com/uuidjs/uuid/blob/main/CHANGELOG.md
