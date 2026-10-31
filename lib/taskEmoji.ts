/**
 * lib/taskEmoji.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart task emoji detector.
 * Scans the task title for keywords and returns the best matching emoji.
 * Falls back to a category emoji if no keyword matches.
 *
 * Every emoji returned here has a bundled Fluent 3D image (see
 * lib/emojiAssets.ts) so tasks render identically on every phone.
 *
 * Usage:
 *   import { detectTaskEmoji, resolveTaskEmoji } from '@/lib/taskEmoji';
 *   detectTaskEmoji('Wash the dishes', 'chores'); // → '🍽️'
 *   resolveTaskEmoji(task);                       // stored pick, else detected
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Each entry: [keywords_to_match[], emoji_to_return]. FIRST match wins, so
 * specific phrases sit above the generic words that would otherwise steal them
 * ("breathing exercise" before "exercise", "drink water" before "water").
 */
const KEYWORD_MAP: Array<[string[], string]> = [
  // ── Mind & Calm (above Exercise so "breathing exercise" → 🧘) ──────────────
  [['meditation', 'meditate', 'mindful', 'mindfulness', 'breathing', 'breathe', 'deep breaths',
    'calm down', 'calm time', 'quiet time', 'relax', 'relaxation', 'yoga', 'stretching', 'stretch'], '🧘'],
  [['pray', 'prayer', 'prayers', 'namaz', 'salah', 'mosque', 'church', 'temple', 'puja', 'pooja',
    'quran', 'bible', 'scripture', 'worship', 'grace'], '🙏'],
  [['gratitude', 'grateful', 'thank', 'thanks', 'say thank you', 'thank you note'], '💌'],

  // ── Dishes & Kitchen ──────────────────────────────────────────────────────
  [['unload dishwasher', 'empty dishwasher', 'load dishwasher', 'dishwasher'], '🍽️'],
  [['dish', 'dishes', 'washing up', 'wash up', 'plate', 'plates', 'pots', 'cutlery'], '🍽️'],
  [['set table', 'clear table', 'lay table', 'table', 'dining'], '🍽️'],
  [['lunch box', 'lunchbox', 'packed lunch', 'pack lunch', 'make lunch', 'snack pack', 'sandwich'], '🥪'],
  [['eat breakfast', 'make breakfast', 'breakfast', 'cereal'], '🥣'],
  [['eat vegetables', 'eat veggies', 'veggies', 'vegetables', 'salad', 'fruit', 'healthy eating'], '🥦'],
  [['cook', 'cooking', 'dinner', 'lunch', 'meal', 'recipe', 'help cook', 'prep food'], '🍳'],
  [['bake', 'baking', 'cookies', 'cake'], '🧁'],
  [['kitchen', 'countertop', 'counter', 'stove', 'oven', 'microwave', 'fridge'], '🧽'],
  [['groceries', 'grocery', 'shopping', 'supermarket', 'market', 'food shop', 'put away groceries'], '🛒'],

  // ── Cleaning ──────────────────────────────────────────────────────────────
  [['vacuum', 'hoover', 'vacuuming'], '🧹'],
  [['sweep', 'broom', 'sweeping'], '🧹'],
  [['mop', 'mopping'], '🪣'],
  [['dust', 'dusting', 'polish', 'wipe down', 'wipe', 'wiping', 'surfaces'], '✨'],
  [['make bed', 'bed making', 'strip bed', 'change sheets', 'bed sheets'], '🛏️'],
  [['clean room', 'tidy room', 'bedroom', 'room clean', 'clean up room'], '🧸'],
  [['put away toys', 'pick up toys', 'tidy toys', 'toys', 'toy'], '🧸'],
  [['bathroom', 'toilet', 'scrub toilet', 'clean toilet', 'loo', 'sink'], '🚽'],
  [['window', 'windows', 'mirror', 'mirrors', 'glass'], '🪟'],
  [['take out trash', 'take out bins', 'bins out', 'bring in bins', 'empty bin', 'bin', 'bins',
    'trash', 'rubbish', 'garbage'], '🗑️'],
  [['recycle', 'recycling', 'sort recycling'], '♻️'],
  [['hang washing', 'hang clothes', 'peg out', 'tumble dryer', 'laundry', 'wash clothes',
    'washing machine', 'put on wash'], '🧺'],
  [['fold', 'folding', 'put away clothes', 'socks', 'clothes away'], '👕'],
  [['iron', 'ironing'], '👔'],
  [['towel', 'towels'], '🧺'],
  [['shoes', 'shoe', 'polish shoes', 'clean shoes', 'shoe rack', 'sneakers'], '👟'],
  [['declutter', 'organise', 'organize', 'tidy', 'tidying', 'tidy up', 'sort', 'sorting', 'closet', 'drawer'], '🗂️'],
  [['clean', 'cleaning', 'scrub', 'chores', 'chore', 'housework'], '🧽'],

  // ── Outdoors & Garden ─────────────────────────────────────────────────────
  [['water plants', 'water the plants', 'watering', 'water flowers', 'houseplants'], '🪴'],
  [['lawn', 'mow', 'mowing', 'cut grass', 'grass', 'rake', 'raking', 'leaves'], '🌿'],
  [['garden', 'gardening', 'plant', 'planting', 'weed', 'weeding', 'dig', 'soil', 'seeds'], '🌱'],
  [['wash car', 'clean car', 'car wash', 'vacuum car', 'car'], '🚗'],
  [['snow', 'shovel', 'shovelling', 'shoveling'], '❄️'],

  // ── Pets ──────────────────────────────────────────────────────────────────
  [['walk dog', 'dog walk', 'take dog out', 'feed dog', 'dog food', 'dog bowl', 'dog water', 'dog', 'puppy'], '🐕'],
  [['feed cat', 'cat food', 'cat litter', 'litter box', 'litter tray', 'cat', 'kitten'], '🐈'],
  [['feed fish', 'fish tank', 'aquarium', 'fish'], '🐠'],
  [['hamster', 'guinea pig', 'rabbit', 'bunny'], '🐹'],
  [['bird', 'birds', 'parrot'], '🐦'],
  [['pet', 'pets', 'feed pet', 'animal', 'animals'], '🐾'],

  // ── Homework & Study ──────────────────────────────────────────────────────
  [['math', 'maths', 'arithmetic', 'multiplication', 'division', 'fractions', 'algebra', 'times tables', 'numbers'], '🔢'],
  [['spelling', 'spellings', 'word list', 'vocabulary', 'vocab', 'phonics', 'alphabet'], '🔤'],
  [['science', 'experiment', 'biology', 'chemistry', 'physics'], '🔬'],
  [['geography', 'history', 'social studies', 'map', 'maps'], '🌍'],
  [['language', 'spanish', 'french', 'german', 'mandarin', 'hindi', 'arabic', 'japanese', 'italian', 'duolingo'], '🗣️'],
  [['computer', 'coding', 'code', 'program', 'programming', 'typing', 'scratch'], '💻'],
  [['writing', 'write', 'essay', 'paragraph', 'composition', 'handwriting', 'cursive'], '✏️'],
  [['diary', 'journal', 'journaling'], '📓'],
  [['project', 'school project', 'poster', 'presentation'], '📋'],
  [['read', 'reading', 'book', 'books', 'chapter', 'novel', 'library', 'story'], '📖'],
  [['study', 'studying', 'revision', 'revise', 'test prep', 'exam', 'exam prep', 'flashcards', 'quiz'], '📝'],
  [['homework', 'home work', 'school work', 'schoolwork', 'assignment', 'worksheet', 'tutor', 'tutoring', 'kumon'], '📚'],

  // ── Music & Creativity ────────────────────────────────────────────────────
  [['piano', 'keyboard'], '🎹'],
  [['guitar', 'ukulele'], '🎸'],
  [['violin', 'cello', 'viola'], '🎻'],
  [['drum', 'drums'], '🥁'],
  [['trumpet', 'flute', 'clarinet', 'saxophone', 'recorder'], '🎺'],
  [['practice instrument', 'practise instrument', 'instrument', 'music', 'music practice', 'song', 'sing', 'singing', 'choir'], '🎵'],
  [['art', 'draw', 'drawing', 'paint', 'painting', 'colouring', 'coloring', 'sketch', 'craft', 'crafts'], '🎨'],
  [['lego', 'build', 'building blocks', 'construction'], '🧱'],
  [['puzzle', 'jigsaw', 'sudoku'], '🧩'],
  [['chess', 'board game'], '♟️'],

  // ── Hygiene & Health ─────────────────────────────────────────────────────
  // Water/drink FIRST so "drink water" isn't stolen by a generic water match.
  [['drink water', 'drinking water', 'water intake', 'hydrate', 'hydration', 'water bottle', 'stay hydrated', 'glasses of water', 'drink'], '💧'],
  [['brush teeth', 'teeth', 'tooth', 'toothbrush', 'dental', 'floss', 'flossing', 'mouthwash'], '🪥'],
  [['shower', 'have shower', 'take shower'], '🚿'],
  [['bath', 'bath time', 'have bath', 'take bath'], '🛁'],
  [['wash hands', 'hand wash', 'handwashing', 'soap'], '🧼'],
  [['wash face', 'face wash', 'skincare', 'skin care', 'moisturiser', 'moisturizer', 'sunscreen', 'sunblock', 'spf', 'lotion'], '🧴'],
  [['brush hair', 'comb hair', 'wash hair', 'hair', 'haircut', 'braid'], '💇'],
  [['nails', 'cut nails', 'trim nails', 'nail'], '💅'],
  [['medicine', 'vitamin', 'vitamins', 'tablet', 'medication', 'inhaler', 'pills'], '💊'],
  // Sleep/bedtime BEFORE the "bed" chore so "go to bed" → 😴 not 🛏️.
  [['sleep', 'bed time', 'bedtime', 'lights out', 'go to bed', 'get ready for bed', 'nap', 'early night'], '😴'],
  [['wake up on time', 'get up on time', 'wake up', 'set alarm', 'alarm', 'alarm clock'], '⏰'],
  [['get dressed', 'dressed', 'pajamas', 'pyjamas', 'clothes out', 'uniform'], '👕'],

  // ── Exercise & Sports ─────────────────────────────────────────────────────
  [['run', 'running', 'jog', 'jogging', 'sprint', '5k'], '🏃'],
  [['bike', 'cycling', 'cycle', 'bicycle', 'ride bike', 'scooter'], '🚲'],
  [['swim', 'swimming', 'pool', 'swim lesson'], '🏊'],
  [['basketball'], '🏀'],
  [['tennis', 'badminton'], '🎾'],
  [['cricket'], '🏏'],
  [['baseball', 'softball'], '⚾'],
  [['football', 'soccer'], '⚽'],
  [['karate', 'taekwondo', 'martial arts', 'judo', 'boxing'], '🥋'],
  [['dance', 'dancing', 'ballet', 'dance class'], '💃'],
  [['jump rope', 'skipping', 'trampoline'], '🤸'],
  [['exercise', 'workout', 'work out', 'gym', 'fitness', 'push ups', 'pushups', 'sit ups', 'situps', 'squats', 'plank'], '💪'],
  [['walk', 'walking', 'steps', 'step count', 'go outside', 'outdoor time', 'play outside', 'fresh air'], '🚶'],
  [['sport', 'sports', 'training', 'practice', 'match', 'game day'], '🏅'],

  // ── Behaviour & Character ─────────────────────────────────────────────────
  [['screen time', 'no screen', 'screen limit', 'device limit', 'no phone', 'put phone down', 'phone free', 'digital detox', 'no tablet', 'no ipad'], '📵'],
  [['video game', 'video games', 'gaming', 'xbox', 'playstation', 'nintendo', 'switch time'], '🎮'],
  [['tv', 'television', 'movie', 'movie night', 'netflix'], '📺'],
  [['kind', 'kindness', 'be nice', 'be kind', 'friendly', 'nice to'], '💛'],
  [['polite', 'manners', 'respect', 'respectful', 'listen', 'listening', 'follow instructions', 'obey'], '👂'],
  [['share', 'sharing', 'take turns', 'sibling', 'no fighting', 'get along'], '🤝'],
  [['apologize', 'apologise', 'say sorry', 'sorry'], '🤍'],
  [['help', 'helping', 'assist', 'lend a hand', 'help out', 'help mom', 'help dad'], '🤗'],
  [['hug', 'hugs', 'family time'], '🫂'],
  [['baby', 'babysit', 'look after sibling', 'watch brother', 'watch sister'], '👶'],
  [['no whining', 'no complaining', 'good attitude', 'positive', 'smile', 'cheerful'], '😊'],
  [['honest', 'honesty', 'tell truth', 'truth'], '🌟'],
  [['patience', 'patient', 'wait turn'], '⏳'],
  [['on time', 'be on time', 'punctual', 'ready on time'], '⏰'],

  // ── Responsibilities & Life Skills ────────────────────────────────────────
  [['pack bag', 'school bag', 'backpack', 'pack backpack', 'get bag ready'], '🎒'],
  [['money', 'save', 'saving', 'savings', 'piggy bank', 'allowance', 'pocket money', 'budget'], '🐷'],
  [['donate', 'charity', 'give to', 'fundraise'], '💝'],
  [['volunteer', 'volunteering', 'community service'], '🙌'],
  [['phone call', 'call grandma', 'call grandpa', 'call grandparents', 'ring grandma', 'family call', 'video call'], '📞'],
  [['letter', 'card', 'thank you card', 'email'], '💌'],
  [['morning routine', 'morning tasks', 'get ready', 'ready for school', 'school ready'], '🌅'],
  [['evening routine', 'night routine', 'bedtime routine'], '🌙'],

  // ── Generic learning — LAST, so any specific activity wins first ─────────
  // ("Piano lesson" → 🎹, "Swim lesson" → 🏊, only "Learning - 15 mins" → 📚).
  [['learn', 'learning', 'lesson', 'lessons', 'class', 'course', 'khan academy', 'education'], '📚'],
];

