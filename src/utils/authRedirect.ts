/** One allow-listed callback for every route; never forward query strings or tokens. */
export function authRedirectUrl(origin: string, basePath: string): string {
  const url = new URL(origin);
  url.pathname = `/${basePath.replace(/^\/+|\/+$/g, '')}/`.replace(/\/+/g, '/');
  url.search = '';
  url.hash = '';
  return url.href;
}
