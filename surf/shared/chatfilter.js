// Chat moderation applied on the SERVER before anything is broadcast (clients cannot bypass it).
// - profanity / slurs (English + Slovenian), also when disguised: f.u.c.k, fuuuck, sh1t, š→s ...
// - no links, e-mail addresses or phone numbers (personal data / spam protection)
// - length limit, whitespace and "SHOUTING" normalisation
// Matched words are replaced with asterisks; the rest of the message is kept.

// roots: a token that STARTS with one of these is censored
const ROOTS = [
  // English
  'fuck', 'fuk', 'fck', 'shit', 'bitch', 'cunt', 'dick', 'cocksuck', 'pussy', 'asshole', 'arsehole', 'bastard', 'whore', 'slut',
  'nigger', 'nigga', 'faggot', 'retard', 'rapist', 'raping', 'nazi', 'hitler', 'porn', 'penis', 'vagina', 'wank', 'twat',
  'motherf', 'bollock', 'dildo', 'blowjob', 'handjob', 'jerkoff', 'boob', 'horny', 'hentai', 'nudes',
  // Slovenian / regional
  'kurb', 'kurac', 'kurc', 'pizd', 'jebe', 'jebi', 'jebo', 'jebat', 'fukni', 'fukat', 'prasic', 'peder', 'cigan', 'buzi', 'kreten', 'debil',
];
// exact tokens (short or ambiguous words that would hit innocent words as roots)
const EXACT = new Set([
  'ass', 'arse', 'fag', 'fags', 'kys', 'sex', 'sexy', 'rape', 'tit', 'tits', 'cum', 'cock', 'cocks', 'milf', 'nude',
  'picka', 'picko', 'picke', 'picku', 'jeb', 'drek', 'pedri', 'pedru', 'mongol', 'mongoli', 'idiot', 'idioti', 'stfu', 'gtfo',
  'nig', 'niga', 'nigas', 'niger', 'crkni', 'umri',
]);
// whole phrases checked on the normalised, space-free text
const PHRASES = ['killyourself', 'kysnow', 'pejtvpizdo', 'jebemtimater', 'jebemtimamo', 'materti', 'gotodie'];

const LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '€': 'e' };

// returns [lightly normalised (runs of 3+ letters -> 2), fully collapsed (every double -> single)]
function norms(t) {
  let s = String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[01!|3@4$57+89€]/g, (c) => LEET[c] || c).replace(/[^a-z]/g, '');
  const light = s.replace(/(.)\1{2,}/g, '$1$1');
  return [light, light.replace(/(.)\1/g, '$1')];
}
const ROOTS_N = [...new Set(ROOTS.flatMap((r) => norms(r)))].filter((r) => r.length >= 4); // e.g. 'boob' must not become 'bob'

function isBad(token) {
  const [light, full] = norms(token);
  if (!light) return false;
  if (EXACT.has(light)) return true;
  for (const r of ROOTS_N) if (light.startsWith(r) || full.startsWith(r)) return true;
  return false;
}
const normToken = (t) => norms(t)[0];

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]{2,}\s?(?:\.|\(dot\)|\[dot\]| dot )\s?(?:com|net|org|io|gg|si|xyz|ru|co|me|tv|app|ly|link|info|biz|de|uk|eu|online|site|store)\b\S*/gi;
const MAIL_RE = /\b[\w.+-]+\s?(?:@|\(at\)|\[at\])\s?[\w-]+\.[\w.]+\b/gi;
const PHONE_RE = /(?:\+?\d[\s\-./]?){7,}/g;
const INVITE_RE = /\b(?:discord|insta(?:gram)?|snap(?:chat)?|tiktok|telegram|whatsapp|t\.me|youtube\.com|wa\.me)\b\s*[:/@]?\s*\S*/gi;

/**
 * @returns {{ text: string, flagged: boolean, empty: boolean }}
 */
export function filterChat(raw, maxLen = 120) {
  let text = String(raw ?? '').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
  let flagged = false;
  const before = text;
  text = text.replace(MAIL_RE, '[removed]').replace(URL_RE, '[link removed]').replace(INVITE_RE, '[removed]').replace(PHONE_RE, '[removed]');
  if (text !== before) flagged = true;

  // token based profanity
  const parts = text.split(/(\s+)/);
  for (let i = 0; i < parts.length; i++) {
    if (/^\s+$/.test(parts[i])) continue;
    if (isBad(parts[i])) { parts[i] = '*'.repeat(Math.min(8, parts[i].length)); flagged = true; }
  }
  // spaced out letters: "f u c k" / "f.u.c.k"
  const tokens = parts.filter((p) => !/^\s+$/.test(p));
  for (let i = 0; i < tokens.length; i++) {
    let j = i, joined = '';
    while (j < tokens.length && normToken(tokens[j]).length === 1) { joined += normToken(tokens[j]); j++; }
    if (j - i >= 3 && (isBad(joined) || PHRASES.some((p) => joined.includes(p)))) {
      for (let k = i; k < j; k++) tokens[k] = '*';
      flagged = true;
      i = j;
    }
  }
  text = tokens.join(' ');
  // phrases across words
  const compact = norms(text.replace(/\s+/g, ''))[1];
  if (PHRASES.some((p) => compact.includes(norms(p)[1]))) { text = '*'.repeat(Math.min(20, text.length)); flagged = true; }
  // calm down SHOUTING
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 8 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) text = text.toLowerCase();
  return { text, flagged, empty: !text.replace(/[*\s]|\[removed\]|\[link removed\]/g, '') };
}

/** True when a player name must be replaced. */
export function badName(name) {
  if (filterChat(name, 40).flagged) return true;
  // names are often glued together (xXfuckerXx), so also search inside the whole name
  const [light, full] = norms(name);
  return ROOTS_N.some((r) => r.length >= 4 && (light.includes(r) || full.includes(r)));
}
