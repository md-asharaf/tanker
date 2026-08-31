import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { GAME_CONFIG } from '../gameConfig';
import { getTerrainHeight, getTerrainAngle } from '../scene/Terrain';
import { ballisticPositions } from '../../utils/math';
import { AudioManager } from '../../audio/AudioManager';
import type { KeyState } from '../../controls/useKeyboard';

const CFG = GAME_CONFIG;

// ─────────────────────────────────────────────────────────────────
//  Public handle exposed to parent
// ─────────────────────────────────────────────────────────────────
export interface PlayerTankHandle {
  getPosition:    () => THREE.Vector3;
  getCannonAngle: () => number;
  getFacing:      () => number;
  getVelocity:    () => number;
  triggerRecoil:  () => void;
  setCannonAngle: (angle: number) => void;
  setFacing:      (facing: number) => void;
}

interface Props {
  keys:               React.MutableRefObject<KeyState>;
  fireSignal:         React.MutableRefObject<boolean>;
  onFire?:            (origin: THREE.Vector3, velocity: THREE.Vector3) => void;
  paused:             boolean;
  showTrajectory:     boolean;
  trajectoryGroupRef: React.RefObject<THREE.Group>;
}

// ─────────────────────────────────────────────────────────────────
//  Chunky Stylized Player Tank (Hills of Steel Aesthetic)
// ─────────────────────────────────────────────────────────────────
export const PlayerTank = forwardRef<PlayerTankHandle, Props>(
  ({ keys, onFire, fireSignal, paused, showTrajectory, trajectoryGroupRef }, ref) => {
    const groupRef    = useRef<THREE.Group>(null);
    const chassisRef  = useRef<THREE.Group>(null);
    const turretRef   = useRef<THREE.Group>(null);
    const cannonRef   = useRef<THREE.Group>(null);
    const flashRef    = useRef<THREE.Group>(null);
    const wheelsRef   = useRef<THREE.Group>(null);
    const exhaustRef  = useRef<THREE.Group>(null);

    // High-frequency physics & aiming state
    const velocity    = useRef(0);
    const posX        = useRef(-22);
    const cannonAngle = useRef(0.45); // Elevation angle in radians
    const facing      = useRef<1 | -1>(1); // 1 = facing right, -1 = facing left
    const recoilTimer = useRef(0);
    const hasFired    = useRef(false);

    // Mouse aim world position tracking
    const mouseAim = useRef({ x: 0, y: 0, active: false });

    const { camera, raycaster, size } = useThree();

    // ── Public handle ─────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getPosition:    () => new THREE.Vector3(posX.current, getTerrainHeight(posX.current), 0),
      getCannonAngle: () => cannonAngle.current,
      getFacing:      () => facing.current,
      getVelocity:    () => velocity.current,
      triggerRecoil:  () => { recoilTimer.current = 0.25; },
      setCannonAngle: (a: number) => {
        cannonAngle.current = Math.max(-0.25, Math.min(1.4, a));
      },
      setFacing: (f: number) => {
        facing.current = f >= 0 ? 1 : -1;
      },
    }));

    // ── Mouse / Touch Aim-to-Cursor Listener ──────────────────────
    useEffect(() => {
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // Z=0 gameplay plane
      const planeIntersect = new THREE.Vector3();

      const onPointerMove = (e: PointerEvent) => {
        if (paused) return;
        // Ignore pointer events over the bottom HUD button bar
        if (e.clientY > window.innerHeight - 75) return;
        const target = e.target as HTMLElement | null;
        if (target?.closest?.('.control-bar') || target?.closest?.('button')) return;

        const ndcX = (e.clientX / size.width) * 2 - 1;
        const ndcY = -(e.clientY / size.height) * 2 + 1;

        const ndcVec = new THREE.Vector2(ndcX, ndcY);
        raycaster.setFromCamera(ndcVec, camera);

        if (raycaster.ray.intersectPlane(plane, planeIntersect)) {
          mouseAim.current.x = planeIntersect.x;
          mouseAim.current.y = planeIntersect.y;
          mouseAim.current.active = true;

          const tankX = posX.current;
          const tankY = getTerrainHeight(tankX) + 1.8;
          const dx = planeIntersect.x - tankX;
          const dy = planeIntersect.y - tankY;

          // Auto-flip tank facing based on cursor position relative to tank
          if (dx < -1.0) {
            facing.current = -1; // Face Left
          } else if (dx > 1.0) {
            facing.current = 1;  // Face Right
          }

          // Calculate elevation angle relative to current facing direction
          const targetAngle = Math.atan2(dy, Math.abs(dx));
          cannonAngle.current = Math.max(-0.25, Math.min(1.4, targetAngle));
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      return () => window.removeEventListener('pointermove', onPointerMove);
    }, [camera, raycaster, size, paused]);

    // ── Main Frame Loop ───────────────────────────────────────────
    useFrame((_, delta) => {
      const grp = groupRef.current;
      if (!grp) return;
      const dt = Math.min(delta, 0.05);

      const h     = getTerrainHeight(posX.current);
      const slope = getTerrainAngle(posX.current);
      const cosS  = Math.cos(slope);
      const sinS  = Math.sin(slope);

      // Fire trigger
      if (fireSignal.current && !hasFired.current) {
        hasFired.current    = true;
        fireSignal.current  = false;
        recoilTimer.current = 0.25;

        // Local muzzle offset
        const cElev = Math.cos(cannonAngle.current);
        const sElev = Math.sin(cannonAngle.current);
        const localMuzzleX = facing.current * (0.6 + cElev * 3.2);
        const localMuzzleY = 1.02 + sElev * 3.2;

        // Transform local muzzle offset to world space via ground slope
        const muzzleX = posX.current + (cosS * localMuzzleX - sinS * localMuzzleY);
        const muzzleY = (h + 0.65) + (sinS * localMuzzleX + cosS * localMuzzleY);
        const muzzle = new THREE.Vector3(muzzleX, muzzleY, 0);

        // Transform launch direction vector to world space
        const localDirX = facing.current * cElev;
        const localDirY = sElev;
        const worldDirX = cosS * localDirX - sinS * localDirY;
        const worldDirY = sinS * localDirX + cosS * localDirY;

        const vel = new THREE.Vector3(
          worldDirX * CFG.projectile.speed + velocity.current,
          worldDirY * CFG.projectile.speed,
          0
        );

        AudioManager.play('fire');
        onFire?.(muzzle, vel);

        if (flashRef.current) {
          flashRef.current.visible = true;
          flashRef.current.scale.setScalar(1.3 + Math.random() * 0.4);
          setTimeout(() => { if (flashRef.current) flashRef.current.visible = false; }, 90);
        }
      }

      if (paused) return;

      // Tank Movement Controls
      const { left, right } = keys.current;
      const { acceleration: accel, deceleration: decel, maxSpeed } = CFG.playerTank;

      if (left) {
        velocity.current = Math.max(-maxSpeed, velocity.current - accel * dt);
        if (!mouseAim.current.active) facing.current = -1;
      } else if (right) {
        velocity.current = Math.min(maxSpeed, velocity.current + accel * dt);
        if (!mouseAim.current.active) facing.current = 1;
      } else {
        if (velocity.current > 0) velocity.current = Math.max(0, velocity.current - decel * dt);
        else                      velocity.current = Math.min(0, velocity.current + decel * dt);
      }

      posX.current = Math.max(-75, Math.min(75, posX.current + velocity.current * dt));

      // Terrain Snapping & Ground Tangent Orientation
      const bob = Math.sin(Date.now() * 0.01) * 0.03 * (Math.abs(velocity.current) / maxSpeed);
      const accelPitch = (velocity.current / maxSpeed) * 0.05 * facing.current;

      // The root group aligns directly with the terrain slope
      grp.position.set(posX.current, h + 0.65 + bob, 0);
      grp.rotation.z = slope - accelPitch;

      // The chassis only flips its X scale — zero extra Z rotation to avoid double-inversion!
      if (chassisRef.current) {
        chassisRef.current.scale.x = facing.current;
        chassisRef.current.rotation.z = 0;
      }

      // Rotate road wheels
      if (wheelsRef.current) {
        wheelsRef.current.children.forEach((wheel) => {
          wheel.rotation.z -= velocity.current * dt * 2.2 * facing.current;
        });
      }

      // Cannon Angle Elevation & Recoil Animation
      if (cannonRef.current) {
        cannonRef.current.rotation.z = cannonAngle.current;
        if (recoilTimer.current > 0) {
          recoilTimer.current -= dt;
          cannonRef.current.position.x = 0.5 - (recoilTimer.current / 0.25) * 0.35;
        } else {
          cannonRef.current.position.x = 0.5;
          hasFired.current = false;
        }
      }

      // Exhaust smoke particles
      if (exhaustRef.current) {
        const isMoving = Math.abs(velocity.current) > 0.4;
        exhaustRef.current.visible = isMoving;
        if (isMoving) {
          exhaustRef.current.scale.setScalar(0.8 + Math.sin(Date.now() * 0.02) * 0.3);
        }
      }

      // ── Clean Side-Profile Camera Following ─────────────────────
      const leadX = facing.current === 1 ? 5.5 : -5.5;
      const targetCamX = posX.current + leadX;
      const targetCamY = h + 3.4;
      const targetCamZ = 24.0;

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08);
      camera.lookAt(posX.current + leadX * 0.8, h + 2.2, 0);

      // Trajectory preview
      if (showTrajectory && trajectoryGroupRef.current) {
        updateTrajectoryDots(
          trajectoryGroupRef.current,
          posX.current,
          h,
          slope,
          cannonAngle.current,
          facing.current
        );
        trajectoryGroupRef.current.visible = true;
      } else if (trajectoryGroupRef.current) {
        trajectoryGroupRef.current.visible = false;
      }
    });

    const HULL_GREEN    = '#2e7d32';
    const HULL_LIGHT    = '#43a047';
    const TREAD_COLOR   = '#212121';
    const WHEEL_RIM     = '#78909c';
    const WHEEL_HUB     = '#cfd8dc';
    const CANNON_STEEL  = '#37474f';
    const EMBLEM_GOLD   = '#ffd54f';
    const wheelXs       = [-1.4, -0.7, 0, 0.7, 1.4];

    return (
      <group ref={groupRef}>
        {/* Chassis flipped Left/Right cleanly */}
        <group ref={chassisRef}>
          {/* ── LOWER CHASSIS & TREADS ── */}
          <mesh position={[0, -0.32, 1.05]} castShadow>
            <boxGeometry args={[3.6, 0.45, 0.35]} />
            <meshLambertMaterial color={TREAD_COLOR} />
          </mesh>
          <mesh position={[0, -0.32, -1.05]} castShadow>
            <boxGeometry args={[3.6, 0.45, 0.35]} />
            <meshLambertMaterial color={TREAD_COLOR} />
          </mesh>

          {/* 5 Big Roadwheels */}
          <group ref={wheelsRef}>
            {wheelXs.map((wx, i) => (
              <group key={`wheel-${i}`} position={[wx, -0.36, 1.1]}>
                <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                  <cylinderGeometry args={[0.34, 0.34, 0.28, 16]} />
                  <meshLambertMaterial color="#1a1a1a" />
                </mesh>
                <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.24, 0.24, 0.04, 16]} />
                  <meshLambertMaterial color={WHEEL_RIM} />
                </mesh>
                <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.1, 0.1, 0.05, 8]} />
                  <meshLambertMaterial color={WHEEL_HUB} />
                </mesh>
              </group>
            ))}
          </group>

          {/* ── ARMORED HULL ── */}
          <mesh position={[0, 0.12, 0]} castShadow>
            <boxGeometry args={[3.2, 0.65, 2.0]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>
          <mesh position={[0.2, 0.45, 0]} castShadow>
            <boxGeometry args={[2.4, 0.42, 1.8]} />
            <meshLambertMaterial color={HULL_LIGHT} />
          </mesh>
          <mesh position={[1.4, 0.25, 0]} rotation={[0, 0, -0.55]} castShadow>
            <boxGeometry args={[0.85, 0.6, 1.95]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>
          <mesh position={[-1.35, 0.35, 0]} castShadow>
            <boxGeometry args={[0.7, 0.45, 1.9]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>

          {/* Dual Rear Exhaust Pipes */}
          <mesh position={[-1.75, 0.4, 0.55]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 0.4, 8]} />
            <meshLambertMaterial color="#212121" />
          </mesh>
          <group ref={exhaustRef} position={[-2.0, 0.5, 0.55]} visible={false}>
            <mesh>
              <sphereGeometry args={[0.25, 8, 8]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
            </mesh>
          </group>

          {/* Golden Crown Emblem */}
          <mesh position={[0.1, 0.45, 0.92]}>
            <boxGeometry args={[0.6, 0.28, 0.04]} />
            <meshLambertMaterial color={EMBLEM_GOLD} />
          </mesh>

          {/* ── ROUNDED TURRET & COMMANDER ── */}
          <group ref={turretRef} position={[0.1, 0.82, 0]}>
            <mesh position={[0, 0.05, 0]} castShadow>
              <cylinderGeometry args={[1.05, 1.15, 0.35, 18]} />
              <meshLambertMaterial color={HULL_GREEN} />
            </mesh>
            <mesh position={[0.05, 0.28, 0]} castShadow>
              <sphereGeometry args={[0.92, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <meshLambertMaterial color={HULL_LIGHT} />
            </mesh>

            {/* Commander */}
            <group position={[-0.2, 0.48, 0]}>
              <mesh position={[0, 0.1, 0]}>
                <cylinderGeometry args={[0.38, 0.42, 0.2, 14]} />
                <meshLambertMaterial color={HULL_GREEN} />
              </mesh>
              <mesh position={[0, 0.38, 0]}>
                <sphereGeometry args={[0.3, 14, 14]} />
                <meshLambertMaterial color="#33691e" />
              </mesh>
              <mesh position={[0.22, 0.32, 0]}>
                <sphereGeometry args={[0.12, 10, 10]} />
                <meshLambertMaterial color="#ffab91" />
              </mesh>
              <mesh position={[0.15, 0.42, 0]} rotation={[0, 0, 0.2]}>
                <boxGeometry args={[0.25, 0.12, 0.38]} />
                <meshLambertMaterial color="#1a1a1a" />
              </mesh>
            </group>

            {/* ── ELEVATING HEAVY CANNON ── */}
            <group ref={cannonRef} position={[0.5, 0.2, 0]}>
              <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.32, 0.32, 0.65, 16]} />
                <meshLambertMaterial color={HULL_GREEN} />
              </mesh>
              <mesh position={[1.1, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.13, 0.17, 2.2, 14]} />
                <meshLambertMaterial color={CANNON_STEEL} />
              </mesh>
              <mesh position={[0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.19, 0.21, 0.8, 14]} />
                <meshLambertMaterial color={CANNON_STEEL} />
              </mesh>
              <mesh position={[2.25, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.22, 0.22, 0.4, 14]} />
                <meshLambertMaterial color="#212121" />
              </mesh>

              {/* Starburst Muzzle Flash */}
              <group ref={flashRef} position={[2.6, 0, 0]} visible={false}>
                <mesh>
                  <sphereGeometry args={[0.65, 10, 10]} />
                  <meshBasicMaterial color="#fff59d" />
                </mesh>
                <mesh>
                  <dodecahedronGeometry args={[0.95, 0]} />
                  <meshBasicMaterial color="#ff9800" transparent opacity={0.7} />
                </mesh>
              </group>
            </group>
          </group>
        </group>
      </group>
    );
  }
);

