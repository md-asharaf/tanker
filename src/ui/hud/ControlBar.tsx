import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';

interface Props {
  onFire: () => void;
}

export function ControlBar({ onFire }: Props) {
  const { phase, muted, toggleMute, setHintVisible, setPhase } = useGameStore();

  const visible =
    phase === 'playing' || phase === 'aiming' || phase === 'firing';

  if (!visible) return null;

  const handlePause = () => {
    AudioManager.play('uiClick');
    setPhase('paused');
  };

  const handleHint = () => {
    AudioManager.play('uiClick');
    setHintVisible(true);
  };

  const handleMute = () => {
    toggleMute();
    AudioManager.play('uiClick');
  };

  const handleFire = () => {
    AudioManager.play('uiClick');
    onFire();
  };

  const canFire = phase === 'playing' || phase === 'aiming';

  return (
    <div className="control-bar">
      {/* Left buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="ctrl-btn" onClick={handlePause} aria-label="Pause game (P)">
          ⏸ PAUSE
        </button>
        <button className="ctrl-btn" onClick={handleHint} aria-label="Use hint (H)">
          💡 HINT
        </button>
      </div>

      {/* Center: FIRE */}
      {canFire && (
        <button
          className="ctrl-btn ctrl-btn--fire"
          onClick={handleFire}
          aria-label="Fire cannon (Space)"
        >
          🎯 FIRE
        </button>
      )}

      {/* Right: Mute */}
      <button className="ctrl-btn" onClick={handleMute} aria-label={muted ? 'Unmute' : 'Mute'}>
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}
