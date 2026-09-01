import { useCallback, useRef, useState, useEffect } from 'react';
import { GameScene, type GameSceneHandle } from './game/GameScene';
import { useGameStore } from './game/gameStore';

// HUD
import { QuestionPanel } from './ui/hud/QuestionPanel';
import { ScorePanel } from './ui/hud/ScorePanel';
import { ControlBar } from './ui/hud/ControlBar';
import { OptionsTray } from './ui/hud/OptionsTray';

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
      const t = setTimeout(() => setVisible(false), 5500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase]);

  const isActive = phase === 'playing' || phase === 'aiming';
  if (!isActive || !visible) return null;

  const hints = [
    { key: 'Hold & Drag', desc: 'Aim 3D Cannon' },
    { key: 'FIRE Button / Space', desc: 'Shoot Artillery' },
    { key: 'A / D (◀ ▶)', desc: 'Drive Ridge' },
    { key: 'P / Esc', desc: 'Pause' },
    { key: 'H', desc: 'Hint' },
    { key: 'M', desc: 'Mute' },
  ];

  return (
    <div
      className="keyboard-guide-hud"
      style={{
        position: 'absolute',
        bottom: 84,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 10,
        pointerEvents: 'none',
        opacity: 0.9,
        transition: 'opacity 1s ease',
        zIndex: 15,
      }}
    >
      {hints.map((h) => (
        <div
          key={h.key}
          style={{
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: 8,
            padding: '4px 10px',
            color: '#e2e8f0',
            fontFamily: 'var(--font-heading)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(6px)',
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
//  Desktop Arcade Fire Button
// ─────────────────────────────────────────────────────────────────
function DesktopFireButton({ onFire }: { onFire: () => void }) {
  const { phase } = useGameStore();
  const isActive = phase === 'playing' || phase === 'aiming';
  if (!isActive) return null;

  return (
    <div className="desktop-fire-container">
      <button
        className="desktop-fire-btn"
        aria-label="Fire Cannon"
        onClick={(e) => {
          e.stopPropagation();
          onFire();
        }}
      >
        <span className="fire-icon">💥</span>
        <span className="fire-text">FIRE</span>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Mobile controls — Dual Thumb Layout
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
      {/* Left thumb — Movement buttons */}
      <div className="move-group">
        <button
          className="move-btn"
          aria-label="Move tank left"
          onTouchStart={(e) => { e.preventDefault(); onLeftStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); onLeftEnd(); }}
          onTouchCancel={(e) => { e.preventDefault(); onLeftEnd(); }}
          onMouseDown={onLeftStart}
          onMouseUp={onLeftEnd}
          onMouseLeave={onLeftEnd}
        >◀</button>

        <button
          className="move-btn"
          aria-label="Move tank right"
          onTouchStart={(e) => { e.preventDefault(); onRightStart(); }}
          onTouchEnd={(e) => { e.preventDefault(); onRightEnd(); }}
          onTouchCancel={(e) => { e.preventDefault(); onRightEnd(); }}
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
          onTouchEnd={(e) => { e.preventDefault(); }}
          onTouchCancel={(e) => { e.preventDefault(); }}
          onMouseDown={(e) => { e.preventDefault(); onFire(); }}
        >
          🎯<br />FIRE
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Procedural Confetti Overlay for Victory & High Streaks
// ─────────────────────────────────────────────────────────────────
function ConfettiCelebration() {
  const { phase } = useGameStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (phase !== 'game-over') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 4,
      vy: 3 + Math.random() * 5,
      size: 6 + Math.random() * 8,
      color: ['#ffd54f', '#4caf50', '#29b6f6', '#ab47bc', '#ff5252'][Math.floor(Math.random() * 5)],
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 12,
    }));

    let animId: number;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vrot;
        if (p.y > canvas.height + 20) p.y = -20;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();

    return () => cancelAnimationFrame(animId);
  }, [phase]);

  if (phase !== 'game-over') return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 55,
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
//  Flash Screen Vignette for Damage & Hits
// ─────────────────────────────────────────────────────────────────
function ScreenVignette() {
  const { lastResult, phase } = useGameStore();
  const [flashType, setFlashType] = useState<'hit' | 'miss' | null>(null);

  useEffect(() => {
    if (phase === 'resolving') {
      if (lastResult === 'correct') {
        setFlashType('hit');
      } else if (lastResult === 'wrong' || lastResult === 'miss') {
        setFlashType('miss');
      }
      const t = setTimeout(() => setFlashType(null), 350);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [phase, lastResult]);

  if (!flashType) return null;

  const bg =
    flashType === 'hit'
      ? 'radial-gradient(ellipse at center, rgba(76, 175, 80, 0) 40%, rgba(76, 175, 80, 0.45) 100%)'
      : 'radial-gradient(ellipse at center, rgba(244, 67, 54, 0) 40%, rgba(244, 67, 54, 0.55) 100%)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: bg,
        pointerEvents: 'none',
        zIndex: 40,
        animation: 'vignetteFlash 0.35s ease-out forwards',
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────
//  Main App Component
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const sceneRef = useRef<GameSceneHandle>(null);
  const { startNewGame } = useGameStore();

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const handleFire = useCallback(() => {
    sceneRef.current?.triggerFire();
  }, []);

  // Mobile movement callbacks
  const handleLeftStart = useCallback(() => { sceneRef.current?.setMobileKeys({ left: true }); }, []);
  const handleLeftEnd = useCallback(() => { sceneRef.current?.setMobileKeys({ left: false }); }, []);
  const handleRightStart = useCallback(() => { sceneRef.current?.setMobileKeys({ right: true }); }, []);
  const handleRightEnd = useCallback(() => { sceneRef.current?.setMobileKeys({ right: false }); }, []);

  return (
    <div className="game-root">
      {/* 3D Game Scene */}
      <GameScene ref={sceneRef} />

      {/* Screen Hit Flash Vignette */}
      <ScreenVignette />

      {/* HUD Layer */}
      <div className="hud-layer">
        <QuestionPanel />
        <ScorePanel />
        <ControlBar />

        {/* Helicopter Trivia Style Bottom Options Tray (Informational Legend) */}
        <OptionsTray />

        <KeyboardGuide />
        <DesktopFireButton onFire={handleFire} />
        <MobileControls
          onLeftStart={handleLeftStart}
          onLeftEnd={handleLeftEnd}
          onRightStart={handleRightStart}
          onRightEnd={handleRightEnd}
          onFire={handleFire}
        />
      </div>

      {/* Victory Confetti */}
      <ConfettiCelebration />

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
