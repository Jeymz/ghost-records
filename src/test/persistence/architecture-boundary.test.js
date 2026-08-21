import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(process.cwd(), 'src');
const persistenceRoot = path.join(sourceRoot, 'persistence');

async function collectJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectJavaScriptFiles(entryPath);
      }

      return entry.name.endsWith('.js') ? [entryPath] : [];
    }),
  );

  return nestedFiles.flat();
}

describe('persistence architecture boundary', () => {
  it('keeps persistence access inside Sequelize without direct SQL or driver imports', async () => {
    const sourceFiles = await collectJavaScriptFiles(persistenceRoot);
    const contents = await Promise.all(sourceFiles.map((filePath) => readFile(filePath, 'utf8')));

    for (const content of contents) {
      expect(content).not.toMatch(/\.query\s*\(/u);
      expect(content).not.toMatch(/from ['"]mysql2['"]/u);
      expect(content).not.toMatch(/require\(['"]mysql2['"]\)/u);
    }
  });

  it('prevents direct UUID imports from bypassing the active advisory mitigation', async () => {
    const sourceFiles = await collectJavaScriptFiles(sourceRoot);

    for (const filePath of sourceFiles) {
      if (filePath.endsWith(path.join('security', 'uuid-advisory-mitigation.js'))) {
        continue;
      }

      const content = await readFile(filePath, 'utf8');
      expect(content).not.toMatch(/from ['"]uuid['"]/u);
      expect(content).not.toMatch(/require\(['"]uuid['"]\)/u);
    }
  });

  it('keeps the Route 53 adapter direct, read-only, and fixed-endpoint', async () => {
    const route53Root = path.join(sourceRoot, 'adapters', 'route53');
    const route53Files = await collectJavaScriptFiles(route53Root);
    const contents = await Promise.all(route53Files.map((filePath) => readFile(filePath, 'utf8')));

    for (const content of contents) {
      expect(content).not.toMatch(/from ['"]@aws-sdk\//u);
      expect(content).not.toMatch(/require\(['"]@aws-sdk\//u);
      expect(content).not.toMatch(/ChangeResourceRecordSets|CreateHostedZone|DeleteHostedZone|UpdateHostedZoneComment/u);
    }

    const signer = await readFile(path.join(route53Root, 'sigv4.js'), 'utf8');
    expect(signer).toContain("export const ROUTE53_ENDPOINT = 'https://route53.amazonaws.com'");
  });

  it('keeps AWS ownership evidence direct, read-only, and fixed-scope', async () => {
    const awsRoot = path.join(sourceRoot, 'adapters', 'aws');
    const ec2Root = path.join(sourceRoot, 'adapters', 'ec2');
    const awsFiles = [
      ...(await collectJavaScriptFiles(awsRoot)),
      ...(await collectJavaScriptFiles(ec2Root)),
    ];

    for (const filePath of awsFiles) {
      const content = await readFile(filePath, 'utf8');
      expect(content).not.toMatch(/from ['"]@aws-sdk\//u);
      expect(content).not.toMatch(/require\(['"]@aws-sdk\//u);
      expect(content).not.toMatch(/(?:AllocateAddress|ReleaseAddress|AssociateAddress|DisassociateAddress|AssumeRole|DescribeRegions)/u);
      expect(content).not.toMatch(/(?:AWS_CONTAINER_CREDENTIALS|AWS_WEB_IDENTITY_TOKEN_FILE|169\.254\.169\.254)/u);
    }

    const client = await readFile(path.join(awsRoot, 'client.js'), 'utf8');
    expect(client).toContain("export const STS_ENDPOINT = 'https://sts.amazonaws.com'");
    expect(client).toContain('https://ec2.${assertRegion(region)}.amazonaws.com');
  });

  it('keeps DNS evidence collection DNS-only without HTTP, TLS, socket, or process execution paths', async () => {
    const dnsRoot = path.join(sourceRoot, 'dns');
    const dnsFiles = await collectJavaScriptFiles(dnsRoot);

    for (const filePath of dnsFiles) {
      const content = await readFile(filePath, 'utf8');
      expect(content).not.toMatch(/from ['"]node:(?:http|https|tls|child_process|dgram)['"]/u);
      expect(content).not.toMatch(/\b(?:fetch|WebSocket|net\.connect|exec|spawn)\s*\(/u);
    }

    const resolver = await readFile(path.join(dnsRoot, 'resolver.js'), 'utf8');
    expect(resolver).toContain("from 'node:dns/promises'");
  });

  it('keeps process.env access inside the central configuration module', async () => {
    const sourceFiles = await collectJavaScriptFiles(sourceRoot);

    for (const filePath of sourceFiles) {
      if (
        filePath.includes(`${path.sep}test${path.sep}`) ||
        filePath.endsWith(path.join('config', 'load-configuration.js'))
      ) {
        continue;
      }

      const content = await readFile(filePath, 'utf8');
      expect(content).not.toContain('process.env');
    }
  });
});
