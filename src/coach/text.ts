// Words for the coach screens: Turkish suffixes on names, and the invite link.

const MONTHS_FROM = ['Ocak\'tan', 'Şubat\'tan', 'Mart\'tan', 'Nisan\'dan', 'Mayıs\'tan', 'Haziran\'dan', 'Temmuz\'dan', 'Ağustos\'tan', 'Eylül\'den', 'Ekim\'den', 'Kasım\'dan', 'Aralık\'tan'];

/** "4 Ekim'den beri", with the suffix the month takes. */
export function sinceText(isoDate: string): string {
  const date = new Date(isoDate.length > 10 ? isoDate : `${isoDate}T12:00:00`);
  return `${date.getDate()} ${MONTHS_FROM[date.getMonth()]} beri`;
}

/** "Elif'in", "Can'ın", "Ece'nin": the genitive, by the name's last vowel. */
export function possessive(name: string): string {
  const vowels = name.toLocaleLowerCase('tr-TR').match(/[aıoueiöü]/g);
  const last = vowels?.[vowels.length - 1] ?? 'e';
  const suffix = 'aı'.includes(last) ? 'ın' : 'ou'.includes(last) ? 'un' : 'öü'.includes(last) ? 'ün' : 'in';
  return /[aıoueiöü]$/i.test(name) ? `${name}'n${suffix}` : `${name}'${suffix}`;
}

/** "Elif'e", "Can'a", "Ece'ye": the dative, by the name's last vowel. */
export function dative(name: string): string {
  const vowels = name.toLocaleLowerCase('tr-TR').match(/[aıoueiöü]/g);
  const last = vowels?.[vowels.length - 1] ?? 'e';
  const suffix = 'aıou'.includes(last) ? 'a' : 'e';
  return /[aıoueiöü]$/i.test(name) ? `${name}'y${suffix}` : `${name}'${suffix}`;
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export const INVITE_DAYS = 7;
export const inviteUrl = (code: string) => `https://dogulusal.github.io/Tracking-My-Volume/katil/${code}`;

// Letters that cannot be misread when someone types the code by hand.
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newInviteCode = () => {
  const random = new Uint32Array(8);
  crypto.getRandomValues(random);
  return Array.from(random, value => CODE_LETTERS[value % CODE_LETTERS.length]).join('');
};
