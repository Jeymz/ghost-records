# AWS Elastic IP Ownership Evidence

Ghost Records v2 uses a narrowly scoped, **read-only direct AWS Query API client** for AWS Elastic IP ownership evidence. It does not add an AWS SDK, perform resource mutation, discover regions dynamically, assume roles, or obtain ambient credentials. The client uses the static or session credentials already declared for the Route 53 provider, native Signature Version 4 signing, HTTPS, and an explicit owner-provided EC2 region list.

## Configuration

The `GHOST_RECORDS_AWS_EC2_REGIONS_JSON` value is a JSON array of regions to inspect. The system does not call `DescribeRegions`; therefore, this array defines both the collection boundary and the expected coverage boundary. `GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON` is a JSON array of temporary exact-match exemptions.

| Setting | Example | Constraint |
| --- | --- | --- |
| `GHOST_RECORDS_AWS_EC2_REGIONS_JSON` | `["us-east-1","us-west-2"]` | Each region must be explicit, syntactically valid, and no more than 50 regions may be configured. |
| `GHOST_RECORDS_APPROVED_EXTERNAL_POLICIES_JSON` | See the following record | Each record requires `policyId`, `target`, `scope`, `owner`, `reason`, and `expiresAt`. |

```json
[
  {
    "policyId": "partner-cdn-2026",
    "target": "cdn.partner.example",
    "scope": "route53:123456789012:ZEXAMPLE",
    "owner": "Application Security",
    "reason": "Approved managed CDN dependency",
    "expiresAt": "2026-12-31T00:00:00Z"
  }
]
```

The policy evaluator applies only exact normalized hostname or IP matches in the exact declared scope. It does not support wildcard, CIDR, suffix, or cross-scope suppression. An expired policy is retained as contextual evidence but never returns `approved-external` and therefore cannot suppress a later finding.

## Read-only AWS boundary

The client first calls `sts:GetCallerIdentity` to bind the credential account to the inventory evidence. It then calls `ec2:DescribeAddresses` once for each configured region and subject IPv4 address. The EC2 endpoint is derived only from a validated configured **standard-partition** region in the form `https://ec2.<region>.amazonaws.com`; the STS endpoint is fixed at `https://sts.amazonaws.com`. AWS China, GovCloud, and isolated partitions are rejected in T7 because their endpoint and STS model require a separately approved implementation. Every request is HTTPS and SigV4-signed.

The following least-privilege policy is the recommended starting point. EC2 `Describe*` actions do not support resource-level permissions, so `DescribeAddresses` requires `Resource: "*"`. The `aws:RequestedRegion` condition should be constrained to the exact regions configured for the deployment.[1]

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadElasticIpInventoryOnly",
      "Effect": "Allow",
      "Action": "ec2:DescribeAddresses",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": ["us-east-1", "us-west-2"]
        },
        "Bool": {
          "aws:SecureTransport": "true"
        }
      }
    }
  ]
}
```

> `sts:GetCallerIdentity` identifies the calling account, ARN, and user ID. AWS documents that it returns identity information without requiring an explicit permission grant.[2]

## Evidence and limitations

An EIP returned by `DescribeAddresses` is evidence that the configured credential account owns that Elastic IP. The evidence includes the region, allocation ID, and association state. An unassociated address is reported as **owned and idle**; it is not reported as externally claimable. An EIP associated with a network interface owned by another account is still reported as **owned**, with a `cross-account-associated` context rather than an unowned conclusion.

If every configured regional inventory call succeeds and the IP is absent, the result is `not-found` with complete coverage. If any configured region is unavailable, unauthorized, malformed, or throttled, the result is `unknown` with partial coverage; the system does not infer claimability from that incomplete evidence. A credential-account identity failure is a failed ownership outcome, not an unowned result.

The owner should validate this integration with a non-production AWS account and a least-privilege role before production credentials are used. The evidence identifies EIP allocation context only; it does not prove DNS takeover feasibility or make network, HTTP, TLS, or service-fingerprinting requests.

## References

[1]: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/iam-policies-for-amazon-ec2.html
[2]: https://docs.aws.amazon.com/STS/latest/APIReference/API_GetCallerIdentity.html
