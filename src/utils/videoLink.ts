/**
 * A movement's video link as typed: '' clears it, a web address without its
 * scheme gets https://, anything that is not an http(s) address is null.
 * Only web links are opened, so a pasted "javascript:" can never run.
 */
export function videoLink(typed: string): string | null {
  const text = typed.trim();
  if (!text) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname.includes('.') ? url.href : null;
  } catch {
    return null;
  }
}