/**
 * Category emoji used when no keyword matches. Deliberately NOT cleaning
 * supplies — the old 🧽/🧼 fallbacks made an unmatched "Quiet time" or
 * "Feed fish" look like a scrubbing brush.
 */
export const CATEGORY_FALLBACK: Record<string, string> = {
  chores: '🏠',
  homework: '📚',
  hygiene: '✨',
  behavior: '🌟',
  extras: '🎯',
};
const DEFAULT_FALLBACK = '✅';

/**
 * Emoji the previous detector used as blind fallbacks. A task SAVED with one of
 * these almost certainly never got a real match, so resolveTaskEmoji re-detects
 * it instead of trusting the stored value.
 */
const LEGACY_FALLBACKS = new Set(['🧽', '🧼', '⭐', '📌', '🚿']);

/**
 * Filler words dropped before matching so "make a bed" == "make bed" and
 * "brush your teeth" == "brush teeth". Deliberately limited to articles /
 * possessives / a few prepositions — NOT verbs or particles like "out"/"up"
 * that carry meaning in chore phrases ("take out trash", "work out").
 */
const FILLER = new Set([
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'of', 'to', 'for', 'and', 'or', 'please', 'pls', 'some', 'all',
]);

/** Lowercase, strip punctuation/emoji, drop filler words, collapse spaces. */
function normalize(title: string): { text: string; tokens: string[] } {
  const tokens = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLER.has(w));
  return { text: tokens.join(' '), tokens };
}

