import type { ComponentType } from 'react';
import { ChatScreen } from '../features/chat';
// new-route: add imports above this line

export interface Route {
  path: `/${string}`;
  title: string;
  component: ComponentType;
}

export const routes: readonly Route[] = [
  { path: '/', title: 'Chat', component: ChatScreen },
  // new-route: add routes above this line
];

export function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

export function findRoute(pathname: string, table: readonly Route[] = routes): Route | undefined {
  const path = normalizePath(pathname);
  return table.find((route) => route.path === path);
}
