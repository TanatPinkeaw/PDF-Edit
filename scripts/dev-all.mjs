#!/usr/bin/env node
// Runs the Vite dev server and the API together without adding a dependency.
import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const pnpm = isWindows ? 'pnpm.cmd' : 'pnpm';
const children = [];
let shuttingDown = false;

function run(script, args) {
  const child = spawn(pnpm, [script, ...args], {
    stdio: 'inherit',
    shell: isWindows,
    env: process.env,
  });
  children.push(child);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    console.error(`\n[dev:all] "${script}" ออกด้วยรหัส ${code ?? 0} — ปิดทั้งสองโปรเซส`);
    shutdown(code ?? 1);
  });
  return child;
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

run('dev:api', []);
run('dev', []);
