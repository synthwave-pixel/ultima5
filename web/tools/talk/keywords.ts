/**
 * keywords.ts
 *
 * Which words heard in Britannia the controller's Say list would offer a townsman for each of their keywords
 * (menu.ts sayMenu, words.ts forStub), and where that goes wrong. A townsman's keyword is a stub - "THIN" - and the
 * list offers, for it, any word the player has heard that begins with it, from whoever said it; so a word heard
 * from one townsman ("things") may stand for another's keyword that means something else ("think"). This reads
 * every conversation in the game, heard as the player hears it (words.ts learn), and for every keyword sorts the
 * words that could be offered for it:
 *
 * - none: nothing anyone says fits it (the list can never offer it from speech alone);
 * - one: one word, or one word's forms (shadowlord, shadowlords) - no confusion possible;
 * - clash: different words (things, think) - the label may be another townsman's word, and the keyword reachable
 *   with a word that never meant it.
 *
 * Each clash is told with who says each word, and whether the keyword's own townsman does. Run, with a copy in
 * ../gamedata/ultima5 (gamedata/README.md):
 *
 *   node --import ./tools/node-ts.mjs tools/talk/keywords.ts [--all]
 *
 * (--all lists every keyword, not only the clashes.)
 */

import { KEYWORD_LABELS } from '../../src/game/keywordLabels.ts';
import { newGame } from '../../tests/helpers.ts';
import { analyse, type Person, type Row, type Verdict } from './analysis.ts';

const { g } = newGame();
const { all, rows, proper, ownRoots, ambiguous, borrowed, hidden } = analyse(g);
/** The label settled by hand for this keyword (keywordLabels.ts), if any. */
const reviewed = (r: Row): string | undefined => KEYWORD_LABELS[`${r.who.file}:${r.who.talk}:${r.stub}`];
const count = (v: Verdict): number => rows.filter((r) => r.verdict === v).length;
const clashes = rows.filter((r) => r.verdict === 'clash');
// The clash that misleads: the townsman says one word for it, and another word, from someone else, also fits.
const foreign = clashes.filter((r) => r.groups.some((x) => x.own) && r.groups.some((x) => !x.own));
// Reached only by others' words: the townsman never says a word that fits (the lead is elsewhere, or nowhere).
const onlyOthers = rows.filter((r) => r.verdict !== 'none' && !r.groups.some((x) => x.own));
const show = (r: Row): string =>
  `- ${r.who.name} (${r.who.where}) ${r.stub}: ` +
  r.groups
    .map(
      (x) =>
        `${x.words.join('/')}${x.own ? ' [own]' : ''} <- ${x.by.slice(0, 3).join('; ')}${x.by.length > 3 ? ` +${x.by.length - 3}` : ''}`,
    )
    .join(' | ');

