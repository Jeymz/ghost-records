# Route 53 Direct Query API Configuration

Ghost Records v2 collects Amazon Route 53 DNS inventory through the **read-only Route 53 Query API**. It does not use an AWS service SDK, AWS CLI, ambient credential discovery, STS role assumption, mutation operation, or caller-configured endpoint. The client uses Node.js `fetch`, `node:crypto` Signature Version 4 signing, and a fixed HTTPS Route 53 endpoint.

> This adapter is an inventory collector, not a remediation client. It never creates, changes, deletes, or claims DNS or cloud resources.

## Credentials and Central Configuration

The application accepts only environment-provided static credentials and an optional session token. Secret values must be supplied through the owner’s approved environment-secret mechanism; in Kubernetes, this may be a mounted or injected Kubernetes Secret. Ghost Records reads values only through its centralized configuration boundary and redacts them from logs and error output.

```text
AWS_ACCESS_KEY_ID=<owner-provided access key id>
AWS_SECRET_ACCESS_KEY=<owner-provided secret access key>
AWS_SESSION_TOKEN=<optional temporary-credential session token>

GHOST_RECORDS_PROVIDER_CREDENTIALS_JSON=[
  {
    "provider": "route53",
    "secretEnvironmentKeys": [
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_SESSION_TOKEN"
    ]
  }
]
```

The session-token entry is optional. The configuration loader rejects missing declared values, duplicate Route 53 entries, and any Route 53 credential reference other than the three names above. It does not discover credentials from an AWS metadata service, shared credentials file, AWS profile, web-identity token, or STS role-assumption flow.

## Read-Only IAM Boundary

The deployment identity must be granted only the Route 53 list actions required by the collector. The following policy is a minimal starting point; the owner must validate it for the account, partition, and organizational controls in use.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GhostRecordsRoute53ReadOnlyInventory",
      "Effect": "Allow",
      "Action": [
        "route53:ListHostedZones",
        "route53:ListResourceRecordSets"
      ],
      "Resource": "*"
    }
  ]
}
```

The adapter supports exactly these API operations. Its source is regression-tested to reject AWS SDK imports and to prohibit Route 53 mutation operation names. Application-level zone selection is not an IAM security boundary: an identity that can list hosted zones may disclose inventory metadata across its granted account scope. Owners must use a dedicated least-privilege identity and their own IAM/SCP controls to constrain access appropriately.

## Zone Enablement and Request Boundary

A user or owner configuration must explicitly select every zone that may be scanned. The adapter first lists zones for account evidence, then retrieves records only for the enabled zone identifiers. An absent enabled-zone selection fails schema validation before any provider call. A selected zone that is not discovered is reported as an explicit `unsupported-scope` coverage gap rather than an empty successful inventory.

## Network, Signing, and Pagination Controls

For the standard AWS partition, the direct client connects only to `https://route53.amazonaws.com` and signs requests for the `route53` service using the `us-east-1` Signature Version 4 scope. It sends only signed `GET` requests, rejects redirects, requires an XML response content type, bounds response size, timeout, retry count, and total pages, and sends no request to a caller-provided URL.

Route 53 zone pagination uses `NextMarker`. Record pagination uses the complete continuation tuple: `NextRecordName`, `NextRecordType`, and `NextRecordIdentifier` when present. Repeated or missing continuation values are converted into a `pagination` coverage failure. Authorization, authentication, throttling, malformed response, network, and unsupported-scope conditions retain distinct typed coverage evidence.

## Owner Operations

Owners remain responsible for credential lifecycle, secret delivery, IAM review, account selection, and monitoring. The application retains no raw credential in report artifacts, structured logs, database records, or fixture files. Rotate credentials through the owner’s secret delivery mechanism and restart or redeploy the application according to the owner’s operating procedure.

## References

[1] [AWS, *ListHostedZones API Reference*](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ListHostedZones.html)

[2] [AWS, *ListResourceRecordSets API Reference*](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ListResourceRecordSets.html)

[3] [AWS, *Route 53 Endpoints and Quotas*](https://docs.aws.amazon.com/general/latest/gr/r53.html)

[4] [AWS, *Create a Signed AWS API Request*](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html)

[5] [AWS, *Actions, Resources, and Condition Keys for Amazon Route 53*](https://docs.aws.amazon.com/service-authorization/latest/reference/list_route53.html)
