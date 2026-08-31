import {
  useRef,
  useState,
  useCallback,
  useMemo,
  useEffect,
  forwardRef,
  useImperativeHandle,
  Suspense,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Terrain, getTerrainHeight } from './scene/Terrain';
import { Environment } from './scene/Environment';
import { PlayerTank, type PlayerTankHandle } from './entities/PlayerTank';
import { EnemyTank, type EnemyTankHandle } from './entities/EnemyTank';
import { Projectile } from './entities/Projectile';
import { Explosion } from './entities/Explosion';
import { useKeyboard, type KeyState } from '../controls/useKeyboard';
import { useGameStore } from './gameStore';
import { GAME_CONFIG } from './gameConfig';
import { AudioManager } from '../audio/AudioManager';
import { randFloat } from '../utils/math';
import type { TankTarget } from './gameTypes';

// ─────────────────────────────────────────────────────────────────
//  Public handle exposed by GameScene
// ─────────────────────────────────────────────────────────────────
export interface GameSceneHandle {
  /** Update external touch key state from UI overlay */
  setMobileKeys:  (keys: Partial<KeyState>) => void;
  /** Direct cannon elevation control */
  setCannonAngle: (angle: number) => void;
  /** Let App trigger fire */
  triggerFire:    () => void;
}

// ─────────────────────────────────────────────────────────────────
//  Inner scene (inside R3F context)
// ─────────────────────────────────────────────────────────────────
interface SceneInnerProps {
  externalKeys:   React.MutableRefObject<KeyState>;
  fireSignal:     React.MutableRefObject<boolean>;
  playerRef:      React.RefObject<PlayerTankHandle>;
}

interface ProjectileState {
  id:       number;
  origin:   THREE.Vector3;
  velocity: THREE.Vector3;
}

interface ExplosionItem {
  id:   number;
  pos:  THREE.Vector3;
  type: 'tank' | 'terrain';
}

// ── Floating Score Popup in 3D Space ─────────────────────────────
interface FloatingScoreItem {
  id: number;
  text: string;
  color: string;
  pos: THREE.Vector3;
  age: number;
}

const scoreTextureCache = new Map<string, THREE.CanvasTexture>();

function getScoreCanvasTexture(text: string, color: string): THREE.CanvasTexture {
  const key = `${text}_${color}`;
  if (scoreTextureCache.has(key)) return scoreTextureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = '900 48px "Orbitron", sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = color;
    ctx.fillText(text, 128, 48);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.strokeText(text, 128, 48);
  }

  const texture = new THREE.CanvasTexture(canvas);
  scoreTextureCache.set(key, texture);
  return texture;
}

function FloatingScoreSprite({ item }: { item: FloatingScoreItem }) {
  const spriteRef = useRef<THREE.Sprite>(null);
  const texture = useMemo(() => getScoreCanvasTexture(item.text, item.color), [item.text, item.color]);

  useFrame((_, delta) => {
    if (!spriteRef.current) return;
    const dt = Math.min(delta, 0.05);
    spriteRef.current.position.y += dt * 3.2;
    const scale = 1.0 + Math.sin(Math.min(1, item.age * 3) * Math.PI) * 0.25;
    spriteRef.current.scale.set(3.6 * scale, 1.35 * scale, 1);
  });

  return (
    <sprite
      ref={spriteRef}
      position={[item.pos.x, item.pos.y, 2.5]}
      scale={[3.6, 1.35, 1]}
      renderOrder={999}
    >
      <spriteMaterial
        map={texture}
        transparent
        depthTest={false}
        depthWrite={false}
        opacity={Math.max(0, 1 - item.age / 1.1)}
      />
    </sprite>
  );
}


