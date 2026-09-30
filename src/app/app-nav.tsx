import type { MouseEvent } from 'react';
import type { Route } from './routes';

interface AppNavProps {
  routes: readonly Route[];
  currentPath: string;
  onNavigate: (path: string) => void;
}

export function AppNav({ routes, currentPath, onNavigate }: AppNavProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>, path: string) {
    // Let the browser handle new-tab and new-window clicks.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <nav className="app-nav" aria-label="Main">
      {routes.map((route) => (
        <a
          key={route.path}
          href={route.path}
          className="app-nav__link"
          aria-current={route.path === currentPath ? 'page' : undefined}
          onClick={(event) => {
            handleClick(event, route.path);
          }}
        >
          {route.title}
        </a>
      ))}
    </nav>
  );
}
