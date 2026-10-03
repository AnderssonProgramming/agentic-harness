import { describe, expect, it } from 'vitest';
import { assessDependencies, problemPackage, reachableOutside } from './dependency-scope.mjs';

// A small tree shaped like Compass's: the app's own deps, plus a deploy tool with its own subtree.
const tree = {
  react: { version: '19.0.0', dependencies: { scheduler: { version: '0.25.0' } } },
  vite: { version: '8.0.0', dependencies: { micromatch: { version: '4.0.8' } } },
  'netlify-cli': {
    version: '27.10.2',
    dependencies: {
      '@netlify/blobs': { version: '11.1.3' },
      micromatch: { version: '4.0.8' },
      ipx: { version: '3.0.0', dependencies: { unstorage: { version: '1.0.0' } } },
    },
  },
};
const roots = ['netlify-cli'];

describe('reachableOutside', () => {
  it('excludes packages reachable only through an accepted root', () => {
    const outside = reachableOutside(tree, roots);
    expect(outside.has('scheduler')).toBe(true);
    expect(outside.has('@netlify/blobs')).toBe(false);
    expect(outside.has('unstorage')).toBe(false);
  });

  it('walks the full entry when a deduped stub of it comes first', () => {
    const deduped = {
      'netlify-cli': {
        version: '27.10.2',
        dependencies: {
          ipx: { version: '3.0.0' }, // npm ls's deduped stub: no children
          '@netlify/images': {
            version: '1.0.0',
            dependencies: {
              ipx: { version: '3.0.0', dependencies: { sharp: { version: '0.34.5' } } },
            },
          },
        },
      },
    };
    const everywhere = reachableOutside(deduped, []);
    expect(everywhere.has('sharp')).toBe(true);
    expect(
      assessDependencies({ tree: deduped, roots, advisories: { sharp: {} } }).advisoriesOutside,
    ).toEqual([]);
  });

  it('keeps a package shared by the app and the tool', () => {
    expect(reachableOutside(tree, roots).has('micromatch')).toBe(true);
  });
});

describe('problemPackage', () => {
  it.each([
    ['invalid: @netlify/blobs@11.1.3 C:\\x\\node_modules\\@netlify\\blobs', '@netlify/blobs'],
    ['missing: left-pad@^1.0.0, required by app@1.0.0', 'left-pad'],
    ['extraneous: @adobe/css-tools@ C:\\x', '@adobe/css-tools'],
  ])('reads %s', (line, name) => {
    expect(problemPackage(line)).toBe(name);
  });

  it('returns null for a line it cannot attribute', () => {
    expect(problemPackage('something unexpected')).toBeNull();
  });
});

describe('assessDependencies', () => {
  it('contains a problem inside the accepted tool (the real @netlify/blobs case)', () => {
    const result = assessDependencies({
      tree,
      roots,
      problems: ['invalid: @netlify/blobs@11.1.3 C:\\x'],
    });
    expect(result.problemsOutside).toEqual([]);
    expect(result.problemsInside).toBe(1);
  });

  it('fails a problem in a package the app can reach', () => {
    const result = assessDependencies({
      tree,
      roots,
      problems: ['invalid: scheduler@0.25.0 C:\\x'],
    });
    expect(result.problemsOutside).toHaveLength(1);
  });

  it('never assumes a missing package is contained', () => {
    const result = assessDependencies({
      tree,
      roots,
      problems: ['missing: left-pad@^1.0.0, required by netlify-cli@27.10.2'],
    });
    expect(result.problemsOutside).toHaveLength(1);
  });

  it('never assumes an unreadable problem is contained', () => {
    const result = assessDependencies({ tree, roots, problems: ['something unexpected'] });
    expect(result.problemsOutside).toEqual(['something unexpected']);
  });

  it('fails an advisory the app can reach, even if the tool also uses it', () => {
    const result = assessDependencies({ tree, roots, advisories: { micromatch: {}, ipx: {} } });
    expect(result.advisoriesOutside).toEqual(['micromatch']);
  });

  it('accepts nothing when no root is accepted', () => {
    const result = assessDependencies({
      tree,
      roots: [],
      problems: ['invalid: @netlify/blobs@11.1.3 C:\\x'],
      advisories: { ipx: {} },
    });
    expect(result.problemsOutside).toHaveLength(1);
    expect(result.advisoriesOutside).toEqual(['ipx']);
  });
});
