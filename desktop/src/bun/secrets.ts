import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SERVICE = 'AI Hat';

export type KeyStore = 'keychain' | 'file';

/**
 * API keys and sign-in tokens. They live in the OS keychain (macOS Keychain, Windows Credential Manager, the Secret
 * Service on Linux) through Bun.secrets, never in the database or in backups. A Linux desktop with no keyring
 * running falls back to a file only this user can read, and Privacy & API keys says so.
 */
export async function openSecrets(dataDir: string, forceFile = false) {
  const file = join(dataDir, 'keys.json');
  const readFile = (): Record<string, string> => {
    try {
      return JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return {};
    }
  };
  const writeFile = (all: Record<string, string>) => {
    writeFileSync(file, JSON.stringify(all), { mode: 0o600 });
    try {
      chmodSync(file, 0o600);
    } catch {
      /* Windows has no Unix permissions, and always has the Credential Manager anyway */
    }
  };

  let store: KeyStore = 'file';
  if (!forceFile) {
    try {
      await Bun.secrets.get({ service: SERVICE, name: 'aihat.probe' });
      store = 'keychain';
    } catch {
      store = 'file';
    }
  }

  // A keyring that appeared since last time takes over the keys from the file.
  if (store === 'keychain' && existsSync(file)) {
    for (const [name, value] of Object.entries(readFile())) await Bun.secrets.set({ service: SERVICE, name, value });
    rmSync(file, { force: true });
  }

  return {
    store,
    async get(name: string): Promise<string | null> {
      if (store === 'keychain') return (await Bun.secrets.get({ service: SERVICE, name })) ?? null;
      return readFile()[name] ?? null;
    },
    async set(name: string, value: string) {
      if (store === 'keychain') return void (await Bun.secrets.set({ service: SERVICE, name, value }));
      const all = readFile();
      all[name] = value;
      writeFile(all);
    },
    async delete(name: string) {
      if (store === 'keychain') return void (await Bun.secrets.delete({ service: SERVICE, name }));
      const all = readFile();
      delete all[name];
      writeFile(all);
    },
  };
}
