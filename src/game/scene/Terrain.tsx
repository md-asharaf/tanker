import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GAME_CONFIG } from '../gameConfig';

const { width, depth, widthSegments, depthSegments } = GAME_CONFIG.terrain;

// ─────────────────────────────────────────────────────────────────
//  3D Heightmap — Smooth Open Valley with 4 Distinct Symmetrical Ridges
// ─────────────────────────────────────────────────────────────────
export function getTerrainHeight(x: number, z: number = 10.0): number {
  // 1. Foreground Player Road (z in [7, 14]) — Smooth horizontal ridge at y ≈ 0.5
  if (z >= 7.0) {
    const roadUndulation = Math.sin(x * 0.06) * 0.2;
    return 0.5 + roadUndulation;
  }

  // 2. Open Central Valley (z in [0, 7]) — Gentle concave dip (y ≈ -0.25 to 0.5)
  if (z >= 0) {
    const t = z / 7.0;
    const valleyDip = -0.32 * Math.sin(t * Math.PI);
    return t * 0.5 + valleyDip;
  }

  // 3. The 4 Distinct Front Ridges (z < 0) — Clean Gaussian Peaks
  // Ridge A (Option A - Far Left): Peak at (-18, -16)
  const dASq = Math.pow(x - (-18), 2) + Math.pow(z - (-16), 2);
  const hA = 4.8 * Math.exp(-dASq / 50);

  // Ridge B (Option B - Mid-Left Peak): Peak at (-6, -21)
  const dBSq = Math.pow(x - (-6), 2) + Math.pow(z - (-21), 2);
  const hB = 5.8 * Math.exp(-dBSq / 55);

  // Ridge C (Option C - Mid-Right Peak): Peak at (+6, -21)
  const dCSq = Math.pow(x - 6, 2) + Math.pow(z - (-21), 2);
  const hC = 5.8 * Math.exp(-dCSq / 55);

  // Ridge D (Option D - Far Right): Peak at (+18, -16)
  const dDSq = Math.pow(x - 18, 2) + Math.pow(z - (-16), 2);
  const hD = 4.8 * Math.exp(-dDSq / 50);

  // Natural subtle rolling waves across the battlefield
  const waves = Math.sin(x * 0.05 + z * 0.04) * 0.35 + Math.cos(x * 0.03 - z * 0.05) * 0.25;

  // Distant Layered Alpine Mountain Range (z < -24) — Natural Jagged Peaks
  let backgroundMountains = 0;
  if (z < -24) {
    const dist = Math.abs(z) - 24;
    backgroundMountains =
      Math.min(16, Math.pow(dist / 5.0, 1.5) * 2.8) +
      Math.sin(x * 0.18) * 2.6 * Math.cos(x * 0.09) +
      Math.sin(x * 0.42 + dist * 0.1) * 1.5 +
      Math.cos(x * 0.08 + dist * 0.22) * 2.0;
  }

  return hA + hB + hC + hD + waves + backgroundMountains;
}

const _vNormal = new THREE.Vector3();

export function getTerrainNormal(x: number, z: number, target: THREE.Vector3 = _vNormal): THREE.Vector3 {
  const delta = 0.25;
  const hL = getTerrainHeight(x - delta, z);
  const hR = getTerrainHeight(x + delta, z);
  const hD = getTerrainHeight(x, z - delta);
  const hU = getTerrainHeight(x, z + delta);

  const dx = (hR - hL) / (2 * delta);
  const dz = (hU - hD) / (2 * delta);

  target.set(-dx, 1, -dz).normalize();
  return target;
}

export function getTerrainAngle(x: number, z: number = 10.0): number {
  const delta = 0.2;
  const h1 = getTerrainHeight(x - delta, z);
  const h2 = getTerrainHeight(x + delta, z);
  return Math.atan2(h2 - h1, 2 * delta);
}

