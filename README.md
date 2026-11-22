# csv-reader-turbo

An entry for the make.fun competition **csv-reader-speed-01-run-20261121**
("Read broken CSV files faster", prize pool **$100**, 10 places of $10).

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/banglento/csv-reader-turbo-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/banglento/csv-reader-turbo-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Competition page: https://make.fun

## What it does

`solve.js` is a dependency-free ES module whose `run(input)` returns, for
an input `{text, header}`, exactly the value csv-reader 1.0.0 returns:
`{columns, rows, errors}`, with the reference's broken-row semantics —
BOM dropped, records ending at LF or CRLF, blank lines skipped, stray CRs
dropped (`stray_cr`), doubled quotes and CR/CRLF-as-LF inside quoted
fields, junk after a closing quote appended (`quote_junk`), a quote that
never closes re-read as a literal character (`unterminated_quote`), and
rows padded (`short_row`) or cut (`long_row`) to the first record's
width, every error carrying the record's starting line and its index in
`rows` (null for the header).

`main.ts` (Node 22, standard library only) is the driver the harness
runs: it reads every case from `/input/cases.json`, answers each with
`run`, and writes `/output/answers.json`.

## Approach

The reference reader walks the text one character at a time and builds
each field by concatenation. This reader scans in whole segments
instead:

- `indexOf` hops from one significant character to the next. An unquoted
  field is found by locating its comma first and checking that no line
  break hides before it, so a plain field costs one native scan and a
  single `slice` — no per-character loop, no regular expressions.
- Inside a quoted field the scan looks for the next quote first; a bare
  LF before it is only counted, and segment stitching (an array join)
  happens only when a doubled quote or a CR actually forces a boundary.
- The broken paths stay exact but rare: a stray CR stitches the segments
  around it, junk after a closing quote reuses the unquoted reader, and
  an unterminated quote restarts its field as unquoted text, exactly as
  the reference does.

## Benchmarks

Measured locally on the kit's practice set (6 cases, ~10.5 MB of CSV in
total), CPU time per full pass over the set, baseline and this entry
timed interleaved in the same process over 9 rounds:

| reader | median | best |
| --- | --- | --- |
| house baseline (csv-reader 1.0.0) | 616.5 ms | 374.5 ms |
| csv-reader-turbo | 237.7 ms | 174.3 ms |

That is about **2.6× faster** than the house baseline on the median
round. Correctness: the practice answers are byte-identical to the
kit's reference outputs on all 6 cases, and a differential fuzz run of
64,132 adversarial inputs against the reference reader produced no
mismatches.

## Layout

- `main.ts` — the harness driver (`/input/cases.json` → `/output/answers.json`)
- `solve.js` — the reader itself, `run(input)` → `{columns, rows, errors}`
- `.makefun/owner.json` — the entrant claim file

## License

MIT — see `LICENSE`.