PlayerTank.displayName = 'PlayerTank';

// ─────────────────────────────────────────────────────────────────
//  Full 360° Dynamic Trajectory Arc & Ground Target Reticle
// ─────────────────────────────────────────────────────────────────
function updateTrajectoryDots(
  group: THREE.Group,
  px: number,
  py: number,
  slopeAngle: number,
  cAngle: number,
  facing: number
) {
  const cosS = Math.cos(slopeAngle);
  const sinS = Math.sin(slopeAngle);

  const cElev = Math.cos(cAngle);
  const sElev = Math.sin(cAngle);

  // Local muzzle position
  const localMuzzleX = facing * (0.6 + cElev * 3.2);
  const localMuzzleY = 1.02 + sElev * 3.2;

  // Transform to world space
  const originX = px + (cosS * localMuzzleX - sinS * localMuzzleY);
  const originY = (py + 0.65) + (sinS * localMuzzleX + cosS * localMuzzleY);
  const origin: [number, number, number] = [originX, originY, 0];

  // World launch direction
  const localDirX = facing * cElev;
  const localDirY = sElev;
  const worldDirX = cosS * localDirX - sinS * localDirY;
  const worldDirY = sinS * localDirX + cosS * localDirY;

  const vel: [number, number, number] = [
    worldDirX * CFG.projectile.speed,
    worldDirY * CFG.projectile.speed,
    0,
  ];

  const count = group.children.length;
  const pts = ballisticPositions(origin, vel, 9.81, count, 0.16);

  let hasHitGround = false;

  pts.forEach((pt, i) => {
    const child = group.children[i] as THREE.Mesh | undefined;
    if (!child) return;

    if (hasHitGround) {
      child.visible = false;
      return;
    }

    const groundY = getTerrainHeight(pt[0]);
    if (pt[1] <= groundY + 0.3) {
      // Landing marker at exact ground contact point
      hasHitGround = true;
      child.position.set(pt[0], groundY + 0.4, 0);
      child.scale.set(2.2, 2.2, 2.2);
      (child.material as THREE.MeshBasicMaterial).color.set('#ff1744');
      (child.material as THREE.MeshBasicMaterial).opacity = 0.95;
      child.visible = true;
    } else {
      child.position.set(pt[0], pt[1], pt[2]);
      child.scale.setScalar(1.0 - i * 0.04);
      (child.material as THREE.MeshBasicMaterial).color.set('#ffea00');
      (child.material as THREE.MeshBasicMaterial).opacity = Math.max(0.2, 0.9 - i * 0.06);
      child.visible = true;
    }
  });
}
