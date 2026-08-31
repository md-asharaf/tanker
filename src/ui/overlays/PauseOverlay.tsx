import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';

export function PauseOverlay() {
  const { phase, setPhase, restartGame, newGame } = useGameStore();

  if (phase !== 'paused') return null;

  const resume = () => { AudioManager.play('uiClick'); setPhase('playing'); };
  const handleRestart = () => { AudioManager.play('uiClick'); restartGame(); };
  const handleNew     = () => { AudioManager.play('uiClick'); newGame(); };

  return (
    <div className="overlay overlay--dim">
      <div className="overlay-card anim-fade-in">
        <div className="overlay-title overlay-title--gold">⏸ PAUSED</div>
        <div className="overlay-subtitle">Mission suspended. Resume when ready.</div>

        <div className="btn-row" style={{ flexDirection: 'column', gap: 10 }}>
          <button className="btn btn--primary" onClick={resume} aria-label="Resume game">
            ▶ RESUME
          </button>
          <button className="btn btn--secondary" onClick={handleRestart} aria-label="Restart game">
            ↺ RESTART MISSION
          </button>
          <button className="btn btn--secondary" onClick={handleNew} aria-label="Start new game">
            ⊕ NEW GAME
          </button>
        </div>

        <div style={{ marginTop: 20, fontSize: 11, color: 'var(--col-text-dim)', fontFamily: 'var(--font-heading)', letterSpacing: '0.08em' }}>
          P / ESC to resume
        </div>
      </div>
    </div>
  );
}
