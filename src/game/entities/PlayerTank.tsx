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
  getVelocity:    () => number;
  triggerRecoil:  () => void;
  setCannonAngle: (angle: number) => void;
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
    const turretRef   = useRef<THREE.Group>(null);
    const cannonRef   = useRef<THREE.Group>(null);
    const flashRef    = useRef<THREE.Group>(null);
    const wheelsRef   = useRef<THREE.Group>(null);
    const exhaustRef  = useRef<THREE.Group>(null);

    // High-frequency physics state
    const velocity    = useRef(0);
    const posX        = useRef(-22);
    const cannonAngle = useRef(0.38);
    const recoilTimer = useRef(0);
    const hasFired    = useRef(false);

    const { camera }  = useThree();

    // ── Public handle ─────────────────────────────────────────────
    useImperativeHandle(ref, () => ({
      getPosition:    () => new THREE.Vector3(posX.current, getTerrainHeight(posX.current), 0),
      getCannonAngle: () => cannonAngle.current,
      getVelocity:    () => velocity.current,
      triggerRecoil:  () => { recoilTimer.current = 0.22; },
      setCannonAngle: (a: number) => {
        cannonAngle.current = Math.max(CFG.cannon.minAngle, Math.min(CFG.cannon.maxAngle, a));
      },
    }));

    // ── Mouse aim listener ────────────────────────────────────────
    useEffect(() => {
      const onMove = (e: MouseEvent) => {
        if (paused) return;
        const vy = e.clientY / window.innerHeight;
        cannonAngle.current = Math.max(
          CFG.cannon.minAngle,
          Math.min(CFG.cannon.maxAngle, CFG.cannon.minAngle + (1 - vy) * (CFG.cannon.maxAngle - CFG.cannon.minAngle))
        );
      };
      window.addEventListener('mousemove', onMove);
      return () => window.removeEventListener('mousemove', onMove);
    }, [paused]);

    // ── Main Frame Loop ───────────────────────────────────────────
    useFrame((_, delta) => {
      const grp = groupRef.current;
      if (!grp) return;
      const dt = Math.min(delta, 0.05);

      // Fire trigger
      if (fireSignal.current && !hasFired.current) {
        hasFired.current    = true;
        fireSignal.current  = false;
        recoilTimer.current = 0.25;

        const terrainAngle = getTerrainAngle(posX.current);
        const total        = cannonAngle.current + terrainAngle;
        const cannonLen    = 3.2;

        const muzzle = new THREE.Vector3(
          posX.current + 0.5 + Math.cos(total) * cannonLen,
          getTerrainHeight(posX.current) + 2.1 + Math.sin(total) * cannonLen,
          0
        );
        const vel = new THREE.Vector3(
          Math.cos(total) * CFG.projectile.speed + velocity.current,
          Math.sin(total) * CFG.projectile.speed,
          0
        );

        AudioManager.play('fire');
        onFire?.(muzzle, vel);

        if (flashRef.current) {
          flashRef.current.visible = true;
          flashRef.current.scale.setScalar(1.2 + Math.random() * 0.4);
          setTimeout(() => { if (flashRef.current) flashRef.current.visible = false; }, 90);
        }
      }

      if (paused) return;

      // Tank Movement Physics
      const { left, right } = keys.current;
      const { acceleration: accel, deceleration: decel, maxSpeed } = CFG.playerTank;

      if (left)       velocity.current = Math.max(-maxSpeed, velocity.current - accel * dt);
      else if (right) velocity.current = Math.min(maxSpeed,  velocity.current + accel * dt);
      else {
        if (velocity.current > 0) velocity.current = Math.max(0, velocity.current - decel * dt);
        else                      velocity.current = Math.min(0, velocity.current + decel * dt);
      }

      posX.current = Math.max(-75, Math.min(75, posX.current + velocity.current * dt));

      // Terrain Snapping & Dynamic Suspension Pitch
      const h     = getTerrainHeight(posX.current);
      const slope = getTerrainAngle(posX.current);
      // Suspension bobbing and pitch kick upon acceleration
      const pitchKick = (velocity.current / maxSpeed) * 0.08;
      const bob       = Math.sin(Date.now() * 0.01) * 0.04 * (Math.abs(velocity.current) / maxSpeed);

      grp.position.set(posX.current, h + 0.65 + bob, 0);
      grp.rotation.z = slope - pitchKick;

      // Rotate road wheels
      if (wheelsRef.current) {
        wheelsRef.current.children.forEach((wheel) => {
          wheel.rotation.z -= velocity.current * dt * 2.2;
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

      // Exhaust smoke animation
      if (exhaustRef.current) {
        const isMoving = Math.abs(velocity.current) > 0.5;
        exhaustRef.current.visible = isMoving;
        if (isMoving) {
          exhaustRef.current.scale.setScalar(0.8 + Math.sin(Date.now() * 0.02) * 0.3);
        }
      }

      // ── Clean 2.5D Side-Scroller Profile Camera Tracking ────────
      const targetCamX = posX.current + 4.5;
      const targetCamY = h + 3.2;
      const targetCamZ = 23.0; // Clean side-view profile distance

      camera.position.x = THREE.MathUtils.lerp(camera.position.x, targetCamX, 0.08);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetCamY, 0.08);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetCamZ, 0.08);
      camera.lookAt(posX.current + 5.0, h + 2.0, 0);

      // Trajectory preview
      if (showTrajectory && trajectoryGroupRef.current) {
        trajectoryGroupRef.current.userData.cannonAngle = cannonAngle.current;
        updateTrajectoryDots(trajectoryGroupRef.current, posX.current, h, slope, cannonAngle.current);
        trajectoryGroupRef.current.visible = true;
      } else if (trajectoryGroupRef.current) {
        trajectoryGroupRef.current.visible = false;
      }

      // Engine audio
      AudioManager.setEngineIntensity(Math.abs(velocity.current) / maxSpeed);
    });

    const HULL_GREEN    = '#2e7d32'; // Classic military cartoon green
    const HULL_LIGHT    = '#43a047'; // Highlight armor
    const TREAD_COLOR   = '#212121'; // Dark rubber track
    const WHEEL_RIM     = '#78909c'; // Steel roadwheel rim
    const WHEEL_HUB     = '#cfd8dc'; // Shiny hubcap
    const CANNON_STEEL  = '#37474f'; // Gunmetal cannon
    const EMBLEM_GOLD   = '#ffd54f'; // Crown/star emblem
    const wheelXs       = [-1.4, -0.7, 0, 0.7, 1.4];

    return (
      <group ref={groupRef}>
        {/* ── LOWER CHASSIS & TREADS ── */}
        {/* Track Wrap-around Band Left & Right */}
        <mesh position={[0, -0.32, 1.05]} castShadow>
          <boxGeometry args={[3.6, 0.45, 0.35]} />
          <meshLambertMaterial color={TREAD_COLOR} />
        </mesh>
        <mesh position={[0, -0.32, -1.05]} castShadow>
          <boxGeometry args={[3.6, 0.45, 0.35]} />
          <meshLambertMaterial color={TREAD_COLOR} />
        </mesh>

        {/* 5 Big Chunky Roadwheels with Silver Rims */}
        <group ref={wheelsRef}>
          {wheelXs.map((wx, i) => (
            <group key={`wheel-${i}`} position={[wx, -0.36, 1.1]}>
              {/* Outer Tire */}
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.34, 0.34, 0.28, 16]} />
                <meshLambertMaterial color="#1a1a1a" />
              </mesh>
              {/* Steel Rim Disc */}
              <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.24, 0.24, 0.04, 16]} />
                <meshLambertMaterial color={WHEEL_RIM} />
              </mesh>
              {/* Center Hub Bolt */}
              <mesh position={[0, 0, 0.18]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.1, 0.1, 0.05, 8]} />
                <meshLambertMaterial color={WHEEL_HUB} />
              </mesh>
            </group>
          ))}
          {wheelXs.map((wx, i) => (
            <group key={`wheel-r-${i}`} position={[wx, -0.36, -1.1]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.34, 0.34, 0.28, 16]} />
                <meshLambertMaterial color="#1a1a1a" />
              </mesh>
              <mesh position={[0, 0, -0.15]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.24, 0.24, 0.04, 16]} />
                <meshLambertMaterial color={WHEEL_RIM} />
              </mesh>
            </group>
          ))}
        </group>

        {/* ── ARMORED HULL (CHUNKY CARTOON TANK BODY) ── */}
        {/* Main Lower Hull */}
        <mesh position={[0, 0.12, 0]} castShadow>
          <boxGeometry args={[3.2, 0.65, 2.0]} />
          <meshLambertMaterial color={HULL_GREEN} />
        </mesh>
        {/* Sloped Upper Glacis Armor */}
        <mesh position={[0.2, 0.45, 0]} castShadow>
          <boxGeometry args={[2.4, 0.42, 1.8]} />
          <meshLambertMaterial color={HULL_LIGHT} />
        </mesh>
        {/* Front Wedge Slope */}
        <mesh position={[1.4, 0.25, 0]} rotation={[0, 0, -0.55]} castShadow>
          <boxGeometry args={[0.85, 0.6, 1.95]} />
          <meshLambertMaterial color={HULL_GREEN} />
        </mesh>
        {/* Rear Engine Deck & Exhaust Pipes */}
        <mesh position={[-1.35, 0.35, 0]} castShadow>
          <boxGeometry args={[0.7, 0.45, 1.9]} />
          <meshLambertMaterial color={HULL_GREEN} />
        </mesh>
        {/* Dual Rear Exhaust Pipes */}
        <mesh position={[-1.75, 0.4, 0.55]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.4, 8]} />
          <meshLambertMaterial color="#212121" />
        </mesh>
        <mesh position={[-1.75, 0.4, -0.55]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.4, 8]} />
          <meshLambertMaterial color="#212121" />
        </mesh>
        {/* Exhaust Smoke Puff Particle */}
        <group ref={exhaustRef} position={[-2.0, 0.5, 0.55]} visible={false}>
          <mesh>
            <sphereGeometry args={[0.25, 8, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.6} />
          </mesh>
        </group>

        {/* Golden Military Crown Emblem on Hull Side */}
        <mesh position={[0.1, 0.45, 0.92]}>
          <boxGeometry args={[0.6, 0.28, 0.04]} />
          <meshLambertMaterial color={EMBLEM_GOLD} />
        </mesh>

        {/* ── ROUNDED CARTOON TURRET ── */}
        <group ref={turretRef} position={[0.1, 0.82, 0]}>
          {/* Turret Base Ring */}
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[1.05, 1.15, 0.35, 18]} />
            <meshLambertMaterial color={HULL_GREEN} />
          </mesh>
          {/* Rounded Turret Dome */}
          <mesh position={[0.05, 0.28, 0]} castShadow>
            <sphereGeometry args={[0.92, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshLambertMaterial color={HULL_LIGHT} />
          </mesh>

          {/* Commander Cupola & Cute Cartoon Tank Commander */}
          <group position={[-0.2, 0.48, 0]}>
            {/* Cupola Hatch */}
            <mesh position={[0, 0.1, 0]}>
              <cylinderGeometry args={[0.38, 0.42, 0.2, 14]} />
              <meshLambertMaterial color={HULL_GREEN} />
            </mesh>
            {/* Commander Helmet & Head */}
            <mesh position={[0, 0.38, 0]}>
              <sphereGeometry args={[0.3, 14, 14]} />
              <meshLambertMaterial color="#33691e" />
            </mesh>
            {/* Commander Face / Nose */}
            <mesh position={[0.22, 0.32, 0]}>
              <sphereGeometry args={[0.12, 10, 10]} />
              <meshLambertMaterial color="#ffab91" />
            </mesh>
            {/* Helmet Visor / Goggles */}
            <mesh position={[0.15, 0.42, 0]} rotation={[0, 0, 0.2]}>
              <boxGeometry args={[0.25, 0.12, 0.38]} />
              <meshLambertMaterial color="#1a1a1a" />
            </mesh>
          </group>

          {/* ── ELEVATING HEAVY CANNON ── */}
          <group ref={cannonRef} position={[0.5, 0.2, 0]}>
            {/* Gun Mantlet Rotor */}
            <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
              <cylinderGeometry args={[0.32, 0.32, 0.65, 16]} />
              <meshLambertMaterial color={HULL_GREEN} />
            </mesh>
            {/* Heavy Stepped Cannon Barrel */}
            <mesh position={[1.1, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.13, 0.17, 2.2, 14]} />
              <meshLambertMaterial color={CANNON_STEEL} />
            </mesh>
            {/* Cannon Reinforcing Sleeve */}
            <mesh position={[0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.19, 0.21, 0.8, 14]} />
              <meshLambertMaterial color={CANNON_STEEL} />
            </mesh>
            {/* Heavy Muzzle Brake */}
            <mesh position={[2.25, 0, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.22, 0.22, 0.4, 14]} />
              <meshLambertMaterial color="#212121" />
            </mesh>

            {/* Cartoon Starburst Muzzle Flash */}
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
    );
  }
);

PlayerTank.displayName = 'PlayerTank';

// ─────────────────────────────────────────────────────────────────
//  Trajectory preview
// ─────────────────────────────────────────────────────────────────
function updateTrajectoryDots(
  group: THREE.Group,
  px: number,
  py: number,
  slopeAngle: number,
  cAngle: number,
) {
  const total  = cAngle + slopeAngle;
  const origin: [number, number, number] = [
    px + 0.5 + Math.cos(total) * 3.2,
    py + 2.1 + Math.sin(total) * 3.2,
    0,
  ];
  const vel: [number, number, number] = [
    Math.cos(total) * CFG.projectile.speed,
    Math.sin(total) * CFG.projectile.speed,
    0,
  ];
  const pts = ballisticPositions(origin, vel, 9.81, CFG.trajectory.dots, CFG.trajectory.timeStep);

  pts.forEach((pt, i) => {
    const child = group.children[i] as THREE.Mesh | undefined;
    if (!child) return;
    child.position.set(pt[0], pt[1], pt[2]);
    child.visible = pt[1] > getTerrainHeight(pt[0]) - 0.5;
    (child.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - i * 0.08);
  });
}
