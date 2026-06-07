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
  [['brush teeth', 'teeth', 'tooth', 'toothbrush', 'dental', 'floss', 'mouthwash'], '🦷'],
  [['shower', 'shower time', 'have shower', 'take shower'], '🚿'],
  [['bath', 'bath time', 'have bath', 'take bath'], '🛁'],
  [['wash hands', 'hand wash', 'hands'], '🧼'],
  [['hair', 'brush hair', 'comb hair', 'hair brush', 'wash hair', 'haircut'], '💇'],
  [['medicine', 'vitamin', 'vitamins', 'tablet', 'medication', 'inhaler'], '💊'],
  [['skincare', 'moisturiser', 'moisturizer', 'face wash', 'sunscreen', 'sunblock', 'spf'], '☀️'],
  [['sleep', 'bed time', 'bedtime', 'lights out', 'go to bed', 'get ready for bed'], '😴'],
  [['drink water', 'water intake', 'hydrate', 'water bottle', '8 glasses'], '💧'],
  [['get dressed', 'dressed', 'clothes out', 'pack clothes', 'uniform'], '👕'],

  // ── Exercise & Sports ─────────────────────────────────────────────────────
  [['exercise', 'workout', 'work out', 'gym', 'fitness'], '🏃'],
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

/** Category emoji used when no keyword matches */
const CATEGORY_FALLBACK: Record<string, string> = {
  chores: '🧹',
  homework: '📚',
  hygiene: '🚿',
  behavior: '💛',
  extras: '⭐',
};

/**
 * Returns the best emoji for a task given its title and category.
 * Checks keywords in order — the first match wins.
 * Falls back to the category emoji, then '📌'.
 */
export function detectTaskEmoji(title: string, category: string): string {
  const lower = title.toLowerCase().trim();
  for (const [keywords, emoji] of KEYWORD_MAP) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return emoji;
    }
  }
  return CATEGORY_FALLBACK[category] ?? '📌';
}
