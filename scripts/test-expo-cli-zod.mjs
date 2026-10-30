import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const appRequire = createRequire(import.meta.url);
const expoRoot = resolve(dirname(appRequire.resolve('expo')), '..');
const cliServer = resolve(expoRoot, 'node_modules/@expo/cli/build/src/start/server');
const cliRequire = createRequire(resolve(cliServer, '__aihat_zod_compat_test__.cjs'));
const { PluginSchema } = cliRequire(resolve(cliServer, 'DevToolsPlugin.schema.js'));
const { createMCPDevToolsExtensionSchema } = cliRequire(resolve(cliServer, 'createMCPDevToolsExtensionSchema.js'));

const plugin = PluginSchema.parse({
  packageName: '@example/devtools-plugin',
  packageRoot: '/tmp/devtools-plugin',
  cliExtensions: {
    description: 'Example plugin',
    entryPoint: 'index.js',
    commands: [{
      name: 'search',
      title: 'Search',
      environments: ['cli', 'mcp'],
      parameters: [{ name: 'query', type: 'text' }],
    }],
  },
});

const schema = createMCPDevToolsExtensionSchema(plugin);
assert.equal(schema.safeParse({ command: 'search', query: 'local models' }).success, true);
assert.equal(schema.safeParse({ command: 'unknown', query: 'local models' }).success, false);
assert.equal(schema.safeParse({ command: 'search', unexpected: true }).success, false);

console.log('Expo CLI DevTools schemas are compatible with the patched Zod resolution.');
