import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const entry = resolve(process.env.GSC_TEST_ENTRY || 'build/index.js');
const { version } = createRequire(entry)('../package.json');
const mock = fileURLToPath(new URL('./google-api-mock.cjs', import.meta.url));

for (const auth of ['adc', 'service-account']) {
  test(`packaged MCP server authenticates with ${auth}`, { timeout: 15000 }, async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gsc-auth-test-'));
    const adcFile = join(dir, 'adc.json');
    const keyFile = join(dir, 'service-account.json');
    await writeFile(adcFile, JSON.stringify({
      type: 'authorized_user', client_id: 'fake-client', client_secret: 'fake-secret',
      refresh_token: 'fake-refresh-token', quota_project_id: 'test-quota-project',
    }));
    const { privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    await writeFile(keyFile, JSON.stringify({
      type: 'service_account', project_id: 'test-project', private_key: privateKey,
      client_email: 'test@example.iam.gserviceaccount.com',
    }));

    const transport = new StdioClientTransport({
      command: process.execPath, args: ['--require', mock, entry], stderr: 'pipe',
      env: {
        GOOGLE_APPLICATION_CREDENTIALS: auth === 'service-account' ? keyFile : '',
        google_application_credentials: '', GOOGLE_CLOUD_PROJECT: 'test-project',
        GSC_TEST_ENTRY: entry, GSC_TEST_AUTH: auth, GSC_TEST_ADC_FILE: adcFile,
      },
    });
    const client = new Client({ name: 'gsc-auth-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      assert.equal(client.getServerVersion().version, version);
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map(t => t.name).sort(), ['inspect_url', 'list_sitemaps', 'list_sites', 'search_analytics']);
      const result = await client.callTool({ name: 'list_sites', arguments: {} });
      assert.equal(result.content[0].text, 'Sites:\nsc-domain:example.com (siteRestrictedUser)');
    } finally {
      await client.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
}
