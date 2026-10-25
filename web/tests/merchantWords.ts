/**
 * What a merchant's box is to show, read from the same visit with the Dialog setting's Log (tests of merchantSpeech.ts):
 * the words Log printed within quotation marks - each mark read by what is either side of it, as the box reads it (at
 * a word's start it opens, after a letter or a stop it closes; one that closes with none opened closes the merchant's
 * words before it, their opening mark left out by 1988) - with the marks 1988 left out of three of them given them,
 * and the lists picked from by letter left out.
 */
export function boxedWords(log: string): string {
  const fixed = log
    .replace(/(These stout-|Skiffs allow)/g, '"$1')
    .replace(/^Sold!$/gm, '"Sold!"')
    .replace(/(Thy friends? will\s*not\s*leave\s*thee!)/g, '"$1"')
    .split(/(?<=\n)/)
    .filter((line) => !/^\s*[A-Za-z][.)]\.{0,}\S*\.{2,}/.test(line) && !/^\s*[A-Za-z]\.{3,}/.test(line))
    .join('');
  let out = '';
  let run = '';
  let quoted = false;
  for (let i = 0; i < fixed.length; i++) {
    const c = fixed[i];
    if (c !== '"') {
      if (quoted) out += c;
      else run += c;
      continue;
    }
    const atStart = /^\s?$/.test(fixed[i - 1] ?? '') && /[A-Za-z'.]/.test(fixed[i + 1] ?? '');
    if (quoted) quoted = atStart;
    else if (!atStart && /\S/.test(fixed[i - 1] ?? '') && /\S/.test(run)) out += run.split(/\n\s*\n/).pop();
    else quoted = true;
    run = '';
  }
  return out;
}

/** Words as compared: the spaces, the quotation marks and the numbers apart (a log's printNumber keeps none). */
export const words = (t: string): string => t.replace(/[\s"\d]/g, '');
