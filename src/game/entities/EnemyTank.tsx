import { useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { TankTarget, TankLifecycle } from '../gameTypes';
import { GAME_CONFIG } from '../gameConfig';
import { getTerrainHeight, getTerrainAngle } from '../scene/Terrain';
import { randFloat, randInt, secureRandom } from '../../utils/math';
import { useGameStore } from '../gameStore';
import { TankRoadwheels } from './TankRoadwheels';

export interface EnemyTankHandle {
  triggerHit: () => void;
  getPosition: () => THREE.Vector3;
}

interface EnemyTankProps {
  target: TankTarget;
  initialX: number;
  paused: boolean;
  onLifecycleChange?: (id: string, lifecycle: TankLifecycle) => void;
}

/** Distinct Cartoon Team Palettes */
const ENEMY_PALETTES = [
  { primary: '#d32f2f', light: '#ef5350', name: 'Crimson' },
  { primary: '#1976d2', light: '#42a5f5', name: 'Cobalt' },
  { primary: '#f57c00', light: '#ff9800', name: 'Amber' },
  { primary: '#7b1fa2', light: '#ab47bc', name: 'Amethyst' },
];

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ── In-Memory Canvas Texture Cache for Crisp 3D Answer Badges ─────
const badgeTextureCache = new Map<string, THREE.CanvasTexture>();

function getAnswerBadgeTexture(letter: string, text: string, primaryColor: string, lightColor: string): THREE.CanvasTexture {
  const key = `${letter}_${text}_${primaryColor}_${lightColor}`;
  if (badgeTextureCache.has(key)) {
    return badgeTextureCache.get(key)!;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // 1. Draw rounded pill container
    const x = 12;
    const y = 14;
    const w = 488;
    const h = 100;
    const r = 48;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 8;

    // Dark glass gradient fill
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, 'rgba(30, 41, 59, 0.96)');
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.98)');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();

    // Glowing colored border
    ctx.strokeStyle = lightColor;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.restore();

    // 2. Letter Disc on the left
    const discX = 64;
    const discY = 64;
    const discR = 34;

    ctx.save();
    ctx.beginPath();
    ctx.arc(discX, discY, discR, 0, Math.PI * 2);
    ctx.fillStyle = primaryColor;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Letter text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px "Orbitron", sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, discX, discY + 2);
    ctx.restore();

    // 3. Option Text on the right
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    // Auto-fit font size based on text length
    let fontSize = 34;
    if (text.length > 22) fontSize = 24;
    else if (text.length > 16) fontSize = 28;

    ctx.font = `bold ${fontSize}px "Rajdhani", sans-serif, system-ui`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Truncate text if too long for safety
    let displayText = text;
    if (displayText.length > 30) {
      displayText = displayText.slice(0, 27) + '...';
    }

    ctx.fillText(displayText, 120, 64, 360);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  badgeTextureCache.set(key, texture);
  return texture;
}

