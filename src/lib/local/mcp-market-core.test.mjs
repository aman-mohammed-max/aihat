import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMcpConnection, normalizeMcpRegistryEntry, planMcp } from './mcp-market-core.mjs';

const listing = (remote) => ({
  id: 'example/server',
  title: 'Example server',
  description: '',
  version: '',
  publisher: 'example.com',
  remote: { type: 'streamable-http', url: 'https://mcp.example.com/mcp', headers: [], variables: {}, ...remote },
});

test('normalizes only well-formed marketplace metadata and known MCP transports', () => {
  const normalized = normalizeMcpRegistryEntry({ server: {
    name: 'com.example/search',
    title: 'Search',
    description: '  A search server.  ',
    version: '1.2.3',
    remotes: [{ type: 'streamable-http', url: 'https://mcp.example.com/mcp', headers: [], variables: {} }],
  } });
  assert.equal(normalized.title, 'Search');
  assert.equal(normalized.publisher, 'example.com');
  assert.equal(normalized.description, 'A search server.');
  assert.equal(normalized.remote.type, 'streamable-http');
  assert.equal(normalizeMcpRegistryEntry({ server: { name: 42, remotes: [] } }), null);
  assert.equal(normalizeMcpRegistryEntry({ server: { name: 'com.example/x', remotes: [{ type: 'command', url: 'https://mcp.example.com' }] } }).remote, undefined);
});

test('rejects malformed registry header and variable structures without throwing', () => {
  const malformedHeaders = normalizeMcpRegistryEntry({ server: {
    name: 'com.example/search',
    remotes: [{ type: 'streamable-http', url: 'https://mcp.example.com/mcp', headers: 'Authorization', variables: {} }],
  } });
  assert.equal(malformedHeaders.remote, undefined);

  const malformedVariables = normalizeMcpRegistryEntry({ server: {
    name: 'com.example/search',
    remotes: [{ type: 'streamable-http', url: 'https://mcp.example.com/{tenant}', headers: [], variables: ['secret'] }],
  } });
  assert.equal(malformedVariables.remote, undefined);
});

test('refuses secrets in URL variables and credential-like query parameters', () => {
  const secretVariable = listing({
    url: 'https://mcp.example.com/{tenant}',
    variables: { tenant: { isSecret: true } },
  });
  assert.match(planMcp(secretVariable).reason, /secure keystore/);

  const credentialName = listing({
    url: 'https://mcp.example.com/{api_key}',
    variables: { api_key: { isSecret: false } },
  });
  assert.match(planMcp(credentialName).reason, /secure keystore/);

  const credentialQuery = listing({ url: 'https://mcp.example.com/mcp?access_token=public-value' });
  assert.match(planMcp(credentialQuery).reason, /key or password/);
});

test('escapes nonsecret URL variables and enforces required values', () => {
  const entry = listing({
    url: 'https://mcp.example.com/{tenant}/mcp',
    variables: { tenant: { description: 'Workspace name', isRequired: true } },
  });
  const plan = planMcp(entry);
  assert.equal(plan.supported, true);
  assert.throws(() => buildMcpConnection(entry, plan, {}), /required/);
  const connection = buildMcpConnection(entry, plan, { tenant: 'team/east' });
  assert.equal(connection.url, 'https://mcp.example.com/team%2Feast/mcp');
  assert.equal(connection.token, undefined);
});

test('keeps authentication values in the token field and always marks them secret', () => {
  const entry = listing({
    headers: [{
      name: 'Authorization',
      isRequired: true,
      isSecret: false,
      value: 'Bearer {access_token}',
      variables: { access_token: { isRequired: true, isSecret: false, description: 'Paste token' } },
    }],
  });
  const plan = planMcp(entry);
  assert.equal(plan.supported, true);
  assert.equal(plan.fields[0].secret, true);
  assert.equal(plan.fields[0].required, true);
  const connection = buildMcpConnection(entry, plan, { '@token': 'secret-value' });
  assert.equal(connection.url, 'https://mcp.example.com/mcp');
  assert.equal(connection.headerName, 'Authorization');
  assert.equal(connection.headerTemplate, 'Bearer {token}');
  assert.equal(connection.token, 'secret-value');
});

test('rejects invalid or reserved authentication headers and unsafe templates', () => {
  for (const name of ['Content-Type', 'Mcp-Session-Id', 'Bad\r\nAuthorization']) {
    const entry = listing({ headers: [{ name, isRequired: true, value: '{token}' }] });
    assert.equal(planMcp(entry).supported, false, name);
  }
  const injected = listing({ headers: [{ name: 'Authorization', isRequired: true, value: 'Bearer {token}\r\nX-Leak: yes' }] });
  assert.equal(planMcp(injected).supported, false);
});

test('rejects header templates without exactly one variable', () => {
  const missing = listing({ headers: [{ name: 'Authorization', isRequired: true, value: 'Bearer public-value' }] });
  assert.equal(planMcp(missing).supported, false);
  const repeated = listing({ headers: [{ name: 'Authorization', isRequired: true, value: '{token}-{token}' }] });
  assert.equal(planMcp(repeated).supported, false);
});