/** True when a and b differ by at most one insert/delete/substitute. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Pre-normalize the keyword phrases once so the filler-stripping applies to both
// sides of the comparison (e.g. keyword "make your bed" → "make bed").
const NORMALIZED_MAP: Array<[string[], string]> = KEYWORD_MAP.map(
  ([kws, emoji]) => [kws.map((kw) => normalize(kw).text).filter(Boolean), emoji],
);

/**
 * Returns the best emoji for a task given its title and category.
 * Multi-word keywords match as a contiguous phrase; single-word keywords match a
 * title word by PREFIX (so "drinking" matches "drink", "dishes" matches "dish")
 * without mid-word false hits ("run" won't match "brunch"). First match wins.
 * A second, typo-tolerant pass (one edit, words of 5+ letters) catches
 * "meditaion" / "homwork". Falls back to a neutral category emoji.
 */
export function detectTaskEmoji(title: string, category: string): string {
  const { text, tokens } = normalize(title);
  if (text) {
    for (const [keywords, emoji] of NORMALIZED_MAP) {
      for (const kw of keywords) {
        const isPhrase = kw.includes(' ');
        if (isPhrase ? text.includes(kw) : tokens.some((w) => w.startsWith(kw))) {
          return emoji;
        }
      }
    }
    for (const [keywords, emoji] of NORMALIZED_MAP) {
      for (const kw of keywords) {
        if (kw.includes(' ') || kw.length < 5) continue;
        if (tokens.some((w) => w.length >= 5 && withinOneEdit(w, kw))) return emoji;
      }
    }
  }
  return CATEGORY_FALLBACK[category] ?? DEFAULT_FALLBACK;
}

/**
 * The emoji to DISPLAY for a task: the one saved on it (a parent may have picked
 * it deliberately), unless that saved value is a stale blind fallback from the
 * old detector — then re-detect from the title.
 */
export function resolveTaskEmoji(task: { title: string; category: string; taskEmoji?: string | null }): string {
  const saved = task.taskEmoji?.trim();
  if (saved && !LEGACY_FALLBACKS.has(saved)) return saved;
  return detectTaskEmoji(task.title, task.category);
}

/** Every emoji this module can return — the set lib/emojiAssets.ts must cover. */
export const ALL_TASK_EMOJI: string[] = Array.from(new Set([
  ...KEYWORD_MAP.map(([, e]) => e),
  ...Object.values(CATEGORY_FALLBACK),
  DEFAULT_FALLBACK,
]));
