import { useEffect } from 'react';
import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';
import { OverlayModal } from './OverlayModal';

export function GameOverOverlay() {
  const {
    phase, score, bestStreak, questions,
    restartGame, startNewGame,
  } = useGameStore();

  useEffect(() => {
    if (phase === 'game-over') {
      AudioManager.stopEngine();
      AudioManager.play('gameComplete');
    }
  }, [phase]);

  if (phase !== 'game-over') return null;

  const total     = questions.length;
  const answered  = total;
  const accuracy  = total > 0 ? Math.round((score / (total * 100)) * 100) : 0;

  const handlePlayAgain = () => {
    AudioManager.play('uiClick');
    restartGame();
  };

  const handleNewGame = () => {
    AudioManager.play('uiClick');
    startNewGame();
  };

  return (
    <OverlayModal
      title="🏆 GAME COMPLETE"
      titleType="gold"
      animationClass="anim-slide-up"
      footer={
        <>
          <button className="btn btn--primary" onClick={handlePlayAgain} aria-label="Play again with same questions">
            ↺ PLAY AGAIN
          </button>
          <button className="btn btn--secondary" onClick={handleNewGame} aria-label="Start new game">
            ⊕ NEW GAME
          </button>
        </>
      }
    >
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-label">Total Score</div>
          <div className="stat-value">{score}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Accuracy</div>
          <div className="stat-value">{Math.max(0, accuracy)}%</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Best Streak</div>
          <div className="stat-value" style={{ color: '#ff7700' }}>🔥{bestStreak}</div>
        </div>
        <div className="stat-item">
          <div className="stat-label">Questions</div>
          <div className="stat-value">{answered}/{total}</div>
        </div>
      </div>
    </OverlayModal>
  );
}
