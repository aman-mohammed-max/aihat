import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const appDir = path.resolve('src/app');
const sidebarPath = path.resolve('src/components/Sidebar.tsx');
const sidebar = ts.createSourceFile(sidebarPath, readFileSync(sidebarPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function routeFiles(directory = appDir, parents = []) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith('(') && entry.name.endsWith(')') ? null : entry.name;
      found.push(...routeFiles(path.join(directory, entry.name), segment ? [...parents, segment] : parents));
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name) || entry.name.startsWith('_')) continue;
    const basename = entry.name.replace(/\.(tsx?|jsx?)$/, '');
    const segments = basename === 'index' ? parents : [...parents, basename];
    found.push({ route: `/${segments.join('/')}`.replace(/\/$/, '') || '/', file: path.join(directory, entry.name) });
  }
  return found;
}

function stringValue(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
}

function objectProperties(node) {
  return new Map(node.properties
    .filter(ts.isPropertyAssignment)
    .map((property) => [property.name.getText(sidebar).replace(/^['"]|['"]$/g, ''), property.initializer]));
}

const requiredDrawerItems = new Map([
  ['Marketplace', '/market'],
  ['My Models', '/device-models'],
  ['My Skills', '/skills'],
  ['MCP Connections', '/mcp'],
]);
let libraryItems;
const routeCalls = [];

function visit(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'lib' && ts.isArrayLiteralExpression(node.initializer)) {
    libraryItems = node.initializer.elements.filter(ts.isObjectLiteralExpression).map((item) => {
      const properties = objectProperties(item);
      return { label: stringValue(properties.get('label')), path: stringValue(properties.get('path')) };
    });
  }
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) && node.expression.expression.text === 'router' &&
      ['push', 'replace'].includes(node.expression.name.text)) {
    const input = node.arguments[0];
    if (ts.isObjectLiteralExpression(input)) {
      const pathname = objectProperties(input).get('pathname');
      if (stringValue(pathname)) routeCalls.push(stringValue(pathname));
    } else if (input && (ts.isStringLiteral(input) || ts.isNoSubstitutionTemplateLiteral(input) || ts.isTemplateExpression(input))) {
      const raw = input.getText(sidebar).replace(/^['"`]|['"`]$/g, '');
      routeCalls.push(raw.replace(/\$\{[^}]+\}/g, '[id]'));
    }
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'go') {
    const destination = stringValue(node.arguments[0]);
    if (destination) routeCalls.push(destination);
  }
  ts.forEachChild(node, visit);
}
visit(sidebar);

assert.ok(libraryItems, 'Sidebar library navigation list was not found.');
const routeMap = new Map(routeFiles().map(({ route, file }) => [route, file]));
const itemByLabel = new Map(libraryItems.map((item) => [item.label, item.path]));
for (const [label, expectedPath] of requiredDrawerItems) {
  assert.equal(itemByLabel.get(label), expectedPath, `Sidebar must link ${label} to ${expectedPath}.`);
}
assert.ok(routeCalls.includes('/settings'), 'Sidebar must link to Settings.');
assert.ok(routeCalls.includes('/'), 'Sidebar must return to the Chat route.');

const sidebarPaths = [...libraryItems.map((item) => item.path), ...routeCalls];
for (const route of sidebarPaths) {
  assert.ok(routeMap.has(route), `Sidebar route ${route} has no Expo Router screen under src/app.`);
}

console.log(`Sidebar navigation targets resolve to ${new Set(sidebarPaths).size} Expo Router screens.`);
