/** What the desktop app's backend reports about itself. Only call this when `isDesktop` (lib/device) is true. */
export type DesktopInfo = {
  platform: 'darwin' | 'win32' | 'linux';
  arch: string;
  version: string;
  /** Where keys are kept: the system keychain, or (a Linux desktop without a keyring) a file only you can read. */
  keyStore: 'keychain' | 'file';
  dataDir: string;
  downloads: string;
};

let info: Promise<DesktopInfo> | null = null;

export function desktopInfo() {
  info ??= fetch('/api/info').then((r) => r.json() as Promise<DesktopInfo>);
  return info;
}

/** The name people use for this computer's system, for sentences like "Saved to Downloads". */
export const systemName = (p: DesktopInfo['platform']) => (p === 'darwin' ? 'macOS' : p === 'win32' ? 'Windows' : 'Linux');
