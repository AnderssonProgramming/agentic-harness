import { ChatScreen } from '../features/chat';

export function App() {
  return (
    <main className="app">
      <header className="app__header">
        <h1>Compass</h1>
        <p>Your onboarding assistant</p>
      </header>
      <ChatScreen />
    </main>
  );
}
