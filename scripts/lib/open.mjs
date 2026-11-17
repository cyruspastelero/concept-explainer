// Open a file in the default app. Arguments go straight to the program, never
// through a shell: on Windows that means explorer.exe, not `cmd /c start`,
// because cmd.exe would run metacharacters (& ^ |) found in the path.
import { execFileSync } from 'node:child_process';
import { isAbsolute, posix, win32 } from 'node:path';

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
function run(command, args, ignoreExitCode, exec, label) {
  try {
    exec(command, args, { stdio: 'ignore' });
  } catch (error) {
    // explorer.exe exits with 1 even when it opened the file.
    if (ignoreExitCode && typeof error.status === 'number') return;
    throw new Error(`open ${label} with ${command}: ${error.message}`);
  }
}

/**
 * @param {string} path
 * @param {{ platform?: string, exec?: typeof execFileSync }} [options]
 */
export function openPath(path, { platform = process.platform, exec = execFileSync } = {}) {
  // Absolute, so a name like "-n" reaches the program as a path, never an option.
  const absolute = (platform === 'win32' ? win32 : posix).resolve(path);
  const { command, args, ignoreExitCode } = openCommand(platform, absolute);
  run(command, args, ignoreExitCode, exec, path);
}

const LOCAL_URL = /^http:\/\/127\.0\.0\.1:\d{1,5}\/[^\s]*$/;

/**
 * Open the local library in the browser. Only http://127.0.0.1:<port>/ URLs.
 * CONCEPT_EXPLAINER_OPENER, when set, must be an absolute path to a program
 * that gets the URL as its one argument (tests use it to stand in for a browser).
 */
export function openUrl(url, { platform = process.platform, exec = execFileSync, env = process.env } = {}) {
  if (!LOCAL_URL.test(url)) throw new Error(`open: refusing to open "${url}"; only the local library opens`);
  const custom = env.CONCEPT_EXPLAINER_OPENER;
  if (custom) {
    if (!isAbsolute(custom)) throw new Error('open: CONCEPT_EXPLAINER_OPENER must be an absolute path');
    return run(custom, [url], false, exec, url);
  }
  const { command, args, ignoreExitCode } = openCommand(platform, url);
  return run(command, args, ignoreExitCode, exec, url);
}
