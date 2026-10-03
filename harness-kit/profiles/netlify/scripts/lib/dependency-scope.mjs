// Decides whether dependency risks are contained in packages the PO accepted
// (harness.config.json → release.acceptedAdvisoryRoots, docs/audit/accepted-risks.md).
// Pure: the release gate feeds it the parsed output of `npm ls --all --json` and `npm audit --json`.

// Every package name reachable from a top-level dependency that is NOT an accepted root.
export const reachableOutside = (tree, roots) => {
  const reachable = new Set();
  const seen = new Set();
  const walk = (deps) => {
    for (const [name, node] of Object.entries(deps ?? {})) {
      reachable.add(name);
      // npm ls prints a repeated package once in full and elsewhere as a "deduped" stub with no
      // children. Only a node with children may mark the package as walked; otherwise a stub seen
      // first would hide the whole subtree under the full entry.
      if (!node?.dependencies) continue;
      const key = `${name}@${String(node.version)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      walk(node.dependencies);
    }
  };
  walk(Object.fromEntries(Object.entries(tree ?? {}).filter(([name]) => !roots.includes(name))));
  return reachable;
};

// npm ls problems look like "invalid: @netlify/blobs@11.1.3 C:\…" or "missing: foo@^1.0.0, required by …".
// Returns the package names, or null for a line this function doesn't understand.
export const problemPackage = (problem) =>
  /^[a-z ]+: ((?:@[^@\s/]+\/)?[^@\s]+)@/.exec(problem)?.[1] ?? null;

export const assessDependencies = ({ tree, problems = [], advisories = {}, roots }) => {
  const outside = reachableOutside(tree, roots);
  const everywhere = reachableOutside(tree, []);
  // Contained means: present in the tree, and reachable only through accepted roots. A package
  // that isn't in the tree at all (e.g. "missing") is never assumed to be contained.
  const isOutside = (name) => !everywhere.has(name) || outside.has(name);
  const advisoriesOutside = Object.keys(advisories).filter(isOutside);
  const unreadable = problems.filter((p) => problemPackage(p) === null);
  const problemsOutside = problems.filter((p) => {
    const name = problemPackage(p);
    return name !== null && isOutside(name);
  });
  return {
    advisoriesOutside,
    // A problem the gate can't attribute to a package is never assumed to be contained.
    problemsOutside: [...problemsOutside, ...unreadable],
    problemsInside: problems.length - problemsOutside.length - unreadable.length,
  };
};
