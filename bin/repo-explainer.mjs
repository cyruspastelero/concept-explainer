#!/usr/bin/env node
// Old name, kept so existing scripts keep working. Prefer concept-explainer.
import { runCli } from '../scripts/lib/cli/main.mjs';

process.stderr.write('note: repo-explainer is now concept-explainer. This alias still works but will be removed in a later release.\n');
runCli(process.argv.slice(2));