function SceneInner({ externalKeys, fireSignal, playerRef }: SceneInnerProps) {
  const {
    phase, questions, currentQuestionIndex, questionSessionId,
    muted, streak, resolveShot, advanceQuestion,
  } = useGameStore();

  // Keyboard state
  const { keys: kbKeys, oneShot } = useKeyboard();

  // Unified keys ref combining keyboard + mobile touch controls every frame
  const unifiedKeys = useRef<KeyState>({ left: false, right: false, up: false, down: false });
  const tankFireSignal = useRef(false);

  const enemyRefs      = useRef<(EnemyTankHandle | null)[]>([]);
  const enemyTargetIds = useRef<string[]>([]);
  const hasResolved    = useRef(false);

  const trajectoryGroupRef = useRef<THREE.Group>(createTrajectoryGroup());

  const [activeProjectile, setActiveProjectile] = useState<ProjectileState | null>(null);
  const [explosions, setExplosions]             = useState<ExplosionItem[]>([]);
  const [floatingScores, setFloatingScores]     = useState<FloatingScoreItem[]>([]);
  const projCounter = useRef(0);
  const explCounter = useRef(0);
  const scoreCounter = useRef(0);
  const shakeRef = useRef(0);

  // ── Current question targets (preserve exact backend order) ──
  const targets = useMemo<TankTarget[]>(() => {
    if (!questions.length) return [];
    const q = questions[currentQuestionIndex];
    return q.options.map((opt, i) => ({
      id:          `t-${questionSessionId}-${i}`,
      optionIndex: i,
      optionText:  opt,
      isCorrect:   opt === q.answer,
    }));
  }, [questions, currentQuestionIndex, questionSessionId]);

  const enemyStartXs = useMemo(() => {
    const count = targets.length;
    if (count === 0) return [];
    if (count === 1) return [15];
    const span = 80; // from -40 to +40
    const step = span / (count - 1);
    const start = -40;
    return Array.from({ length: count }, (_, i) => start + i * step + randFloat(-2, 2));
  }, [targets.length, questionSessionId]);

  useEffect(() => {
    enemyTargetIds.current = targets.map((t) => t.id);
  }, [targets]);

  // ── Per-question reset ───────────────────────────────────────
  useEffect(() => {
    hasResolved.current = false;
    tankFireSignal.current = false;
    setActiveProjectile(null);
    setExplosions([]);
    setFloatingScores([]);
    enemyRefs.current = new Array(targets.length).fill(null);
  }, [questionSessionId, targets.length]);

  // ── Mute sync ────────────────────────────────────────────────
  useEffect(() => {
    AudioManager.setMuted(muted);
  }, [muted]);

  // ── Frame Loop: Unified Controls & State Transitions ───────────
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    // Decay camera shake smoothly
    if (shakeRef.current > 0.001) {
      shakeRef.current *= Math.exp(-dt * 6.5);
    } else {
      shakeRef.current = 0;
    }

    // Age floating scores
    if (floatingScores.length > 0) {
      setFloatingScores((prev) =>
        prev
          .map((s) => ({ ...s, age: s.age + dt }))
          .filter((s) => s.age < 1.1)
      );
    }

    // 1. Merge keyboard and mobile touch keys smoothly every frame
    unifiedKeys.current.left  = Boolean(kbKeys.current.left  || externalKeys.current.left);
    unifiedKeys.current.right = Boolean(kbKeys.current.right || externalKeys.current.right);
    unifiedKeys.current.up    = Boolean(kbKeys.current.up    || externalKeys.current.up);
    unifiedKeys.current.down  = Boolean(kbKeys.current.down  || externalKeys.current.down);

    // 2. Consume keyboard hotkeys
    if (oneShot.current.pause) {
      oneShot.current.pause = false;
      const p = useGameStore.getState().phase;
      if (p === 'playing' || p === 'aiming') useGameStore.getState().setPhase('paused');
      else if (p === 'paused')              useGameStore.getState().setPhase('playing');
    }
    if (oneShot.current.mute) {
      oneShot.current.mute = false;
      useGameStore.getState().toggleMute();
    }
    if (oneShot.current.hint) {
      oneShot.current.hint = false;
      const p = useGameStore.getState().phase;
      if (p === 'playing' || p === 'aiming') useGameStore.getState().setHintVisible(true);
    }

    // 3. Fire trigger from keyboard (Space) or mobile/touch button
    if ((oneShot.current.fire || fireSignal.current) && !hasResolved.current) {
      oneShot.current.fire = false;
      fireSignal.current = false;
      const p = useGameStore.getState().phase;
      if ((p === 'playing' || p === 'aiming') && !activeProjectile) {
        useGameStore.getState().setPhase('firing');
        tankFireSignal.current = true;
      }
    }
  });

  // ── Fire callback ─────────────────────────────────────────────
  const handleFire = useCallback((origin: THREE.Vector3, velocity: THREE.Vector3) => {
    if (hasResolved.current) return;
    shakeRef.current = Math.max(shakeRef.current, 0.22);
    setActiveProjectile({ id: projCounter.current++, origin: origin.clone(), velocity: velocity.clone() });
  }, []);

  // ── Tank hit ──────────────────────────────────────────────────
  const handleHitTank = useCallback((tankId: string) => {
    if (hasResolved.current) return;
    hasResolved.current = true;

    const target = targets.find((t) => t.id === tankId);
    if (!target) return;

    const result  = target.isCorrect ? 'correct' : 'wrong';
    const st      = useGameStore.getState();
    const answer  = st.questions[st.currentQuestionIndex].answer;

    resolveShot(result, answer);
    AudioManager.play(result === 'correct' ? 'correct' : 'wrong');
    AudioManager.play('explosion');

    if (result === 'correct' && (streak + 1) >= 2) {
      setTimeout(() => AudioManager.play('combo'), 180);
    }

    shakeRef.current = Math.max(shakeRef.current, result === 'correct' ? 0.65 : 0.45);

    const idx = targets.indexOf(target);
    enemyRefs.current[idx]?.triggerHit();
    const pos = enemyRefs.current[idx]?.getPosition() ?? new THREE.Vector3();
    setExplosions((e) => [...e, { id: explCounter.current++, pos, type: 'tank' }]);

    // Spawn 3D floating score popup
    const popupText = result === 'correct'
      ? (streak >= 1 ? `+100 (x${streak + 1})` : '+100')
      : '-10';
    const popupColor = result === 'correct' ? '#4caf50' : '#f44336';
    setFloatingScores((prev) => [
      ...prev,
      {
        id: scoreCounter.current++,
        text: popupText,
        color: popupColor,
        pos: pos.clone().add(new THREE.Vector3(0, 2.5, 0)),
        age: 0,
      },
    ]);

    setTimeout(() => advanceQuestion(), GAME_CONFIG.feedback.displayTime);
  }, [targets, streak, resolveShot, advanceQuestion]);

  // ── Terrain hit ───────────────────────────────────────────────
  const handleHitTerrain = useCallback((impactPos?: THREE.Vector3) => {
    if (hasResolved.current) return;
    hasResolved.current = true;

    const st     = useGameStore.getState();
    const answer = st.questions[st.currentQuestionIndex].answer;

    resolveShot('miss', answer);
    AudioManager.play('wrong');
    AudioManager.play('impact');

    shakeRef.current = Math.max(shakeRef.current, 0.3);

    const pos = impactPos ?? (activeProjectile ? activeProjectile.origin : new THREE.Vector3(0, getTerrainHeight(0), 0));
    setExplosions((e) => [...e, { id: explCounter.current++, pos, type: 'terrain' }]);

    setFloatingScores((prev) => [
      ...prev,
      {
        id: scoreCounter.current++,
        text: 'MISS -10',
        color: '#ff9800',
        pos: pos.clone().add(new THREE.Vector3(0, 1.8, 0)),
        age: 0,
      },
    ]);

    setTimeout(() => advanceQuestion(), GAME_CONFIG.feedback.displayTime);
  }, [activeProjectile, resolveShot, advanceQuestion]);

  const removeExplosion = useCallback((id: number) => {
    setExplosions((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const paused = phase === 'paused';
  const showTrajectory = phase === 'playing' || phase === 'aiming';

  return (
    <>
      <ResponsiveCamera shakeRef={shakeRef} playerRef={playerRef} />
      <ambientLight intensity={0.95} />

      <directionalLight
        position={[25, 45, 20]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={35}
        shadow-camera-bottom={-25}
      />
      <directionalLight position={[-20, 20, -10]} intensity={0.5} color="#b3e5fc" />
      <directionalLight position={[0, -15, 10]} intensity={0.3} color="#81c784" />

      <Environment />
      <Terrain />

      {/* Trajectory preview dots */}
      <primitive object={trajectoryGroupRef.current} />

      {/* Player Tank with Unified Controls */}
      <PlayerTank
        ref={playerRef}
        keys={unifiedKeys}
        fireSignal={tankFireSignal}
        onFire={handleFire}
        paused={paused}
        showTrajectory={showTrajectory}
        trajectoryGroupRef={trajectoryGroupRef}
      />

      {/* Enemy answer tanks */}
      {targets.map((target, idx) => (
        <EnemyTankWrapper
          key={target.id}
          target={target}
          initialX={enemyStartXs[idx] ?? idx * 18}
          paused={paused}
          enemyRef={(handle) => {
            enemyRefs.current[idx] = handle;
          }}
        />
      ))}

      {/* Active Artillery Projectile */}
      {activeProjectile && (
        <Projectile
          key={activeProjectile.id}
          origin={activeProjectile.origin}
          velocity={activeProjectile.velocity}
          sessionId={questionSessionId}
          enemyHandles={enemyRefs}
          enemyTargetIds={enemyTargetIds.current}
          onHitTank={handleHitTank}
          onHitTerrain={handleHitTerrain}
          onDestroy={() => setActiveProjectile(null)}
        />
      )}

      {explosions.map((ex) => (
        <Explosion
          key={ex.id}
          position={ex.pos}
          type={ex.type}
          onComplete={() => removeExplosion(ex.id)}
        />
      ))}

      {/* Floating 3D score popups */}
      {floatingScores.map((item) => (
        <FloatingScoreSprite key={item.id} item={item} />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
//  EnemyTankWrapper — minimal wrapper to collect ref
// ─────────────────────────────────────────────────────────────────
interface WrapperProps {
  target:    TankTarget;
  initialX:  number;
  paused:    boolean;
  enemyRef:  (h: EnemyTankHandle | null) => void;
}

function EnemyTankWrapper({ target, initialX, paused, enemyRef }: WrapperProps) {
  const localRef = useRef<EnemyTankHandle>(null);

  useEffect(() => {
    enemyRef(localRef.current);
    return () => { enemyRef(null); };
  });

  return <EnemyTank ref={localRef} target={target} initialX={initialX} paused={paused} />;
}

function ResponsiveCamera({
  shakeRef,
  playerRef,
}: {
  shakeRef: React.MutableRefObject<number>;
  playerRef: React.RefObject<PlayerTankHandle>;
}) {
  const { camera, size } = useThree();

  useFrame(() => {
    const aspect = size.width / Math.max(1, size.height);
    const isPortrait = aspect < 1.0;

    // 1. Target FOV and distance based on viewport
    const targetFov = isPortrait ? 58 : 42;
    const targetCamZ = isPortrait ? 36 : 24.5;

    // 2. Track Player Tank's current position and facing
    const playerPos = playerRef.current?.getPosition() ?? new THREE.Vector3(-22, 0, 0);
    const playerFacing = playerRef.current?.getFacing?.() ?? 1;

    // Forward lead in facing direction
    const leadX = isPortrait ? playerFacing * 4.0 : playerFacing * 6.5;
    const targetCamX = playerPos.x + leadX;
    const targetCamY = isPortrait ? playerPos.y + 6.0 : playerPos.y + 3.8;

    const cam = camera as THREE.PerspectiveCamera;
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov = THREE.MathUtils.lerp(cam.fov, targetFov, 0.08);
      cam.updateProjectionMatrix();
    }

    // Camera shake offset
    const shake = shakeRef.current;
    const shakeX = (Math.random() - 0.5) * shake * 1.5;
    const shakeY = (Math.random() - 0.5) * shake * 1.5;

    // Smooth Lerp Camera Position
    cam.position.x = THREE.MathUtils.lerp(cam.position.x, targetCamX + shakeX, 0.08);
    cam.position.y = THREE.MathUtils.lerp(cam.position.y, targetCamY + shakeY, 0.08);
    cam.position.z = THREE.MathUtils.lerp(cam.position.z, targetCamZ, 0.08);

    // Always smoothly orient camera towards player action zone
    cam.lookAt(playerPos.x + leadX * 0.75, playerPos.y + 2.0, 0);
  });
  return null;
}


// ─────────────────────────────────────────────────────────────────
//  Helper: create trajectory dot group
// ─────────────────────────────────────────────────────────────────
function createTrajectoryGroup(): THREE.Group {
  const grp = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const geo = new THREE.SphereGeometry(0.22, 10, 10);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0.9,
    });
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    grp.add(m);
  }
  return grp;
}

// ─────────────────────────────────────────────────────────────────
//  GameScene — top-level Canvas + public handle
// ─────────────────────────────────────────────────────────────────
export interface GameSceneProps {}

export const GameScene = forwardRef<GameSceneHandle, GameSceneProps>((_props, ref) => {
  const externalKeys = useRef<KeyState>({ left: false, right: false, up: false, down: false });
  const fireSignal   = useRef(false);
  const playerRef    = useRef<PlayerTankHandle>(null);

  useImperativeHandle(ref, () => ({
    setMobileKeys:  (k) => { Object.assign(externalKeys.current, k); },
    setCannonAngle: (a) => { playerRef.current?.setCannonAngle(a); },
    triggerFire:    ()  => {
      const p = useGameStore.getState().phase;
      if (p === 'playing' || p === 'aiming') {
        useGameStore.getState().setPhase('firing');
        playerRef.current?.fire();
      }
    },
  }));

  return (
    <Canvas
      shadows
      camera={{ position: [-22, 5, 23], fov: 42 }}
      style={{ position: 'absolute', inset: 0 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2)]}
    >
      <Suspense fallback={null}>
        <SceneInner
          externalKeys={externalKeys}
          fireSignal={fireSignal}
          playerRef={playerRef}
        />
      </Suspense>
    </Canvas>
  );
});

GameScene.displayName = 'GameScene';

