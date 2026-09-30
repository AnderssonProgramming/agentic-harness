interface NotFoundProps {
  path: string;
  onNavigate: (path: string) => void;
}

export function NotFound({ path, onNavigate }: NotFoundProps) {
  return (
    <section className="screen" aria-labelledby="not-found-title">
      <h2 id="not-found-title">Page not found</h2>
      <p>
        There is no screen at <code>{path}</code>.
      </p>
      <button
        type="button"
        className="button"
        onClick={() => {
          onNavigate('/');
        }}
      >
        Back to the chat
      </button>
    </section>
  );
}