export const EnemyTank = forwardRef<EnemyTankHandle, EnemyTankProps>(
  ({ target, initialX, paused, onLifecycleChange }, ref) => {
    const { phase } = useGameStore();

    const groupRef = useRef<THREE.Group>(null);
    const turretRef = useRef<THREE.Group>(null);
    const wheelsRef = useRef<THREE.Group>(null);
    const badgeRef = useRef<THREE.Sprite>(null);

    // AI state
    const posX = useRef(initialX);
    const speed = useRef(randFloat(GAME_CONFIG.enemyTank.minSpeed, GAME_CONFIG.enemyTank.maxSpeed));
    const direction = useRef(secureRandom() < 0.5 ? 1 : -1);
    const lifecycle = useRef<TankLifecycle>('active');
    const nextTurn = useRef(
      Date.now() +
        randInt(
          GAME_CONFIG.enemyTank.changeDirectionInterval[0],
          GAME_CONFIG.enemyTank.changeDirectionInterval[1]
        )
    );
    const explodeTimer = useRef(0);

    const palette = ENEMY_PALETTES[target.optionIndex % ENEMY_PALETTES.length];
    const letter = OPTION_LETTERS[target.optionIndex % OPTION_LETTERS.length];

    const badgeTexture = useMemo(() => {
      return getAnswerBadgeTexture(letter, target.optionText, palette.primary, palette.light);
    }, [letter, target.optionText, palette.primary, palette.light]);

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

    const flagRef = useRef<THREE.Group>(null);

    // AI frame loop
    useFrame((_, delta) => {
      const grp = groupRef.current;
      if (!grp) return;
      const dt = Math.min(delta, 0.05);

      // Animate team flag fluttering in the wind
      if (flagRef.current) {
        flagRef.current.rotation.y = Math.sin(Date.now() * 0.012 + target.optionIndex * 2) * 0.35;
        flagRef.current.rotation.z = Math.cos(Date.now() * 0.008 + target.optionIndex) * 0.12;
      }

      if (lifecycle.current === 'destroyed') {
        grp.visible = false;
        return;
      }

      if (lifecycle.current === 'hit') {
        explodeTimer.current -= dt;
        grp.rotation.z += (secureRandom() - 0.5) * 0.3;
        if (explodeTimer.current <= 0) {
          report('exploding');
          explodeTimer.current = 0.6;
        }
        return;
      }

      if (lifecycle.current === 'exploding') {
        explodeTimer.current -= dt;
        grp.rotation.z += dt * 8;
        grp.position.y += dt * 2.2;
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
        speed.current = randFloat(GAME_CONFIG.enemyTank.minSpeed, GAME_CONFIG.enemyTank.maxSpeed);
        nextTurn.current =
          Date.now() +
          randInt(
            GAME_CONFIG.enemyTank.changeDirectionInterval[0],
            GAME_CONFIG.enemyTank.changeDirectionInterval[1]
          );
      }

      posX.current = Math.max(
        -boundary,
        Math.min(boundary, posX.current + direction.current * speed.current * dt)
      );

      const h = getTerrainHeight(posX.current);
      const slope = getTerrainAngle(posX.current);
      const bob = Math.sin(Date.now() * 0.009 + target.optionIndex) * 0.035;

      grp.position.set(posX.current, h + 0.65 + bob, 0);
      grp.rotation.z = slope;

      if (wheelsRef.current) {
        wheelsRef.current.children.forEach((w) => {
          w.rotation.z -= direction.current * speed.current * dt * 2.2;
        });
      }

      // Floating badge gentle bounce & elevated placement
      if (badgeRef.current) {
        const badgeBob = Math.sin(Date.now() * 0.006 + target.optionIndex * 1.5) * 0.12;
        badgeRef.current.position.set(0, 4.2 + badgeBob, 1.5);
      }
    });

    const wheelXs = [-1.3, -0.65, 0, 0.65, 1.3];

    // Only show floating answer badges during active gameplay
    const showBadge =
      (phase === 'playing' ||
        phase === 'aiming' ||
        phase === 'firing' ||
        phase === 'resolving' ||
        phase === 'countdown') &&
      lifecycle.current === 'active';

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
          <TankRoadwheels ref={wheelsRef} wheelXs={wheelXs} zOffset={1.05} />

          {/* ── ARMORED HULL ── */}
          <mesh position={[0, 0.1, 0]} castShadow>
            <boxGeometry args={[3.0, 0.6, 1.9]} />
            <meshLambertMaterial color={palette.primary} />
          </mesh>
          <mesh position={[0.2, 0.42, 0]} castShadow>
            <boxGeometry args={[2.2, 0.38, 1.7]} />
            <meshLambertMaterial color={palette.light} />
          </mesh>
          <mesh position={[1.3, 0.22, 0]} rotation={[0, 0, -0.5]} castShadow>
            <boxGeometry args={[0.8, 0.55, 1.85]} />
            <meshLambertMaterial color={palette.primary} />
          </mesh>

          {/* Front Headlight */}
          <mesh position={[1.55, 0.25, 0.65]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial color="#fff59d" />
          </mesh>
          {/* Rear Danger Taillight */}
          <mesh position={[-1.52, 0.25, 0.65]}>
            <boxGeometry args={[0.08, 0.12, 0.2]} />
            <meshBasicMaterial color="#d50000" />
          </mesh>

          {/* Waving Team Banner Flag */}
          <group ref={flagRef} position={[-1.35, 0.55, 0.6]}>
            {/* Pole */}
            <mesh position={[0, 0.7, 0]}>
              <cylinderGeometry args={[0.025, 0.035, 1.4, 6]} />
              <meshLambertMaterial color="#212121" />
            </mesh>
            {/* Triangular Cloth Banner */}
            <mesh position={[-0.32, 1.15, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.3, 0.65, 3]} />
              <meshLambertMaterial color={palette.primary} />
            </mesh>
          </group>

          {/* ── ANGULAR TURRET ── */}
          <group ref={turretRef} position={[0.1, 0.75, 0]}>
            <mesh position={[0, 0, 0]} castShadow>
              <boxGeometry args={[1.8, 0.55, 1.5]} />
              <meshLambertMaterial color={palette.primary} />
            </mesh>
            <mesh position={[0.05, 0.28, 0]} castShadow>
              <boxGeometry args={[1.5, 0.35, 1.3]} />
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

        {/* ── HIGH PERFORMANCE 3D CANVAS TEXTURE BILLBOARD (ALWAYS ON TOP, ZERO OCCLUSION) ── */}
        {showBadge && (
          <sprite
            ref={badgeRef}
            position={[0, 4.2, 1.5]}
            scale={[5.2, 1.3, 1]}
            renderOrder={999}
          >
            <spriteMaterial
              map={badgeTexture}
              transparent
              depthTest={false}
              depthWrite={false}
              toneMapped={false}
            />
          </sprite>
        )}
      </group>
    );
  }
);

EnemyTank.displayName = 'EnemyTank';


