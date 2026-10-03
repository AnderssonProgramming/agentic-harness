import { checkDraft } from '../model/message';

interface StarterQuestionsProps {
  questions: readonly string[];
  /** Sends the question through the same path as typing it and pressing Enter. */
  onPick: (question: string) => void;
}

export function StarterQuestions({ questions, onPick }: StarterQuestionsProps) {
  return (
    <ul className="starter-questions" aria-label="Suggested questions">
      {questions.map((question) => (
        <li key={question}>
          <button
            type="button"
            className="starter-questions__button"
            onClick={() => {
              if (checkDraft(question).valid) onPick(question);
            }}
          >
            {question}
          </button>
        </li>
      ))}
    </ul>
  );
}
