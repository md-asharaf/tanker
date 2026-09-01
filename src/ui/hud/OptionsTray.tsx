import { useGameStore } from '../../game/gameStore';
import { ENEMY_PALETTES } from '../../game/entities/EnemyTank';

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function OptionsTray() {
  const { questions, currentQuestionIndex, phase, lastResult, lastCorrectAnswer } = useGameStore();

  const visible =
    phase === 'playing' || phase === 'aiming' || phase === 'firing' ||
    phase === 'resolving' || phase === 'hint';

  if (!visible || !questions.length) return null;

  const currentQ = questions[currentQuestionIndex];
  if (!currentQ || !currentQ.options) return null;

  return (
    <div className="options-tray" aria-label="Trivia answer options">
      <div className="options-grid">
        {currentQ.options.map((optText, idx) => {
          const letter = OPTION_LETTERS[idx] || String.fromCharCode(65 + idx);
          const palette = ENEMY_PALETTES[idx % ENEMY_PALETTES.length];

          let statusClass = '';
          if (phase === 'resolving') {
            if (optText === lastCorrectAnswer) {
              statusClass = 'opt-card--correct';
            } else if (lastResult === 'wrong') {
              statusClass = 'opt-card--wrong';
            }
          }

          return (
            <div
              key={`opt-${idx}`}
              className={`option-card ${statusClass}`}
              style={{
                '--opt-primary': palette.body,
                '--opt-light': palette.accent,
              } as React.CSSProperties}
              aria-label={`Option ${letter}: ${optText}`}
            >
              {/* Colored Letter Badge */}
              <div className="opt-letter-badge" style={{ backgroundColor: palette.body, borderColor: palette.accent }}>
                <span>{letter}</span>
              </div>

              {/* Option Text */}
              <div className="opt-text-label">
                {optText}
              </div>

              {/* Result Indicator Badge */}
              {phase === 'resolving' && optText === lastCorrectAnswer && (
                <div className="opt-status-badge opt-status--correct">
                  ✔
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
