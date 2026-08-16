/**
 * lib/taskEmoji.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Smart task emoji detector.
 * Scans the task title for keywords and returns the best matching emoji.
 * Falls back to a category emoji if no keyword matches.
 *
 * Usage:
 *   import { detectTaskEmoji } from '@/lib/taskEmoji';
 *   const emoji = detectTaskEmoji('Wash the dishes', 'chores'); // → '🍽️'
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Each entry: [keywords_to_match[], emoji_to_return] */
const KEYWORD_MAP: Array<[string[], string]> = [
  // ── Dishes & Kitchen ──────────────────────────────────────────────────────
  [['dish', 'dishes', 'washing up', 'wash up', 'plate', 'plates', 'pot', 'pots', 'cutlery'], '🍽️'],
  [['cook', 'cooking', 'dinner', 'lunch', 'breakfast', 'meal', 'bake', 'baking', 'recipe'], '🍳'],
  [['kitchen', 'countertop', 'counter', 'wipe down', 'stove', 'oven', 'microwave'], '🍳'],
  [['groceries', 'grocery', 'shopping', 'supermarket', 'store', 'market', 'food shop'], '🛒'],
  [['table', 'set table', 'clear table', 'dining'], '🍽️'],
  [['lunch box', 'lunchbox', 'packed lunch', 'snack pack', 'food box'], '🥪'],

  // ── Cleaning ──────────────────────────────────────────────────────────────
  [['vacuum', 'hoover', 'vacuuming'], '🧹'],
  [['sweep', 'broom', 'sweep floor', 'sweeping'], '🧹'],
  [['mop', 'mopping', 'mop floor'], '🪣'],
  [['dust', 'dusting', 'wipe', 'wiping', 'polish', 'surface'], '✨'],
  [['clean room', 'tidy room', 'bedroom', 'tidy up', 'tidying', 'room clean'], '🛏️'],
  [['make bed', 'make your bed', 'bed making', 'strip bed'], '🛏️'],
  [['bathroom', 'toilet', 'scrub toilet', 'scrub bath', 'clean toilet', 'loo'], '🚽'],
  [['window', 'windows', 'glass clean', 'wipe windows'], '🪟'],
  [['bin', 'bins', 'trash', 'rubbish', 'garbage', 'empty bin', 'take out trash', 'put out bins'], '🗑️'],
  [['recycle', 'recycling', 'eco', 'sort recycling'], '♻️'],
  [['laundry', 'wash clothes', 'washing machine', 'clothes wash', 'put on wash'], '🫧'],
  [['fold', 'folding', 'fold clothes', 'fold laundry', 'put away clothes'], '👕'],
  [['iron', 'ironing', 'iron clothes'], '👔'],
  [['tidy', 'organise', 'organize', 'sort', 'sorting', 'declutter'], '🗂️'],

  // ── Outdoors & Garden ─────────────────────────────────────────────────────
  [['garden', 'gardening', 'plant', 'planting', 'weed', 'weeding', 'dig', 'soil'], '🌱'],
  [['lawn', 'mow', 'mowing', 'grass', 'cut grass', 'mow lawn'], '🌿'],
  [['water plants', 'water the plants', 'watering', 'water flowers'], '🪴'],
  [['wash car', 'clean car', 'car wash', 'hoover car', 'vacuum car'], '🚗'],
  [['take out', 'bins out', 'wheelie bin', 'recycling bin'], '🗑️'],
  [['walk dog', 'dog walk', 'take dog out', 'walk the dog'], '🐕'],

  // ── Pets ──────────────────────────────────────────────────────────────────
  [['feed cat', 'cat food', 'cat litter', 'litter box', 'litter tray', 'clean litter'], '🐱'],
  [['feed dog', 'dog food', 'dog water', 'dog bowl'], '🐕'],
  [['pet', 'pets', 'feed pet', 'animal', 'fish tank', 'hamster', 'rabbit', 'guinea pig', 'bird'], '🐾'],

  // ── Homework & Study ──────────────────────────────────────────────────────
  [['homework', 'home work', 'school work', 'schoolwork', 'assignment', 'worksheet'], '📚'],
  [['read', 'reading', 'book', 'books', 'chapter', 'novel', 'library'], '📖'],
  [['math', 'maths', 'arithmetic', 'multiplication', 'division', 'fraction', 'algebra', 'times tables'], '🔢'],
  [['spelling', 'spell', 'spellings', 'word list', 'vocabulary', 'vocab'], '🔤'],
  [['writing', 'write', 'essay', 'paragraph', 'composition', 'creative writing'], '✏️'],
  [['science', 'experiment', 'biology', 'chemistry', 'physics'], '🔬'],
  [['geography', 'history', 'social studies', 'map'], '🌍'],
  [['study', 'studying', 'revision', 'revise', 'test prep', 'exam prep', 'flashcard'], '📝'],
  [['practice instrument', 'practise instrument', 'piano', 'guitar', 'violin', 'trumpet', 'flute', 'drums'], '🎵'],
  [['art', 'draw', 'drawing', 'paint', 'painting', 'colour', 'color', 'sketch', 'craft'], '🎨'],
  [['computer', 'coding', 'code', 'program', 'programming', 'typing'], '💻'],
  [['language', 'spanish', 'french', 'german', 'mandarin', 'arabic', 'japanese', 'italian'], '🌍'],
  [['project', 'school project', 'poster', 'presentation'], '📋'],
  [['diary', 'journal', 'journal writing'], '📓'],

  // ── Hygiene & Health ─────────────────────────────────────────────────────
  // Water/drink FIRST so "drink water" isn't stolen by a generic water match.
  [['drink', 'drink water', 'drinking water', 'water intake', 'hydrate', 'hydration', 'water bottle', 'stay hydrated', '8 glasses'], '💧'],
  [['brush teeth', 'teeth', 'tooth', 'toothbrush', 'dental', 'floss', 'mouthwash'], '🦷'],
  [['shower', 'have shower', 'take shower'], '🚿'],
  [['bath', 'bath time', 'have bath', 'take bath'], '🛁'],
  [['wash hands', 'hand wash'], '🧼'],
  [['hair', 'brush hair', 'comb hair', 'wash hair', 'haircut'], '💇'],
  [['medicine', 'vitamin', 'tablet', 'medication', 'inhaler'], '💊'],
  [['skincare', 'moisturiser', 'moisturizer', 'face wash', 'sunscreen', 'sunblock', 'spf'], '☀️'],
  // Sleep/bedtime BEFORE the "bed" chore so "go to bed" → 😴 not 🛏️.
  [['sleep', 'bed time', 'bedtime', 'lights out', 'go to bed', 'get ready for bed'], '😴'],
  [['get dressed', 'dressed', 'clothes out', 'pack clothes', 'uniform'], '👕'],

  // ── Exercise & Sports ─────────────────────────────────────────────────────
  [['exercise', 'workout', 'work out', 'gym', 'fitness', 'push ups', 'sit ups', 'pushups'], '💪'],
  [['run', 'running', 'jog', 'jogging', 'sprint', '5k'], '🏃'],
  [['walk', 'walking', 'steps', 'step count', 'go outside'], '🚶'],
  [['bike', 'cycling', 'cycle', 'bicycle', 'ride bike'], '🚲'],
  [['swim', 'swimming', 'pool', 'swim lesson'], '🏊'],
  [['football', 'soccer', 'football practice', 'football training'], '⚽'],
  [['basketball', 'basketball practice', 'basketball training'], '🏀'],
  [['tennis', 'tennis lesson', 'tennis practice'], '🎾'],
  [['dance', 'dancing', 'ballet', 'dance class'], '💃'],
  [['yoga', 'stretching', 'stretch'], '🧘'],
  [['sport', 'sports', 'training', 'practice sport', 'match', 'game day'], '⚽'],

  // ── Behaviour & Character ─────────────────────────────────────────────────
  [['kind', 'kindness', 'be nice', 'be kind', 'friendly', 'polite'], '💛'],
  [['respect', 'respectful', 'listen', 'follow instructions'], '🤝'],
  [['share', 'sharing', 'take turns', 'sibling'], '🤝'],
  [['thank', 'thanks', 'gratitude', 'say thank you', 'thank you'], '🙏'],
  [['apologize', 'apologise', 'say sorry', 'sorry'], '🤍'],
  [['help', 'helping', 'assist', 'lend a hand', 'help out'], '🤗'],
  [['screen time', 'no screen', 'screen limit', 'device limit'], '📵'],
  [['social media', 'instagram', 'youtube', 'tiktok', 'snapchat'], '📱'],
  [['no phone', 'put phone down', 'phone free', 'digital detox'], '📵'],

  // ── Responsibilities & Life Skills ────────────────────────────────────────
  [['pack bag', 'school bag', 'backpack', 'pack backpack', 'get bag ready'], '🎒'],
  [['money', 'save', 'saving', 'savings', 'piggy bank', 'allowance', 'pocket money'], '🐷'],
  [['donate', 'charity', 'give to', 'fundraise'], '💝'],
  [['phone call', 'call grandma', 'call grandpa', 'call grandparents', 'ring grandma', 'family call'], '📞'],
  [['pray', 'prayer', 'mosque', 'church', 'temple', 'meditation', 'meditate', 'mindful', 'mindfulness'], '🧘'],
  [['volunteer', 'volunteering', 'community service'], '🙌'],

  // ── Music & Creativity ────────────────────────────────────────────────────
  [['music', 'song', 'sing', 'singing', 'choir', 'music practice'], '🎶'],
  [['instrument', 'practice instrument', 'play instrument'], '🎵'],
  [['lego', 'build', 'building blocks', 'construction'], '🧱'],
  [['puzzle', 'jigsaw'], '🧩'],

  // ── Morning & Evening Routines ────────────────────────────────────────────
  [['morning routine', 'morning tasks', 'get ready', 'ready for school', 'school ready'], '☀️'],
  [['evening routine', 'night routine', 'bedtime routine'], '🌙'],
  [['breakfast', 'make breakfast', 'eat breakfast'], '🥞'],

  // ── Chore Helpers ─────────────────────────────────────────────────────────
  [['unload dishwasher', 'empty dishwasher', 'load dishwasher'], '🍽️'],
  [['unload washing', 'hang washing', 'hang clothes', 'peg out', 'tumble dryer'], '🫧'],
  [['bring in bins', 'bring bins in', 'collect bins'], '🗑️'],
  [['set alarm', 'alarm clock', 'wake up on time', 'get up on time'], '⏰'],
];

/**
 * Category emoji used when no keyword matches. Kept intentionally NEUTRAL so an
 * unmatched task doesn't get a misleading specific icon (e.g. every unmatched
 * hygiene task looking like a shower). Better keyword coverage above means this
 * is rarely hit.
 */
const CATEGORY_FALLBACK: Record<string, string> = {
  chores: '🧽',
  homework: '📚',
  hygiene: '🧼',
  behavior: '⭐',
  extras: '⭐',
};

/**
 * Filler words dropped before matching so "make a bed" == "make bed" and
 * "brush your teeth" == "brush teeth". Deliberately limited to articles /
 * possessives / a few prepositions — NOT verbs or particles like "out"/"up"
 * that carry meaning in chore phrases ("take out trash", "work out").
 */
const FILLER = new Set([
  'a', 'an', 'the', 'my', 'your', 'our', 'their', 'his', 'her', 'its',
  'of', 'to', 'for', 'and', 'or', 'please', 'pls',
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
 * Falls back to a neutral category emoji, then '📌'.
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
  }
  return CATEGORY_FALLBACK[category] ?? '📌';
}
