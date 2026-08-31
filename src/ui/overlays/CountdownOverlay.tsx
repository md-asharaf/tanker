import { useEffect, useState } from 'react';
import { useGameStore } from '../../game/gameStore';
import { AudioManager } from '../../audio/AudioManager';
import { GAME_CONFIG } from '../../game/gameConfig';

export function CountdownOverlay() {
  const { phase, setPhase } = useGameStore();
  const [count, setCount] = useState<string>('3');

  useEffect(() => {
    if (phase !== 'countdown') return;

    const d = GAME_CONFIG.feedback.countdownDelay;
    const seq = ['3', '2', '1', 'GO!'];
    let i = 0;

    setCount(seq[0]);
    const interval = setInterval(() => {
      i++;
      if (i < seq.length) {
        setCount(seq[i]);
        if (i === seq.length - 1) {
          AudioManager.play('gameStart');
          setTimeout(() => {
            AudioManager.startEngine();
            setPhase('playing');
          }, d);
        }
      } else {
        clearInterval(interval);
      }
    }, d);

    return () => clearInterval(interval);
  }, [phase, setPhase]);

  if (phase !== 'countdown') return null;

  return (
    <div className="overlay" style={{ background: 'rgba(5,10,18,0.5)' }}>
      <div
        key={count}
        className="countdown"
        style={{ color: count === 'GO!' ? 'var(--col-correct)' : 'var(--col-primary)' }}
      >
        {count}
      </div>
    </div>
  );
}
