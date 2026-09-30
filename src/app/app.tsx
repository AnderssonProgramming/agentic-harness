import { AppNav } from './app-nav';
import { useRoute } from './hooks/use-route';
import { NotFound } from './not-found';
import { findRoute, normalizePath, routes } from './routes';

export function App() {
  const { path, navigate } = useRoute();
  const route = findRoute(path);

  return (
    <main className="app">
      <header className="app__header">
        <div>
          <h1>Compass</h1>
          <p>Your onboarding assistant</p>
        </div>
        <AppNav routes={routes} currentPath={normalizePath(path)} onNavigate={navigate} />
      </header>
      {route ? <route.component /> : <NotFound path={path} onNavigate={navigate} />}
    </main>
  );
}
