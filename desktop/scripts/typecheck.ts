/**
 * Type-check the desktop code. Electrobun ships TypeScript sources rather than declaration files (in .hutch/devkit,
 * made by `bunx electrobun sync`), so tsc also checks the library itself, which has errors of its own under strict
 * settings; only errors in this project's files count.
 */
const tsc = Bun.spawnSync(['bunx', 'tsc', '-p', 'tsconfig.json'], { cwd: `${import.meta.dir}/..`, stdout: 'pipe', stderr: 'pipe' });
const lines = `${tsc.stdout}${tsc.stderr}`.split('\n');
const ours: string[] = [];
let keep = false;
for (const line of lines) {
  if (/^\S.*\(\d+,\d+\): error/.test(line)) keep = !/^(node_modules|\.hutch)\//.test(line);
  else if (!line.startsWith(' ')) keep = false;
  if (keep) ours.push(line);
}
if (ours.length) {
  console.error(ours.join('\n'));
  process.exit(1);
}
console.log('desktop: no type errors');
