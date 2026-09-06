#!/usr/bin/env node
/**
 * Creates a local .env from .env.example on first install so the app has a
 * place to put GROQ_API_KEY without committing secrets.
 */
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const example = resolve(root, '.env.example');
const dest = resolve(root, '.env');

if (existsSync(dest)) {
  console.log('CRO Agent: .env already exists');
  process.exit(0);
}

if (!existsSync(example)) {
  console.warn('CRO Agent: .env.example is missing; skipped creating .env');
  process.exit(0);
}

copyFileSync(example, dest);
console.log('CRO Agent: created .env from .env.example — add your GROQ_API_KEY from https://console.groq.com/keys');