// ─────────────────────────────────────────────────────────────────
//  3D Realistic Battlefield Terrain (AAA Stylized Realism)
// ─────────────────────────────────────────────────────────────────
export function Terrain() {
  const groundGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, depth, widthSegments, depthSegments);
    geo.rotateX(-Math.PI / 2);

    const zOffset = -18;
    geo.translate(0, 0, zOffset);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];

    // ── AAA Realistic Battlefield Palette ──
    const cGrassSun = new THREE.Color('#7a8d56'); // Sunlit golden-green grass
    const cGrassMuted = new THREE.Color('#5e7045'); // Natural meadow steppe
    const cGrassDeep = new THREE.Color('#465433'); // Valley shade green
    const cDirtRoad = new THREE.Color('#675747'); // Compacted dirt road
    const cDirtRuts = new THREE.Color('#4e3f32'); // Wheel track grooves
    const cRockOutcrop = new THREE.Color('#5f6d77'); // Slate cliff rock
    const cRockPeak = new THREE.Color('#7a8891'); // Hilltop limestone gravel
    const cMountainRock = new THREE.Color('#384652'); // Distant alpine slate rock
    const cMountainSnow = new THREE.Color('#dde7f0'); // Crisp mountain snow crags

    const norm = new THREE.Vector3();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = getTerrainHeight(x, z);
      pos.setY(i, h);

      getTerrainNormal(x, z, norm);
      const slope = 1.0 - norm.y; // 0 = flat, > 0.2 = steep

      const col = new THREE.Color();

      if (z >= 7.0 && z <= 13.0) {
        // Foreground Dirt Combat Road
        const distFromRoadCenter = Math.abs(z - 10.0);
        if (distFromRoadCenter < 1.6) {
          const isWheelRut = Math.abs(distFromRoadCenter - 0.75) < 0.35;
          col.copy(isWheelRut ? cDirtRuts : cDirtRoad);
        } else {
          const t = Math.min(1, (distFromRoadCenter - 1.6) / 1.4);
          col.lerpColors(cDirtRoad, cGrassMuted, t);
        }
      } else if (z < -25) {
        // Distant Majestic Alpine Mountains with Natural Jagged Snow Crags
        const dist = Math.abs(z) - 25;
        col.lerpColors(cGrassDeep, cMountainRock, Math.min(1, dist / 10));
        if (h > 8.5) {
          const snowFactor = Math.min(1, (h - 8.5) / 3.2);
          col.lerp(cMountainSnow, snowFactor * 0.9);
        }
      } else {
        // Main Battlefield (Valley & 4 Front Ridges)
        if (slope > 0.24) {
          // Steep cliff faces -> exposed granite rock
          const cliffFactor = Math.min(1, (slope - 0.24) / 0.22);
          col.lerpColors(cGrassMuted, cRockOutcrop, cliffFactor);
        } else if (h > 4.2) {
          // Ridge Peaks -> Sunlit grass + limestone rock
          const ridgeFactor = Math.min(1, (h - 4.2) / 2.2);
          col.lerpColors(cGrassSun, cRockPeak, ridgeFactor);
        } else if (h > 1.8) {
          // Mid-slope rolling meadow
          const t = (h - 1.8) / 2.4;
          col.lerpColors(cGrassMuted, cGrassSun, t);
        } else {
          // Low valley basin
          const t = Math.max(0, (h + 0.3) / 2.1);
          col.lerpColors(cGrassDeep, cGrassMuted, t);
        }

        // Subtle natural dirt paths winding towards the 4 ridges
        const pathA = Math.exp(-Math.pow(x - (-18 + (z + 16) * 0.35), 2) / 3.0);
        const pathD = Math.exp(-Math.pow(x - (18 - (z + 16) * 0.35), 2) / 3.0);
        if ((pathA > 0.35 || pathD > 0.35) && z > -18 && z < 7) {
          const pathAlpha = Math.max(pathA, pathD) * 0.55;
          col.lerp(cDirtRoad, pathAlpha);
        }
      }

      colors.push(col.r, col.g, col.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group>
      <mesh geometry={groundGeometry} receiveShadow castShadow>
        <meshLambertMaterial vertexColors side={THREE.FrontSide} />
      </mesh>
      <BattlefieldProps />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Realistic Props (Positioned on outer flanks & background)
// ─────────────────────────────────────────────────────────────────
function BattlefieldProps() {
  const treePositions = useMemo(() => [
    // Far left flank (outside Ridge A)
    [-28, -8], [-26, -18], [-32, -14], [-30, -24],
    // Far right flank (outside Ridge D)
    [28, -8], [26, -18], [32, -14], [30, -24],
    // Distant background ridge tops (behind the enemy tanks)
    [-14, -28], [0, -30], [14, -28],
    // Foreground road edges (far flanks)
    [-24, 8], [-28, 11], [24, 8], [28, 11],
  ], []);

  const rockPositions = useMemo(() => [
    [-24, -14], [-12, -18], [12, -18], [24, -14],
    [-14, -8], [14, -8],
  ], []);

  return (
    <group>
      {treePositions.map(([x, z], i) => {
        const y = getTerrainHeight(x, z);
        const isPine = i % 2 === 0;
        const scale = 0.75 + (i % 3) * 0.2;
        return isPine ? (
          <RealisticPineTree key={`tree-${i}`} position={[x, y, z]} scale={scale} />
        ) : (
          <RealisticOakTree key={`tree-${i}`} position={[x, y, z]} scale={scale} />
        );
      })}

      {rockPositions.map(([x, z], i) => {
        const y = getTerrainHeight(x, z);
        return (
          <mesh
            key={`rock-${i}`}
            position={[x, y + 0.25, z]}
            rotation={[0.2, i * 0.7, 0.3]}
            castShadow
          >
            <dodecahedronGeometry args={[0.65 + (i % 3) * 0.2, 0]} />
            <meshLambertMaterial color="#5f6d77" />
          </mesh>
        );
      })}

      {/* Weathered Wooden Split-Rail Fence along Road Edges */}
      {[-24, -18, 18, 24].map((x, i) => {
        const z = 8.0;
        const y = getTerrainHeight(x, z);
        return <WoodenFence key={`fence-${i}`} position={[x, y, z]} />;
      })}
    </group>
  );
}

function WoodenFence({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[-1.1, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.8, 6]} />
        <meshLambertMaterial color="#42352d" />
      </mesh>
      <mesh position={[1.1, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.08, 0.8, 6]} />
        <meshLambertMaterial color="#42352d" />
      </mesh>
      <mesh position={[0, 0.58, 0]} castShadow>
        <boxGeometry args={[2.3, 0.08, 0.05]} />
        <meshLambertMaterial color="#524339" />
      </mesh>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[2.3, 0.08, 0.05]} />
        <meshLambertMaterial color="#524339" />
      </mesh>
    </group>
  );
}

function RealisticPineTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const treeRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (treeRef.current) {
      const wind = Math.sin(Date.now() * 0.0018 + position[0] * 0.5) * 0.025;
      treeRef.current.rotation.z = wind;
    }
  });

  return (
    <group ref={treeRef} position={position} scale={scale}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.24, 1.6, 6]} />
        <meshLambertMaterial color="#382a22" />
      </mesh>
      <mesh position={[0, 1.9, 0]} castShadow>
        <coneGeometry args={[1.3, 1.8, 7]} />
        <meshLambertMaterial color="#233522" />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <coneGeometry args={[1.0, 1.6, 7]} />
        <meshLambertMaterial color="#2c3e29" />
      </mesh>
      <mesh position={[0, 3.8, 0]} castShadow>
        <coneGeometry args={[0.7, 1.3, 7]} />
        <meshLambertMaterial color="#354a32" />
      </mesh>
    </group>
  );
}

function RealisticOakTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const oakRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (oakRef.current) {
      const wind = Math.sin(Date.now() * 0.0015 + position[0] * 0.6) * 0.028;
      oakRef.current.rotation.z = wind;
    }
  });

  return (
    <group ref={oakRef} position={position} scale={scale}>
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 2.0, 6]} />
        <meshLambertMaterial color="#382a22" />
      </mesh>
      <mesh position={[0, 2.8, 0]} castShadow>
        <sphereGeometry args={[1.4, 8, 8]} />
        <meshLambertMaterial color="#445435" />
      </mesh>
      <mesh position={[-0.5, 2.4, 0.3]} castShadow>
        <sphereGeometry args={[0.9, 7, 7]} />
        <meshLambertMaterial color="#4f603c" />
      </mesh>
      <mesh position={[0.5, 2.5, -0.2]} castShadow>
        <sphereGeometry args={[0.95, 7, 7]} />
        <meshLambertMaterial color="#586944" />
      </mesh>
    </group>
  );
}
