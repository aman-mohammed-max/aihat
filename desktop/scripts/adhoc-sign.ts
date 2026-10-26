/**
 * macOS build hook (postWrap): seal the app people open from the DMG with an ad-hoc signature, so a downloaded copy
 * gets macOS's "can't verify the developer" prompt (Open Anyway) instead of being reported as damaged. Real signing
 * (Developer ID and notarization) needs a paid Apple developer account. A signing problem never stops the build.
 */
const bundle = process.env.ELECTROBUN_WRAPPER_BUNDLE_PATH;
if (process.platform === 'darwin' && bundle) {
  const r = Bun.spawnSync(['codesign', '--force', '--deep', '--sign', '-', bundle], { stdout: 'inherit', stderr: 'inherit' });
  console.log(r.exitCode === 0 ? `ad-hoc signed ${bundle}` : `warning: ad-hoc signing failed (exit ${r.exitCode}); the app is left unsigned`);
}
