export function parseApiUrl(value: string | undefined, development: boolean): string | null {
  try {
    const url = new URL(value?.trim() ?? '');
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(development && url.protocol === 'http:')) return null;
    return url.href.replace(/\/+$/, '') + '/';
  } catch { return null; }
}

export function sessionStorageKey(apiUrl: string | null): string {
  const namespace = (apiUrl ?? 'unconfigured').split('').map(character => character.charCodeAt(0).toString(16).padStart(4, '0')).join('');
  return `fazendamais.session.${namespace}`;
}

export function legalUrls(siteUrl: string | undefined, development: boolean) {
  // Same public-site fallback as frontend/src/app/layout.tsx. Never derive legal URLs from the API host.
  const site = parseApiUrl(siteUrl ?? 'https://fazendamais.com', development);
  if (!site) return null;
  return { terms: new URL('termos', site).href, privacy: new URL('privacidade', site).href, copyright: new URL('login/license', site).href };
}
