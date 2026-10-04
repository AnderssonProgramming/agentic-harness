import type { Citation } from '../model/citations';

interface SourceChipsProps {
  citations: readonly Citation[];
  /** Opens a known document; the clicked chip is passed so focus can return to it. */
  onOpen: (source: string, chip: HTMLElement) => void;
}

const UNVERIFIED_NOTE = {
  unknown: 'not a known document',
  unchecked: "couldn't be checked",
} as const;

export function SourceChips({ citations, onOpen }: SourceChipsProps) {
  if (citations.length === 0) return null;
  return (
    <div className="sources">
      <span className="sources__label" aria-hidden="true">
        Sources:
      </span>
      <ul className="sources__list" aria-label="Sources">
        {citations.map((citation) => (
          <li key={citation.source}>
            {citation.status === 'known' ? (
              <button
                type="button"
                className="source-chip"
                title={citation.title ?? undefined}
                onClick={(event) => {
                  onOpen(citation.source, event.currentTarget);
                }}
              >
                {citation.source}
              </button>
            ) : (
              <span className="source-chip source-chip--unverified">
                {citation.source}{' '}
                <span className="source-chip__note">({UNVERIFIED_NOTE[citation.status]})</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
