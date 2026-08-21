export const callerIdentityXml = `<?xml version="1.0" encoding="UTF-8"?>
<GetCallerIdentityResponse xmlns="https://sts.amazonaws.com/doc/2011-06-15/">
  <GetCallerIdentityResult>
    <Account>123456789012</Account>
    <Arn>arn:aws:iam::123456789012:role/ghost-records-readonly</Arn>
    <UserId>AROEXAMPLE:ghost-records</UserId>
  </GetCallerIdentityResult>
</GetCallerIdentityResponse>`;

export const ownedIdleAddressXml = `<?xml version="1.0" encoding="UTF-8"?>
<DescribeAddressesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <addressesSet>
    <item>
      <publicIp>198.51.100.10</publicIp>
      <allocationId>eipalloc-0123456789abcdef0</allocationId>
      <domain>vpc</domain>
    </item>
  </addressesSet>
</DescribeAddressesResponse>`;

export const ownedCrossAccountAddressXml = `<?xml version="1.0" encoding="UTF-8"?>
<DescribeAddressesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <addressesSet>
    <item>
      <publicIp>198.51.100.10</publicIp>
      <allocationId>eipalloc-0123456789abcdef0</allocationId>
      <associationId>eipassoc-0123456789abcdef0</associationId>
      <networkInterfaceId>eni-0123456789abcdef0</networkInterfaceId>
      <networkInterfaceOwnerId>210987654321</networkInterfaceOwnerId>
      <privateIpAddress>10.0.0.10</privateIpAddress>
      <domain>vpc</domain>
    </item>
  </addressesSet>
</DescribeAddressesResponse>`;

export const emptyAddressesXml = `<?xml version="1.0" encoding="UTF-8"?>
<DescribeAddressesResponse xmlns="http://ec2.amazonaws.com/doc/2016-11-15/">
  <addressesSet />
</DescribeAddressesResponse>`;

export const malformedAddressesXml = '<DescribeAddressesResponse><addressesSet><item>';
