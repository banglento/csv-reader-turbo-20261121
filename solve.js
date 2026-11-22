// csv-reader-turbo: a fast drop-in replacement for csv-reader 1.0.0.
//
// The reference reader walks the text one character at a time and builds
// every field by concatenation. This reader returns exactly the same
// {columns, rows, errors} value, but scans the text in whole segments:
// indexOf hops from one significant character (comma, quote, CR, LF) to
// the next, and a plain field is a single slice of the input. Only fields
// that actually contain something broken (a stray CR, a doubled quote, a
// CR inside quotes) fall back to stitching segment slices together.
//
// Broken-row policy, matched to the reference:
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF; a line with no characters is no record;
//   - a CR outside quotes that is not part of a CRLF is dropped (stray_cr);
//   - a field opening with a quote runs to the next undoubled quote; ""
//     inside it is one quote, and each CRLF or lone CR inside it is read
//     as LF; characters after the closing quote, up to the next comma or
//     line break, are appended as they stand (quote_junk when the field
//     ends and at least one character was appended);
//   - a quote that never closes is a literal character and the text after
//     it is read again as an unquoted field (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - columns is the first record when header is true, else null; rows
//     are padded with "" (short_row, fields: the count it had) or cut
//     (long_row, extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line is the 1-based line the
//     record starts on, counting every LF, CRLF and lone CR inside
//     quotes; row is the record's index in rows, null for the header.

const COMMA_END = 0;
const BREAK_END = 1;
const TEXT_END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;

  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // index of the next character to read
  let line = 1; // 1-based line that character sits on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on, and its index in rows
  // (null while it is the header). Errors report these two.
  let recLine = 1;
  let recRow = null;

  // How the most recently read field ended, and whether it opened quoted.
  let fEnd = TEXT_END;
  let fQuoted = false;

  function fail(code) {
    errors.push({ code, line: recLine, row: recRow });
  }

  // Reads an unquoted field whose already-kept prefix is `prefix` ("" for
  // a plain field, '"' when an unterminated quote is re-read, a quoted
  // value when reading its junk tail). Sets fEnd; returns the field.
  // The scan looks for the next comma first and only checks whether a
  // line break hides before it; a stray CR stitches the segments on
  // either side of it into the value and the scan goes on.
  function readPlain(prefix) {
    let value = prefix;
    let seg = pos;
    let i = pos;
    for (;;) {
      const ic = text.indexOf(',', i);
      const lim = ic === -1 ? n : ic;
      let il = text.indexOf('\n', i);
      if (il === -1 || il > lim) il = -1;
      let ir = text.indexOf('\r', i);
      if (ir === -1 || ir > lim) ir = -1;
      if (il === -1 && ir === -1) {
        if (ic === -1) {
          pos = n;
          fEnd = TEXT_END;
          return value + text.slice(seg, n);
        }
        pos = ic + 1;
        fEnd = COMMA_END;
        return value + text.slice(seg, ic);
      }
      if (ir === -1 || (il !== -1 && il < ir)) {
        pos = il + 1;
        line += 1;
        fEnd = BREAK_END;
        return value + text.slice(seg, il);
      }
      if (text.charCodeAt(ir + 1) === 10) {
        pos = ir + 2;
        line += 1;
        fEnd = BREAK_END;
        return value + text.slice(seg, ir);
      }
      // A stray CR: dropped, with an error, and the scan resumes after it.
      fail('stray_cr');
      value += text.slice(seg, ir);
      seg = ir + 1;
      i = seg;
    }
  }

  // Reads a quoted field; pos is on its opening quote. Sets fEnd.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let i = pos + 1;
    let seg = i; // start of the current untranslated segment
    let parts = null; // translated pieces, once a segment boundary is hit
    for (;;) {
      const iq = text.indexOf('"', i);
      if (iq === -1) {
        // No closing quote exists: the opening quote is a literal
        // character and the rest is read again as an unquoted field.
        pos = open + 1;
        line = openLine;
        fail('unterminated_quote');
        return readPlain('"');
      }
      let il = text.indexOf('\n', i);
      if (il === -1 || il > iq) il = -1;
      let ir = text.indexOf('\r', i);
      if (ir === -1 || ir > iq) ir = -1;
      if (il !== -1 && (ir === -1 || il < ir)) {
        // A bare LF inside quotes: kept as it stands, only counted.
        line += 1;
        i = il + 1;
        continue;
      }
      if (ir !== -1) {
        // A CRLF or a lone CR inside quotes is read as one LF.
        if (parts === null) parts = [];
        parts.push(text.slice(seg, ir), '\n');
        line += 1;
        i = text.charCodeAt(ir + 1) === 10 ? ir + 2 : ir + 1;
        seg = i;
        continue;
      }
      const m = iq;
      // A quote: doubled it is one literal quote, else it closes.
      if (text.charCodeAt(m + 1) === 34) {
        if (parts === null) parts = [];
        parts.push(text.slice(seg, m), '"');
        i = m + 2;
        seg = i;
        continue;
      }
      const value = parts === null ? text.slice(seg, m) : parts.join('') + text.slice(seg, m);
      pos = m + 1;
      if (pos >= n) {
        fEnd = TEXT_END;
        return value;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fEnd = COMMA_END;
        return value;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fEnd = BREAK_END;
        return value;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fEnd = BREAK_END;
        return value;
      }
      // Junk after the closing quote: appended as it stands, and the
      // quote_junk error is raised when the field ends, after any
      // stray_cr errors the junk itself raised.
      const tailed = readPlain(value);
      if (tailed.length > value.length) fail('quote_junk');
      return tailed;
    }
  }

  for (;;) {
    // Lines with no characters at all are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;
    const fields = [];
    do {
      fQuoted = text.charCodeAt(pos) === 34;
      fields.push(fQuoted ? readQuoted() : readPlain(''));
    } while (fEnd === COMMA_END);

    // A line that held nothing but stray CRs leaves a single empty
    // unquoted field behind: it is no record (its errors stay).
    if (fields.length === 1 && fields[0] === '' && !fQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
