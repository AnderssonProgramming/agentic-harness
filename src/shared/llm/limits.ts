// Limits shared by the browser, which never builds a request that breaks them, and the server,
// which rejects one that does with "bad_request" (audit findings F-01, F-02, F-04).

/** Characters in one user message. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Characters in one to-do's text. */
export const MAX_TODO_LENGTH = 200;

/** Open to-dos sent with one request. */
export const MAX_TODOS_SENT = 50;

/** Characters in one to-do's id: the browser's ids are `crypto.randomUUID()`, always 36 (LLM-05). */
export const MAX_TODO_ID_LENGTH = 36;
