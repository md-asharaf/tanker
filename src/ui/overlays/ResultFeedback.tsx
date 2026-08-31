import { useEffect } from 'react';
import { useGameStore } from '../../game/gameStore';

export function ResultFeedback() {
  const { phase, lastResult, lastCorrectAnswer } = useGameStore();

  if (phase !== 'resolving') return null;

  const isCorrect = lastResult === 'correct';
  const isWrong   = lastResult === 'wrong';
  const isMiss    = lastResult === 'miss';

  return (
    <div className="overlay" style={{ pointerEvents: 'none' }}>
      <div className="anim-slide-up" style={{ textAlign: 'center' }}>
        <div
          className={`overlay-title ${
            isCorrect ? 'overlay-title--correct' :
            isWrong   ? 'overlay-title--wrong'   :
                        'overlay-title--miss'
          }`}
          style={{ fontSize: 'clamp(28px, 5vw, 48px)', textShadow: '0 0 24px currentColor' }}
        >
          {isCorrect ? '✓ CORRECT!' : isWrong ? '✕ WRONG' : '○ MISS'}
        </div>

        <div
          className={`overlay-score-delta ${
            isCorrect ? 'delta--correct' : isWrong ? 'delta--wrong' : 'delta--miss'
          }`}
        >
          {isCorrect ? '+100' : '−10'}
        </div>

        {(isWrong || isMiss) && lastCorrectAnswer && (
          <div className="overlay-answer">
            Correct answer: <span>{lastCorrectAnswer}</span>
          </div>
        )}
      </div>
    </div>
  );
}
