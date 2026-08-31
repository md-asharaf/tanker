import { useRef, useEffect, useState } from 'react';
import { useGameStore } from '../../game/gameStore';

export function ScorePanel() {
  const { score, streak, phase } = useGameStore();
  const [prevScore, setPrevScore] = useState(score);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (score !== prevScore) {
      setPrevScore(score);
      setAnimating(true);
      const t = setTimeout(() => setAnimating(false), 400);
      return () => clearTimeout(t);
    }
  }, [score, prevScore]);

  const visible =
    phase === 'playing' || phase === 'aiming' || phase === 'firing' ||
    phase === 'resolving' || phase === 'paused' || phase === 'hint';

  if (!visible) return null;

  return (
    <div className="score-panel glass">
      <div className="score-label">SCORE</div>
      <div className={`score-value ${animating ? 'score-up' : ''}`}>
        {score.toLocaleString()}
      </div>
      {streak > 0 && (
        <div className="streak-row">
          <span className="streak-icon">🔥</span>
          <span className="streak-value">× {streak}</span>
        </div>
      )}
    </div>
  );
}
