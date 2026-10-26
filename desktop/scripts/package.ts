/**
 * Turns the Electrobun build into the files people download (run after `electrobun build`, from desktop/):
 *
 *   bun scripts/package.ts exe <unzipped Windows Setup folder> <out.exe>
 *     One self-contained Setup .exe. Electrobun ships Setup.exe with its archive in a .installer folder beside it
 *     (so it has to be zipped); its extractor also reads the archive from the end of its own file, the way the
 *     Linux installer works, so the archive is appended to the exe instead.
 *
 *   bun scripts/package.ts deb <app .tar.zst from artifacts/> <x64|arm64> <out.deb>
 *     A Debian/Ubuntu package: the app in /opt/ai-hat, an app-menu entry, icons and an `ai-hat` command.
 */
import { chmodSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import app from '../../app.json';

const root = join(import.meta.dir, '..');
const METADATA = Buffer.from('ELECTROBUN_METADATA_V1');
const ARCHIVE = Buffer.from('ELECTROBUN_ARCHIVE_V1');

function run(cmd: string[]) {
  const r = Bun.spawnSync(cmd, { stdout: 'inherit', stderr: 'inherit' });
  if (r.exitCode !== 0) throw new Error(`${cmd[0]} failed (exit ${r.exitCode})`);
}

function only(dir: string, test: (name: string) => boolean, what: string) {
  const found = readdirSync(dir).filter(test);
  if (found.length !== 1) throw new Error(`expected one ${what} in ${dir}, found ${found.length}`);
  return join(dir, found[0]);
}

function exe(setupDir: string, out: string) {
  const setup = only(setupDir, (n) => n.endsWith('.exe'), 'Setup .exe');
  const meta = JSON.parse(readFileSync(only(join(setupDir, '.installer'), (n) => n.endsWith('.metadata.json'), 'metadata file'), 'utf8'));
  const archive = readFileSync(only(join(setupDir, '.installer'), (n) => n.endsWith('.tar.zst'), 'app archive'));
  const file = Buffer.concat([readFileSync(setup), METADATA, Buffer.from(JSON.stringify(meta)), ARCHIVE, archive]);

  // Find the archive the way the extractor does: the second metadata marker (the first is the extractor's own
  // copy of the string), then the archive marker after it.
  const first = file.indexOf(METADATA);
  const second = file.indexOf(METADATA, first + METADATA.length);
  const archiveAt = file.indexOf(ARCHIVE, second + METADATA.length);
  if (first < 0 || second < 0 || archiveAt < 0) throw new Error('the markers are not where the extractor looks');
  JSON.parse(file.subarray(second + METADATA.length, archiveAt).toString('utf8'));
  if (!file.subarray(archiveAt + ARCHIVE.length).equals(archive)) throw new Error('the archive would not be found intact');

  writeFileSync(out, file);
  console.log(`${out}: ${(file.length / 1024 / 1024).toFixed(1)} MB (${meta.name} ${meta.channel}, ${meta.hash})`);
}

function deb(tarZst: string, arch: string, out: string) {
  const debArch = { x64: 'amd64', arm64: 'arm64' }[arch];
  if (!debArch) throw new Error(`unknown architecture ${arch}`);
  const work = join(tmpdir(), `aihat-deb-${process.pid}`);
  const pkg = join(work, 'pkg');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'app'), { recursive: true });

  writeFileSync(join(work, 'app.tar'), Bun.zstdDecompressSync(readFileSync(tarZst)));
  run(['tar', '-xf', join(work, 'app.tar'), '-C', join(work, 'app')]);
  const bundle = join(work, 'app', readdirSync(join(work, 'app'))[0]);
  const opt = join(pkg, 'opt/ai-hat');
  cpSync(bundle, opt, { recursive: true, verbatimSymlinks: true });
  rmSync(join(opt, `${app.expo.name}.desktop`), { force: true });

  mkdirSync(join(pkg, 'usr/bin'), { recursive: true });
  writeFileSync(join(pkg, 'usr/bin/ai-hat'), '#!/bin/sh\nexec /opt/ai-hat/bin/launcher "$@"\n');
  chmodSync(join(pkg, 'usr/bin/ai-hat'), 0o755);

  mkdirSync(join(pkg, 'usr/share/applications'), { recursive: true });
  writeFileSync(
    join(pkg, 'usr/share/applications/ai-hat.desktop'),
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${app.expo.name}`,
      'Comment=A chat app for any OpenAI-compatible endpoint.',
      'Exec=/opt/ai-hat/bin/launcher',
      'Icon=ai-hat',
      'Terminal=false',
      `StartupWMClass=${app.expo.name}`,
      'Categories=Utility;Network;Chat;',
      '',
    ].join('\n'),
  );
  for (const [size, file] of [['512x512', 'icons/icon.png'], ['256x256', 'icons/icon-256.png']]) {
    mkdirSync(join(pkg, `usr/share/icons/hicolor/${size}/apps`), { recursive: true });
    cpSync(join(root, file), join(pkg, `usr/share/icons/hicolor/${size}/apps/ai-hat.png`));
  }

  const kib = Math.ceil(size(join(pkg, 'opt')) / 1024);
  mkdirSync(join(pkg, 'DEBIAN'), { recursive: true });
  writeFileSync(
    join(pkg, 'DEBIAN/control'),
    [
      'Package: ai-hat',
      `Version: ${app.expo.version}`,
      `Architecture: ${debArch}`,
      'Maintainer: Aman Mohammed <https://connect.amanm.space>',
      `Installed-Size: ${kib}`,
      // The system web view (WebKitGTK), GTK and the tray library the Electrobun window links against.
      'Depends: libwebkit2gtk-4.1-0, libgtk-3-0t64 | libgtk-3-0, libayatana-appindicator3-1',
      'Section: net',
      'Priority: optional',
      'Homepage: https://github.com/aman-mohammed-max/aihat',
      'Description: Chat app for any OpenAI-compatible endpoint',
      ' AI Hat talks to any OpenAI-compatible AI server you add. Your keys stay in',
      " your desktop's keyring.",
      '',
    ].join('\n'),
  );
  run(['dpkg-deb', '--root-owner-group', '--build', pkg, out]);
  rmSync(work, { recursive: true, force: true });
  console.log(`${out}: ${(statSync(out).size / 1024 / 1024).toFixed(1)} MB`);
}

function size(path: string): number {
  const s = statSync(path);
  return s.isDirectory() ? readdirSync(path).reduce((n, f) => n + size(join(path, f)), 0) : s.size;
}

const [kind, ...args] = process.argv.slice(2);
if (kind === 'exe' && args.length === 2) exe(args[0], args[1]);
else if (kind === 'deb' && args.length === 3) deb(args[0], args[1], args[2]);
else {
  console.error('usage: bun scripts/package.ts exe <setup folder> <out.exe> | deb <app.tar.zst> <x64|arm64> <out.deb>');
  process.exit(1);
}
