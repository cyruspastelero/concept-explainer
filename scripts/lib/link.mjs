// Point a folder link at a new target without a moment where it is missing
// or half made. The link is made under a temp name, then renamed into place.
// Windows gets a junction (no admin rights or Developer Mode needed); other
// systems ignore the type and make a plain symlink.
import { lstatSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const lstatOrNull = (path) => {
  try {
    return lstatSync(path);
  } catch {
    return null;
  }
};
const sibling = (target, tag) => `${target}.${tag}-${process.pid}-${randomBytes(4).toString('hex')}`;

/**
 * Link `target` to the folder `source` (absolute), replacing a link already there.
 * POSIX renames over the old link in one step. Where rename cannot replace a
 * folder link (Windows), the old link is moved aside first and removed only
 * once the new one is in; if the new one cannot go in, the old one goes back.
 * @param {string} source
 * @param {string} target
 * @param {{ rename?: typeof renameSync, removeLink?: (path: string) => void }} [io] for tests
 */
export function linkDir(source, target, { rename = renameSync, removeLink = (path) => rmSync(path) } = {}) {
  const temp = sibling(target, 'new');
  symlinkSync(source, temp, 'junction');
  try {
    rename(temp, target);
    return;
  } catch (error) {
    if (!['EPERM', 'EEXIST', 'ENOTEMPTY', 'EISDIR'].includes(error.code) || !lstatOrNull(target)) {
      removeLink(temp);
      throw new Error(`link ${target}: ${error.message}`);
    }
  }
  const aside = sibling(target, 'old');
  rename(target, aside);
  try {
    rename(temp, target);
  } catch (error) {
    rename(aside, target);
    removeLink(temp);
    throw new Error(`link ${target}: ${error.message}`);
  }
  removeLink(aside);
}
