// The one way this project runs git. The repo being explained is untrusted:
// its own .git/config can name programs git would run (fsmonitor, external
// diff, textconv, pager, hooks, gpg for signatures, ssh, credential helpers).
// Every call turns them off, ignores system config, never prompts, never
// reaches the network, and runs with an argument array (no shell).
import { execFileSync } from 'node:child_process';

const HARDENING = [
  'core.fsmonitor=false', 'diff.external=', 'core.pager=cat', 'core.hooksPath=/dev/null',
  'log.showSignature=false', 'gpg.program=false', 'gpg.ssh.program=false', 'gpg.x509.program=false',
  'core.sshCommand=false', 'credential.helper=', 'protocol.allow=never',
].flatMap((setting) => ['-c', setting]);

const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv'];
const LOG_FLAGS = [...DIFF_FLAGS, '--no-show-signature'];

export const GIT_ENV = Object.freeze({
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
});

/** The full argument list for one git call in `repo`. */
export function gitArgs(repo, args) {
  const [command, ...rest] = args;
  const extra = command === 'log' ? LOG_FLAGS : command === 'diff' ? DIFF_FLAGS : [];
  return [...HARDENING, '-C', repo, command, ...extra, ...rest];
}

/** Run git in `repo` and return stdout. Errors name the git command. */
export function git(repo, args) {
  try {
    return execFileSync('git', gitArgs(repo, args), {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, ...GIT_ENV },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`git ${args[0]} failed in ${repo}: ${error.stderr || error.message}`);
  }
}
