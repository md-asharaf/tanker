import { useGameStore } from '../../game/gameStore';

export function ResultFeedback() {
  const { phase, lastResult, lastCorrectAnswer } = useGameStore();

  if (phase !== 'resolving') return null;

  const isCorrect = lastResult === 'correct';
  const isWrong   = lastResult === 'wrong';
  const isMiss    = lastResult === 'miss';

  const titleText = isCorrect
    ? 'TARGET DESTROYED'
    : isWrong
    ? 'INCORRECT TARGET'
    : 'MISSED SHOT';

  const deltaText = isCorrect ? '+100' : '−10';

  const themeClass = isCorrect
    ? 'feedback-banner--correct'
    : isWrong
    ? 'feedback-banner--wrong'
    : 'feedback-banner--miss';

  return (
    <div className="feedback-top-container" role="status" aria-live="polite">
      <div className={`feedback-banner ${themeClass}`}>
        <div className="feedback-content">
          <span className="feedback-title">{titleText}</span>
          <span className="feedback-delta">{deltaText}</span>
        </div>

        {(isWrong || isMiss) && lastCorrectAnswer && (
          <div className="feedback-answer">
            ANSWER: <strong>{lastCorrectAnswer}</strong>
          </div>
        )}
      </div>
    </div>
  );
}
