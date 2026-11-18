// Open a file in the default app. Arguments go straight to the program, never
// through a shell: on Windows that means explorer.exe, not `cmd /c start`,
// because cmd.exe would run metacharacters (& ^ |) found in the path.
import { execFileSync } from 'node:child_process';
import { isAbsolute, posix, win32 } from 'node:path';

const systemRoot = (env) => env.SystemRoot || env.WINDIR || 'C:\\Windows';
const systemProgram = (name, env) => win32.join(systemRoot(env), 'System32', name);

/**
 * @param {string} platform process.platform
 * @param {string} path file to open
 * @returns {{ command: string, args: string[], ignoreExitCode: boolean }}
 */
export function openCommand(platform, path, env = process.env) {
  if (platform === 'win32') return { command: systemProgram('explorer.exe', env), args: [path], ignoreExitCode: true };
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
export function openPath(path, { platform = process.platform, exec = execFileSync, env = process.env } = {}) {
  // Absolute, so a name like "-n" reaches the program as a path, never an option.
  const absolute = (platform === 'win32' ? win32 : posix).resolve(path);
  const { command, args, ignoreExitCode } = openCommand(platform, absolute, env);
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
  const { command, args, ignoreExitCode } = openCommand(platform, url, env);
  return run(command, args, ignoreExitCode, exec, url);
}

const LAUNCH_FILE = /[\\/]\.serve[\\/]open-[0-9a-f]{16}\.html$/;

/**
 * Open launch's private redirect file (<home>/.serve/open-<id>.html) in the
 * browser. Only that file name, as an absolute path, so the program's argv
 * shows a path and never the pairing code inside. CONCEPT_EXPLAINER_OPENER
 * stands in for the browser, as for openUrl.
 */
export function openLaunchFile(path, { platform = process.platform, exec = execFileSync, env = process.env } = {}) {
  if (!isAbsolute(path) || !LAUNCH_FILE.test(path)) throw new Error(`open: refusing to open "${path}"; only launch's redirect file opens`);
  const custom = env.CONCEPT_EXPLAINER_OPENER;
  if (custom) {
    if (!isAbsolute(custom)) throw new Error('open: CONCEPT_EXPLAINER_OPENER must be an absolute path');
    return run(custom, [path], false, exec, path);
  }
  const { command, args, ignoreExitCode } = openCommand(platform, path, env);
  return run(command, args, ignoreExitCode, exec, path);
}

/**
 * Tell the person something when there is no terminal to print to (the app
 * icon runs `launch` from the desktop). The message travels as an argument or
 * in an environment variable, never inside a script, and a missing tool is
 * not an error: the message is also on stderr.
 * @returns {boolean} true when a dialog or notification was shown
 */
export function notifyUser(message, { platform = process.platform, exec = execFileSync, env = process.env } = {}) {
  const text = String(message).slice(0, 1000);
  const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attempts = {
    darwin: [['/usr/bin/osascript', ['-e', 'on run argv', '-e', 'display alert "Concept Explainer" message (item 1 of argv)', '-e', 'end run', text]]],
    win32: [[win32.join(systemRoot(env), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command',
      'Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show($env:CE_MESSAGE, "Concept Explainer") | Out-Null']]],
  }[platform] || [['notify-send', ['Concept Explainer', escapedText]], ['zenity', ['--error', '--title=Concept Explainer', `--text=${escapedText}`]]];
  for (const [command, args] of attempts) {
    try {
      exec(command, args, { stdio: 'ignore', windowsHide: true, env: { ...env, CE_MESSAGE: text } });
      return true;
    } catch {
      // try the next tool
    }
  }
  return false;
}
