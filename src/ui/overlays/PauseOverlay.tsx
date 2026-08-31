import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';
import { OverlayModal } from './OverlayModal';

export function PauseOverlay() {
  const { phase, setPhase, restartGame, startNewGame } = useGameStore();

  if (phase !== 'paused') return null;

  const handleResume = () => {
    AudioManager.play('uiClick');
    setPhase('playing');
  };

  const handleRestart = () => {
    AudioManager.play('uiClick');
    restartGame();
  };

  const handleNewGame = () => {
    AudioManager.play('uiClick');
    startNewGame();
  };

  return (
    <OverlayModal
      title="⏸ PAUSED"
      titleType="gold"
      subtitle="Game paused. Resume when ready."
      animationClass="anim-fade-in"
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          <button className="btn btn--primary" onClick={handleResume} aria-label="Resume game">
            ▶ RESUME
          </button>
          <button className="btn btn--secondary" onClick={handleRestart} aria-label="Restart game">
            ↺ RESTART GAME
          </button>
          <button className="btn btn--secondary" onClick={handleNewGame} aria-label="Start new game">
            ⊕ NEW GAME
          </button>
        </div>
      }
    >
      <div style={{ marginTop: 8, marginBottom: 12, fontSize: 11, color: '#94a3b8', fontFamily: 'var(--font-heading)', letterSpacing: '0.08em' }}>
        P / ESC to resume
      </div>
    </OverlayModal>
  );
}
