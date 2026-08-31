import { useCallback, useRef, useState, useEffect } from 'react';
import { GameScene, type GameSceneHandle } from './game/GameScene';
import { useGameStore } from './game/gameStore';
import { AudioManager } from './audio/AudioManager';

// HUD
import { QuestionPanel } from './ui/hud/QuestionPanel';
import { ScorePanel } from './ui/hud/ScorePanel';
import { ControlBar } from './ui/hud/ControlBar';

// Overlays
import { LoadingOverlay } from './ui/overlays/LoadingOverlay';
import { CountdownOverlay } from './ui/overlays/CountdownOverlay';
import { ResultFeedback } from './ui/overlays/ResultFeedback';
import { PauseOverlay } from './ui/overlays/PauseOverlay';
import { HintModal } from './ui/overlays/HintModal';
import { GameOverOverlay } from './ui/overlays/GameOverOverlay';
import { ErrorOverlay } from './ui/overlays/ErrorOverlay';

import './styles/index.css';

// ─────────────────────────────────────────────────────────────────
//  Pro Controls Guide (Desktop)
// ─────────────────────────────────────────────────────────────────
function KeyboardGuide() {
  const { phase } = useGameStore();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (phase === 'playing') {
      const t = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  const isActive = phase === 'playing' || phase === 'aiming';
  if (!isActive || !visible) return null;

  const hints = [
    { key: 'Mouse Cursor', desc: 'Aim 360°' },
    { key: 'Click / Space', desc: 'Fire Cannon' },
    { key: 'A / D', desc: 'Drive Left / Right' },
    { key: 'P / Esc', desc: 'Pause' },
    { key: 'H', desc: 'Hint' },
    { key: 'M', desc: 'Mute' },
  ];

  return (
    <div
      className="keyboard-guide-hud"
      style={{
        position: 'absolute',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 12,
        pointerEvents: 'none',
        opacity: 0.85,
        transition: 'opacity 1s ease',
        zIndex: 15,
      }}
    >
      {hints.map((h) => (
        <div
          key={h.key}
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            borderRadius: 8,
            padding: '4px 10px',
            color: '#e2e8f0',
            fontFamily: 'var(--font-heading)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span style={{ color: 'var(--col-gold)', marginRight: 6 }}>{h.key}</span>
          <span>{h.desc}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Mobile controls — Pure Dual Thumb Layout (No duplicate buttons)
// ─────────────────────────────────────────────────────────────────
interface MobileControlsProps {
  onLeftStart: () => void;
  onLeftEnd: () => void;
  onRightStart: () => void;
  onRightEnd: () => void;
  onFire: () => void;
}

function MobileControls({
  onLeftStart, onLeftEnd, onRightStart, onRightEnd, onFire,
}: MobileControlsProps) {
  const { phase } = useGameStore();
  const visible =
    phase === 'playing' || phase === 'aiming' || phase === 'firing' ||
    phase === 'resolving' || phase === 'hint';
  if (!visible) return null;

  return (
    <div className="mobile-controls" aria-label="Mobile game controls">
      {/* Left thumb — Movement */}
      <div className="move-group">
        <button
          className="move-btn"
          aria-label="Move tank left"
          onTouchStart={(e) => { e.preventDefault(); onLeftStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); onLeftEnd(); }}
          onMouseDown={onLeftStart}
          onMouseUp={onLeftEnd}
          onMouseLeave={onLeftEnd}
        >◀</button>

        <button
          className="move-btn"
          aria-label="Move tank right"
          onTouchStart={(e) => { e.preventDefault(); onRightStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); onRightEnd(); }}
          onMouseDown={onRightStart}
          onMouseUp={onRightEnd}
          onMouseLeave={onRightEnd}
        >▶</button>
      </div>

      {/* Right thumb — Dedicated Arcade Fire Button */}
      <div className="fire-group">
        <button
          className="fire-btn-mobile"
          aria-label="Fire cannon"
          onTouchStart={(e) => { e.preventDefault(); onFire(); }}
          onMouseDown={(e) => { e.preventDefault(); onFire(); }}
        >
          🎯<br />FIRE
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Main App
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const sceneRef = useRef<GameSceneHandle>(null);

  // Fire action
  const handleFire = useCallback(() => {
    sceneRef.current?.triggerFire();
  }, []);

  // Desktop-only click-to-fire on game canvas (touchscreens only fire via the dedicated FIRE button!)
  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    // 1. Strictly ignore touch events / mobile devices
    const isTouchDevice =
      ('ontouchstart' in window) ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isTouchDevice) return;

    // 2. Ignore clicks on buttons, HUD overlays, or control bars
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('.arcade-question-header') ||
      target.closest('.score-panel') ||
      target.closest('.overlay-card') ||
      target.closest('.top-utility-bar') ||
      target.closest('.mobile-controls')
    ) {
      return;
    }
    handleFire();
  }, [handleFire]);

  // Mobile movement callbacks
  const handleLeftStart = useCallback(() => { sceneRef.current?.setMobileKeys({ left: true }); }, []);
  const handleLeftEnd = useCallback(() => { sceneRef.current?.setMobileKeys({ left: false }); }, []);
  const handleRightStart = useCallback(() => { sceneRef.current?.setMobileKeys({ right: true }); }, []);
  const handleRightEnd = useCallback(() => { sceneRef.current?.setMobileKeys({ right: false }); }, []);

  return (
    <div className="game-root" onMouseDown={handleCanvasClick}>
      {/* 3D Game Scene */}
      <GameScene ref={sceneRef} />

      {/* HUD Layer */}
      <div className="hud-layer">
        <QuestionPanel />
        <ScorePanel />
        <ControlBar />
        <KeyboardGuide />
        <MobileControls
          onLeftStart={handleLeftStart}
          onLeftEnd={handleLeftEnd}
          onRightStart={handleRightStart}
          onRightEnd={handleRightEnd}
          onFire={handleFire}
        />
      </div>

      {/* Overlays */}
      <LoadingOverlay />
      <CountdownOverlay />
      <ResultFeedback />
      <PauseOverlay />
      <HintModal />
      <GameOverOverlay />
      <ErrorOverlay />
    </div>
  );
}
