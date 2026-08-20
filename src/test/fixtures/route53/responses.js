export const hostedZonesFirstPage = `<?xml version="1.0" encoding="UTF-8"?>
<ListHostedZonesResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <HostedZones>
    <HostedZone>
      <Id>/hostedzone/ZPUBLIC1</Id>
      <Name>example.com.</Name>
      <Config><PrivateZone>false</PrivateZone></Config>
    </HostedZone>
  </HostedZones>
  <IsTruncated>true</IsTruncated>
  <NextMarker>ZPRIVATE1</NextMarker>
  <MaxItems>100</MaxItems>
</ListHostedZonesResponse>`;

export const hostedZonesSecondPage = `<?xml version="1.0" encoding="UTF-8"?>
<ListHostedZonesResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <HostedZones>
    <HostedZone>
      <Id>/hostedzone/ZPRIVATE1</Id>
      <Name>internal.example.</Name>
      <Config><PrivateZone>true</PrivateZone></Config>
    </HostedZone>
  </HostedZones>
  <IsTruncated>false</IsTruncated>
  <MaxItems>100</MaxItems>
</ListHostedZonesResponse>`;

export const publicRecordsFirstPage = `<?xml version="1.0" encoding="UTF-8"?>
<ListResourceRecordSetsResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ResourceRecordSets>
    <ResourceRecordSet>
      <Name>www.example.com.</Name>
      <Type>A</Type>
      <TTL>60</TTL>
      <ResourceRecords><ResourceRecord><Value>192.0.2.10</Value></ResourceRecord></ResourceRecords>
    </ResourceRecordSet>
    <ResourceRecordSet>
      <Name>app.example.com.</Name>
      <Type>CNAME</Type>
      <TTL>300</TTL>
      <ResourceRecords><ResourceRecord><Value>target.vendor.example.</Value></ResourceRecord></ResourceRecords>
    </ResourceRecordSet>
    <ResourceRecordSet>
      <Name>notes.example.com.</Name>
      <Type>TXT</Type>
      <TTL>60</TTL>
      <ResourceRecords><ResourceRecord><Value>ignored-by-v2</Value></ResourceRecord></ResourceRecords>
    </ResourceRecordSet>
  </ResourceRecordSets>
  <IsTruncated>true</IsTruncated>
  <NextRecordName>root.example.com.</NextRecordName>
  <NextRecordType>A</NextRecordType>
  <NextRecordIdentifier>weighted-primary</NextRecordIdentifier>
  <MaxItems>300</MaxItems>
</ListResourceRecordSetsResponse>`;

export const publicRecordsSecondPage = `<?xml version="1.0" encoding="UTF-8"?>
<ListResourceRecordSetsResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ResourceRecordSets>
    <ResourceRecordSet>
      <Name>root.example.com.</Name>
      <Type>A</Type>
      <SetIdentifier>weighted-primary</SetIdentifier>
      <AliasTarget>
        <DNSName>dualstack.load-balancer.example.</DNSName>
        <HostedZoneId>ZALIAS1</HostedZoneId>
        <EvaluateTargetHealth>false</EvaluateTargetHealth>
      </AliasTarget>
    </ResourceRecordSet>
  </ResourceRecordSets>
  <IsTruncated>false</IsTruncated>
  <MaxItems>300</MaxItems>
</ListResourceRecordSetsResponse>`;

export const privateZoneRecords = `<?xml version="1.0" encoding="UTF-8"?>
<ListResourceRecordSetsResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ResourceRecordSets>
    <ResourceRecordSet>
      <Name>internal.example.</Name>
      <Type>NS</Type>
      <TTL>300</TTL>
      <ResourceRecords><ResourceRecord><Value>ns-1.internal.example.</Value></ResourceRecord></ResourceRecords>
    </ResourceRecordSet>
  </ResourceRecordSets>
  <IsTruncated>false</IsTruncated>
  <MaxItems>300</MaxItems>
</ListResourceRecordSetsResponse>`;

export const emptyRecords = `<?xml version="1.0" encoding="UTF-8"?>
<ListResourceRecordSetsResponse xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ResourceRecordSets />
  <IsTruncated>false</IsTruncated>
  <MaxItems>300</MaxItems>
</ListResourceRecordSetsResponse>`;

export const malformedXml = '<ListHostedZonesResponse><HostedZones></ListHostedZonesResponse>';
