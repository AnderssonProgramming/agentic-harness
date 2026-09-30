import { describe, expect, it } from 'vitest';
import { findRoute, normalizePath, routes, type Route } from './routes';

const Empty = () => null;
const table: Route[] = [
  { path: '/', title: 'Home', component: Empty },
  { path: '/knowledge', title: 'Knowledge', component: Empty },
];

describe('routes', () => {
  it('has unique paths that start with a slash', () => {
    const paths = routes.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith('/'))).toBe(true);
  });

  it('serves the chat at the root', () => {
    expect(findRoute('/')?.title).toBe('Chat');
  });
});

describe('normalizePath', () => {
  it('removes trailing slashes but keeps the root', () => {
    expect(normalizePath('/knowledge/')).toBe('/knowledge');
    expect(normalizePath('/knowledge//')).toBe('/knowledge');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('')).toBe('/');
  });
});

describe('findRoute', () => {
  it('matches exact paths, ignoring a trailing slash', () => {
    expect(findRoute('/knowledge/', table)?.title).toBe('Knowledge');
  });

  it('returns undefined for unknown paths and does not match prefixes', () => {
    expect(findRoute('/nope', table)).toBeUndefined();
    expect(findRoute('/knowledge/extra', table)).toBeUndefined();
  });
});
