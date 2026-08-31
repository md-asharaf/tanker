import { useGameStore } from '../../game/gameStore';

export function QuestionPanel() {
  const { questions, currentQuestionIndex, phase } = useGameStore();

  const visible =
    phase === 'playing' || phase === 'aiming' || phase === 'firing' ||
    phase === 'resolving' || phase === 'paused' || phase === 'hint';

  if (!visible || !questions.length) return null;

  const q     = questions[currentQuestionIndex];
  const total = questions.length;
  const num   = currentQuestionIndex + 1;

  return (
    <div className="arcade-question-header">
      <div className="arcade-question-badge">
        <span className="q-tag">TARGET {String(num).padStart(2, '0')}</span>
        <span className="q-total">OF {total}</span>
      </div>
      <div className="arcade-question-prompt">
        {q.prompt}
      </div>
    </div>
  );
}
