/**
 * Hash routing keeps the app deployable as static files (no server rewrite
 * rules) while still giving every tool a shareable URL: `#/rotate`.
 */

import { useEffect, useState } from 'react';

export type Route = {
  /** Path inside the hash, e.g. `/merge` or `/s/<token>`. */
  path: string;
  /** Path split on slashes, e.g. `['s', '<token>']`. */
  segments: string[];
  query: URLSearchParams;
};

export const HOME_ROUTE = '/';

export function parseHash(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const path = pathPart === '' ? HOME_ROUTE : pathPart;
  const segments = path.split('/').filter((segment) => segment !== '');
  return { path, segments, query: new URLSearchParams(queryPart) };
}

export function currentRoute(): Route {
  return parseHash(window.location.hash);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const handleChange = () => setRoute(currentRoute());
    handleChange();
    return subscribe(handleChange);
  }, []);

  return route;
}

export function navigate(path: string): void {
  const next = path.startsWith('#') ? path.slice(1) : path;
  const target = next.startsWith('/') ? next : `/${next}`;
  if (window.location.hash === `#${target}`) return;
  window.location.hash = target;
  window.scrollTo({ top: 0 });
}

export function hrefFor(path: string): string {
  return `#${path.startsWith('/') ? path : `/${path}`}`;
}
