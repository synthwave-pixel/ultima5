/**
 * openAnswers.ts
 *
 * What the Answer list offers at a townsman's question that listens for nothing - every answer goes on the same way -
 * and does not read as yes or no: Camile's "how art thou doing on this fine day?" is no question to say Yes to (menu.ts
 * answerMenu). In 1988 the player typed whatever they liked; here a few answers written for the question, each said as
 * typed (shown in the log as ":WELL"). A question that reads as yes or no ("Dost thou admire fine glasswork?") keeps
 * Yes and No. None begins with one of the words the game answers itself (Name, Job, Bye, the swearing: tests).
 *
 * Keyed by the conversation - the file (0 TOWNE, 1 DWELLING, 2 CASTLE, 3 KEEP .TLK) and its number there - and the
 * question's label, in hex, as keywordLabels.ts keys a keyword.
 */

export const OPEN_ANSWERS: Readonly<Record<string, readonly string[]>> = {
  // Camile (West Britanny): "Avatar, how art thou doing on this fine day?"
  '2:18:91': ['Well', 'Poorly'],
  // Camile: "Hmmm... How hath thy journeys fared?"
  '2:18:92': ['Well enough', 'Hard going'],
  // Thentis (North Britanny): "What dost thou do?" - and then "Dost thou like it?"
  '2:21:91': ['I adventure', 'I seek a quest'],
  // Squire Jimmy (East Britanny): "What news of the world hath thee?"
  '2:27:91': ['Dark times', 'Nothing new'],
  // Saduj (Lord British's castle), Blackthorn's spy: "For that matter, what art thou doing here?"
  '2:7:92': ['Visiting', 'Seeking British'],
  // Landon (Yew): "Hello, Avatar, how can I aid thee?"
  '0:18:94': ['News', 'The Resistance'],
  // Hassad (Blackthorn's palace): "Who is there? What dost thou want?" - "I know of the Great Council, but..."
  '2:17:92': ['A friend', 'The Council'],
  // Weblock (Blackthorn's palace): "Where or whom dost thou seek?" - then his list of the palace's rooms and people.
  '2:14:92': ['A way', 'Someone'],
  // Smith (Iolo's hut): "You know what?"
  '1:13:94': ['What?', 'No'],
  // Gregory (Waveguide): "Were ye born that ugly, or didst ye lose a fight with a frying pan?"
  '1:8:92': ['Born so', 'The pan'],
};
