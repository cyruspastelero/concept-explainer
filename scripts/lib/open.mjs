// Open a file in the default app. Arguments go straight to the program, never
// through a shell: on Windows that means explorer.exe, not `cmd /c start`,
// because cmd.exe would run metacharacters (& ^ |) found in the path.
import { execFileSync } from 'node:child_process';
import { posix, win32 } from 'node:path';

/**
 * @param {string} platform process.platform
 * @param {string} path file to open
 * @returns {{ command: string, args: string[], ignoreExitCode: boolean }}
 */
export function openCommand(platform, path) {
  if (platform === 'win32') return { command: 'explorer.exe', args: [path], ignoreExitCode: true };
  return { command: platform === 'darwin' ? 'open' : 'xdg-open', args: [path], ignoreExitCode: false };
}

/**
 * @param {string} path
 * @param {{ platform?: string, exec?: typeof execFileSync }} [options]
 */
export function openPath(path, { platform = process.platform, exec = execFileSync } = {}) {
  // Absolute, so a name like "-n" reaches the program as a path, never an option.
  const absolute = (platform === 'win32' ? win32 : posix).resolve(path);
  const { command, args, ignoreExitCode } = openCommand(platform, absolute);
  try {
    exec(command, args, { stdio: 'ignore' });
  } catch (error) {
    // explorer.exe exits with 1 even when it opened the file.
    if (ignoreExitCode && typeof error.status === 'number') return;
    throw new Error(`open ${path} with ${command}: ${error.message}`);
  }
}
