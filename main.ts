// Entry point for the csv-reader-speed-01 competition on make.fun.
//
// The harness runs `node /bot/main.ts` (Node 22). This driver reads every
// case from /input/cases.json (an array of {id, input}), answers each one
// with run() from ./solve.js, and writes the answers, in the cases'
// order, to /output/answers.json. Outside the sandbox the directories
// can be overridden with MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// Match the house baseline's V8 tuning: incremental marking off, set
// before solve.js is imported so all of its work runs under it.
setFlagsFromString('--no-incremental-marking');

const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const inputDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(inputDir, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

const answers: unknown[] = new Array(cases.length);
for (let i = 0; i < cases.length; i++) answers[i] = run(cases[i].input);
writeFileSync(join(outputDir, 'answers.json'), JSON.stringify(answers));