// The proposal: a townsman is offered, for a keyword, only words that are forms of a word they themselves say
// somewhere (their own text, the keyword's answer among it); where they say none, as now. What it takes away, and
// which of that might be a lead after all - a name said elsewhere that fits the keyword.
const dropped = rows.flatMap((r) =>
  r.groups.some((x) => x.own) ? r.groups.filter((x) => !x.own).map((x) => ({ r, x, lead: x.words.some(proper) })) : [],
);
// What the list shows today, once everything has been heard: the shortest word that fits (words.ts forStub). Where
// the townsman says a word for it and that is not it, the keyword wears another townsman's word.
const wrongLabel = rows.filter((r) => {
  if (!r.groups.some((x) => x.own)) return false;
  const shortest = r.groups.flatMap((x) => x.words).sort((a, b) => a.length - b.length)[0];
  return !r.groups.find((x) => x.words.includes(shortest))!.own;
});
// Offered from the first words of the game: a word of another meaning that ten or more townsfolk say fits it.
const common = (r: Row): boolean => r.groups.some((x) => !x.own && x.by.length >= 10) && r.groups.some((x) => x.own);
const freeTopics = rows.filter(common);
console.log(`${all.length} conversations, ${rows.length} keywords offered by the Say list (3+ letters, not the game's own)`);
console.log(`  one word or its forms: ${count('one')}`);
console.log(`  nothing said or written fits: ${count('none')}`);
console.log(`  fits only turned about (Goeth's): ${count('backward')}`);
console.log(`  different words fit:   ${count('clash')}`);
console.log(`    the townsman's own word and another's: ${foreign.length}`);
console.log(`  reached only by others' words: ${onlyOthers.length}`);
console.log(`  labelled, all heard, with another townsman's word: ${wrongLabel.length}`);
console.log(`  open from the start, a common word of another meaning fitting: ${freeTopics.length}`);
// A middle way. The keyword is offered as 1988 matched it - any word heard that fits - so every lead holds; but
// labelled with the townsman's own word where it has been heard, else a word of the same root, else the shortest.
// And, optionally, a keyword not offered at all while the only words heard that fit it are common words of another
// meaning: lower case (no name), said by ten or more townsfolk, of no root the townsman uses.
console.log(`\nThe label, all heard, by the townsman's own words:`);
console.log(`  certain (their own word, one root): ${rows.filter((r) => ownRoots(r) === 1).length}`);
console.log(`  only one word fits at all, theirs or not: ${rows.filter((r) => ownRoots(r) === 0 && r.groups.length === 1).length}`);
console.log(`  to check - they say two different words that fit: ${ambiguous.length}`);
console.log(`  to check - they say none, and others' different words fit: ${borrowed.length}`);
const unreviewed = [...ambiguous, ...borrowed].filter((r) => !reviewed(r));
console.log(
  `    of which reviewed (keywordLabels.ts): ${ambiguous.length + borrowed.length - unreviewed.length}; not yet: ${unreviewed.length}`,
);
console.log(`  hidden by the common-word rule until the townsman's own word is heard: ${hidden.length}`);
// The label the rule picks, everything heard: of the townsman's own words that fit, the rarest in Britannia (said by
// the fewest townsfolk), then the shortest; with none of theirs, the same of everyone's.
// The label the game shows, everything heard (words.ts forStub): the reviewed one (keywordLabels.ts), pinned; else of
// the townsman's own words that fit, the rarest in Britannia, then the shortest; with none of theirs, the shortest.
const label = (r: Row): string => {
  const pinned = reviewed(r);
  if (pinned) return `${pinned}" (reviewed`;
  if (!r.groups.some((x) => x.own)) return r.groups.flatMap((x) => x.words).sort((a, b) => a.length - b.length)[0];
  const pool = r.groups.filter((x) => x.own);
  return pool.slice().sort((a, b) => a.by.length - b.by.length || a.words[0].length - b.words[0].length)[0].words[0];
};
/** Where the townsman says a word: the words round it. */
const context = (p: Person, word: string): string => {
  const flat = p.said.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().search(new RegExp(`\\b${word}\\b`));
  return at < 0 ? '' : flat.slice(Math.max(0, at - 60), at + 60).trim();
};
const check = (r: Row): string =>
  [
    `${show(r)}  [${r.who.file}:${r.who.talk}]`,
    `    -> shown as "${label(r)}"; answer: ${(r.who.answers.get(r.stub) ?? '(a question listens for it)').slice(0, 200)}`,
    ...r.groups.filter((x) => x.own).map((x) => `    ${x.words[0]}: ...${context(r.who, x.words[0])}...`),
  ].join('\n');
console.log('\n## To check: the townsman says two different words that fit\n');
for (const r of ambiguous) console.log(check(r));
console.log("\n## To check: the townsman says none that fits; others' different words do\n");
for (const r of borrowed) console.log(check(r));
console.log('\n## Hidden until their own word is heard (the optional rule)\n');
for (const r of hidden) console.log(show(r));
console.log("\n## Labelled with another townsman's word\n");
for (const r of wrongLabel) console.log(show(r));
console.log(
  `\nOffering only forms of the townsman's own words would take away ${dropped.length} offers from ${new Set(dropped.map((d) => d.r)).size} keywords; ${dropped.filter((d) => d.lead).length} of them a name or a capitalised word:`,
);
for (const d of dropped.filter((x) => x.lead))
  console.log(
    `- ${d.r.who.name} (${d.r.who.where}) ${d.r.stub}: ${d.x.words.join('/')} <- ${d.x.by.slice(0, 3).join('; ')}${d.x.by.length > 3 ? ` +${d.x.by.length - 3}` : ''}`,
  );
console.log('\n## Different words fit\n');
for (const r of clashes) console.log(show(r));
console.log('\n## Fits only turned about\n');
for (const r of rows.filter((x) => x.verdict === 'backward')) console.log(show(r));
console.log('\n## Nothing said or written fits\n');
for (const r of rows.filter((x) => x.verdict === 'none')) console.log(show(r));
if (process.argv.includes('--all')) {
  console.log('\n## Every keyword\n');
  for (const r of rows) console.log(show(r));
}
if (unreviewed.length) {
  console.log('\n## Not yet reviewed (keywordLabels.ts)\n');
  for (const r of unreviewed) console.log(`${check(r)}`);
}
