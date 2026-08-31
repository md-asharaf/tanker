import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';

export function ErrorOverlay() {
  const { phase, errorMessage, startNewGame } = useGameStore();

  if (phase !== 'error') return null;

  const handleRetry = () => {
    AudioManager.play('uiClick');
    startNewGame();
  };

  return (
    <div className="overlay overlay--dim">
      <div className="overlay-card anim-fade-in" style={{ borderColor: 'rgba(232,64,64,0.4)' }}>
        <div className="overlay-title overlay-title--wrong">⚠ GAME ERROR</div>
        <div className="overlay-subtitle">
          Unable to load game.
          <br />
          <span style={{ color: '#e2e8f0', fontSize: 13, marginTop: 6, display: 'block' }}>
            {errorMessage ?? 'Unknown error occurred.'}
          </span>
        </div>
        <div className="btn-row">
          <button
            className="btn btn--danger"
            onClick={handleRetry}
            aria-label="Try again"
          >
            ↺ TRY AGAIN
          </button>
        </div>
      </div>
    </div>
  );
}
