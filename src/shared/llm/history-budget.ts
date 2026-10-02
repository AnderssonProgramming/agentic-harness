import type { ChatTurn } from './protocol.ts';

export interface FittedHistory {
  /** What the model receives: merged turns, newest first to fit, starting with a user turn. */
  turns: ChatTurn[];
  /** Index of the first message those turns come from; the messages before it are never used. */
  from: number;
  /** False when the newest merged turn alone exceeds the budget; `turns` is then only that turn. */
  fits: boolean;
}

/**
 * The one history budget, used by the server to decide what reaches the model and by the browser
 * to send nothing more (P-01). Consecutive turns from the same role are merged (separators count),
 * blank turns are skipped, and the oldest merged turns are dropped first.
 */
export function fitHistory(messages: readonly ChatTurn[], maxChars: number): FittedHistory {
  const merged: { turn: ChatTurn; from: number }[] = [];
  messages.forEach((turn, index) => {
    if (turn.content.trim() === '') return;
    const previous = merged.at(-1);
    if (previous?.turn.role === turn.role) {
      previous.turn = { role: turn.role, content: `${previous.turn.content}\n\n${turn.content}` };
    } else {
      merged.push({ turn: { role: turn.role, content: turn.content }, from: index });
    }
  });

  const newest = merged.at(-1);
  if (newest === undefined) return { turns: [], from: messages.length, fits: true };
  if (newest.turn.content.length > maxChars) {
    return { turns: [newest.turn], from: newest.from, fits: false };
  }

  let start = merged.length;
  let used = 0;
  for (const group of [...merged].reverse()) {
    if (used + group.turn.content.length > maxChars) break;
    used += group.turn.content.length;
    start -= 1;
  }
  while (merged[start]?.turn.role === 'assistant') start += 1;
  const kept = merged.slice(start);
  return {
    turns: kept.map((group) => group.turn),
    from: kept[0]?.from ?? messages.length,
    fits: true,
  };
}
