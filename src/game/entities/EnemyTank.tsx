import { useRef, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { TankTarget, TankLifecycle } from '../gameTypes';
import { GAME_CONFIG } from '../gameConfig';
import { getTerrainHeight, getTerrainAngle } from '../scene/Terrain';
import { randFloat, randInt } from '../../utils/math';

export interface EnemyTankHandle {
  triggerHit:  () => void;
  getPosition: () => THREE.Vector3;
}

interface EnemyTankProps {
  target:              TankTarget;
  initialX:            number;
  paused:              boolean;
  onLifecycleChange?:  (id: string, lifecycle: TankLifecycle) => void;
}

/** Distinct Cartoon Team Palettes */
const ENEMY_PALETTES = [
  { primary: '#d32f2f', light: '#ef5350', name: 'Crimson' },
  { primary: '#1976d2', light: '#42a5f5', name: 'Cobalt' },
  { primary: '#f57c00', light: '#ff9800', name: 'Amber' },
  { primary: '#7b1fa2', light: '#ab47bc', name: 'Amethyst' },
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export const EnemyTank = forwardRef<EnemyTankHandle, EnemyTankProps>(
  ({ target, initialX, paused, onLifecycleChange }, ref) => {
    const groupRef  = useRef<THREE.Group>(null);
    const turretRef = useRef<THREE.Group>(null);
    const wheelsRef = useRef<THREE.Group>(null);

    // AI state
    const posX         = useRef(initialX);
    const speed        = useRef(randFloat(GAME_CONFIG.enemyTank.minSpeed, GAME_CONFIG.enemyTank.maxSpeed));
    const direction    = useRef(Math.random() < 0.5 ? 1 : -1);
    const lifecycle    = useRef<TankLifecycle>('active');
    const nextTurn     = useRef(
      Date.now() + randInt(
        GAME_CONFIG.enemyTank.changeDirectionInterval[0],
        GAME_CONFIG.enemyTank.changeDirectionInterval[1]
      )
    );
    const explodeTimer = useRef(0);

    const palette = ENEMY_PALETTES[target.optionIndex % ENEMY_PALETTES.length];
    const letter  = OPTION_LETTERS[target.optionIndex % OPTION_LETTERS.length];

    const report = (lc: TankLifecycle) => {
      lifecycle.current = lc;
      onLifecycleChange?.(target.id, lc);
    };

    // ── Handle exposed to parent / collision detector ────────────
    useImperativeHandle(ref, () => ({
      triggerHit: () => {
        if (lifecycle.current !== 'active') return;
        report('hit');
        explodeTimer.current = 0.35;
      },
      getPosition: () =>
        groupRef.current
          ? groupRef.current.position.clone()
          : new THREE.Vector3(posX.current, getTerrainHeight(posX.current), 0),
    }));

    // ── Frame loop ────────────────────────────────────────────────
    useFrame((_, delta) => {
      const grp = groupRef.current;
      if (!grp) return;
      const dt = Math.min(delta, 0.05);

      if (lifecycle.current === 'destroyed') {
        grp.visible = false;
        return;
      }

      if (lifecycle.current === 'hit') {
        explodeTimer.current -= dt;
        // Hit flash / wobble
        grp.rotation.z += (Math.random() - 0.5) * 0.3;
        if (explodeTimer.current <= 0) {
          report('exploding');
          explodeTimer.current = 0.6;
        }
        return;
      }

      if (lifecycle.current === 'exploding') {
        explodeTimer.current -= dt;
        grp.rotation.z += dt * 8;
        grp.position.y  += dt * 2.2;
        grp.scale.multiplyScalar(Math.max(0.01, 1 - dt * 1.5));
        if (explodeTimer.current <= 0) report('destroyed');
        return;
      }

      if (paused) return;

      // AI patrolling movement
      const boundary = GAME_CONFIG.enemyTank.boundaryX;
      if (Math.abs(posX.current) > boundary) direction.current *= -1;
      if (Date.now() > nextTurn.current) {
        direction.current *= -1;
        speed.current      = randFloat(GAME_CONFIG.enemyTank.minSpeed, GAME_CONFIG.enemyTank.maxSpeed);
        nextTurn.current   = Date.now() + randInt(
          GAME_CONFIG.enemyTank.changeDirectionInterval[0],
          GAME_CONFIG.enemyTank.changeDirectionInterval[1]
        );
      }

      posX.current = Math.max(-boundary, Math.min(boundary, posX.current + direction.current * speed.current * dt));

      const h      = getTerrainHeight(posX.current);
      const slope  = getTerrainAngle(posX.current);
      const bob    = Math.sin(Date.now() * 0.009 + target.optionIndex) * 0.035;

      grp.position.set(posX.current, h + 0.65 + bob, 0);
      grp.rotation.z = slope;

      if (wheelsRef.current) {
        wheelsRef.current.children.forEach((w) => {
          w.rotation.z -= direction.current * speed.current * dt * 2.2;
        });
      }
    });

    const wheelXs = [-1.3, -0.65, 0, 0.65, 1.3];

    return (
      <group ref={groupRef}>
        {/* Tank Faces Left (towards player approaching from left) */}
        <group scale={[-1, 1, 1]}>
          {/* ── LOWER CHASSIS & TREADS ── */}
          <mesh position={[0, -0.32, 1.0]} castShadow>
            <boxGeometry args={[3.4, 0.42, 0.32]} />
            <meshLambertMaterial color="#212121" />
          </mesh>
          <mesh position={[0, -0.32, -1.0]} castShadow>
            <boxGeometry args={[3.4, 0.42, 0.32]} />
            <meshLambertMaterial color="#212121" />
          </mesh>

          {/* 5 Big Roadwheels */}
          <group ref={wheelsRef}>
            {wheelXs.map((wx, i) => (
              <group key={`ew-${i}`} position={[wx, -0.36, 1.05]}>
                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[0.32, 0.32, 0.25, 14]} />
                  <meshLambertMaterial color="#1a1a1a" />
                </mesh>
                <mesh position={[0, 0, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.22, 0.22, 0.04, 14]} />
                  <meshLambertMaterial color="#78909c" />
                </mesh>
              </group>
            ))}
          </group>

          {/* ── ARMORED HULL ── */}
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[3.0, 0.62, 1.9]} />
            <meshLambertMaterial color={palette.primary} />
          </mesh>
          <mesh position={[0.15, 0.44, 0]} castShadow>
            <boxGeometry args={[2.3, 0.4, 1.7]} />
            <meshLambertMaterial color={palette.light} />
          </mesh>
          <mesh position={[1.3, 0.22, 0]} rotation={[0, 0, -0.55]} castShadow>
            <boxGeometry args={[0.8, 0.58, 1.85]} />
            <meshLambertMaterial color={palette.primary} />
          </mesh>

          {/* ── ROUNDED TURRET & CANNON ── */}
          <group ref={turretRef} position={[0.08, 0.8, 0]}>
            <mesh position={[0, 0.05, 0]} castShadow>
              <cylinderGeometry args={[0.98, 1.08, 0.32, 16]} />
              <meshLambertMaterial color={palette.primary} />
            </mesh>
            <mesh position={[0.05, 0.26, 0]} castShadow>
              <sphereGeometry args={[0.86, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshLambertMaterial color={palette.light} />
            </mesh>

            {/* Cannon facing forward-left */}
            <group position={[0.45, 0.18, 0]}>
              <mesh position={[1.0, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.12, 0.15, 2.0, 12]} />
                <meshLambertMaterial color="#37474f" />
              </mesh>
              <mesh position={[2.05, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.2, 0.2, 0.35, 12]} />
                <meshLambertMaterial color="#212121" />
              </mesh>
            </group>
          </group>
        </group>

        {/* ── HIGH CONTRAST GLOSSY ANSWER BADGE (CAM-FACING) ── */}
        <Html
          position={[0, 3.2, 0]}
          center
          distanceFactor={18}
          zIndexRange={[100, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'linear-gradient(135deg, rgba(15,23,42,0.94), rgba(30,41,59,0.92))',
              border: `2px solid ${palette.light}`,
              borderRadius: '24px',
              padding: '6px 16px 6px 8px',
              boxShadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 16px ${palette.light}44`,
              backdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
              transform: 'translateY(-10px)',
              animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            }}
          >
            {/* Letter Disc Badge */}
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: palette.primary,
                color: '#ffffff',
                fontFamily: "'Orbitron', monospace",
                fontWeight: 900,
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                border: '1.5px solid #ffffff',
              }}
            >
              {letter}
            </div>

            {/* Answer Text */}
            <span
              style={{
                color: '#ffffff',
                fontFamily: "'Rajdhani', sans-serif",
                fontWeight: 700,
                fontSize: '16px',
                letterSpacing: '0.04em',
                textShadow: '0 2px 4px rgba(0,0,0,0.8)',
              }}
            >
              {target.optionText}
            </span>
          </div>
        </Html>
      </group>
    );
  }
);

EnemyTank.displayName = 'EnemyTank';
