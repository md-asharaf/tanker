import { useState } from 'react';
import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';

export function ControlBar() {
  const { phase, muted, toggleMute, setHintVisible, setPhase } = useGameStore();
  const [bgmOn, setBgmOn] = useState(() => AudioManager.isBgmEnabled());

  const visible =
    phase === 'playing' || phase === 'aiming' || phase === 'firing' ||
    phase === 'resolving' || phase === 'paused' || phase === 'hint';

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

  const handleBgmToggle = () => {
    const next = !bgmOn;
    setBgmOn(next);
    AudioManager.setBgmEnabled(next);
    AudioManager.play('uiClick');
  };

  return (
    <div className="top-utility-bar">
      <button className="ctrl-btn-compact" onClick={handlePause} title="Pause Game (P / Esc)" aria-label="Pause game">
        <span className="btn-icon">⏸</span>
        <span className="btn-text">PAUSE</span>
      </button>

      <button className="ctrl-btn-compact" onClick={handleHint} title="Show Question Hint (H)" aria-label="Show hint">
        <span className="btn-icon">💡</span>
        <span className="btn-text">HINT</span>
      </button>

      <button
        className="ctrl-btn-compact"
        onClick={handleBgmToggle}
        title={bgmOn ? 'Mute Music' : 'Enable Music'}
        aria-label={bgmOn ? 'Mute Music' : 'Enable Music'}
      >
        <span className="btn-icon">🎵</span>
        <span className="btn-text">{bgmOn ? 'BGM ON' : 'BGM OFF'}</span>
      </button>

      <button className="ctrl-btn-compact ctrl-btn-icon-only" onClick={handleMute} title={muted ? 'Unmute Sound (M)' : 'Mute Sound (M)'} aria-label={muted ? 'Unmute' : 'Mute'}>
        <span className="btn-icon">{muted ? '🔇' : '🔊'}</span>
      </button>
    </div>
  );
}

