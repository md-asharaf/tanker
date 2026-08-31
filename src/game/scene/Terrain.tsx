import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GAME_CONFIG } from '../gameConfig';
import { useFrame } from '@react-three/fiber';

const { width, depth, widthSegments, depthSegments, maxHeight } = GAME_CONFIG.terrain;

// ─────────────────────────────────────────────────────────────────
//  Smooth Rolling Hills Height Function (Clean, Playable Slopes)
// ─────────────────────────────────────────────────────────────────
export function getTerrainHeight(x: number): number {
  return (
    Math.sin(x * 0.055) * maxHeight * 0.65 +
    Math.sin(x * 0.11 + 1.4) * maxHeight * 0.35 +
    Math.sin(x * 0.028 + 2.8) * maxHeight * 0.75 +
    Math.cos(x * 0.085 + 0.5) * maxHeight * 0.25
  );
}

/** Returns the terrain slope angle (radians) at a given x */
export function getTerrainAngle(x: number): number {
  const dx = 0.15;
  const h1 = getTerrainHeight(x - dx);
  const h2 = getTerrainHeight(x + dx);
  return Math.atan2(h2 - h1, 2 * dx);
}

// ─────────────────────────────────────────────────────────────────
//  Stylized Hills of Steel Terrain
// ─────────────────────────────────────────────────────────────────
export function Terrain() {
  // 1. Foreground Solid Hill Track (2.5D Extruded Ground)
  const groundGeometry = useMemo(() => {
    // Width X, Depth Z
    const geo = new THREE.PlaneGeometry(width, depth, widthSegments, depthSegments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];

    // Palette: Lush Grass Green on Top, Earthy Brown on Front/Side slopes
    const cGrassLight = new THREE.Color('#7cb342'); // Bright sunny lime-green
    const cGrassDark = new THREE.Color('#43a047'); // Rich emerald green
    const cDirtTop = new THREE.Color('#8d6e63'); // Warm dirt path
    const cDirtDeep = new THREE.Color('#4e342e'); // Deep underground soil

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const topY = getTerrainHeight(x);

      // Add gentle bevel towards front/back edges
      const zFactor = Math.abs(z) / (depth / 2);
      const yDrop = Math.pow(zFactor, 2.5) * 4.5;
      const finalY = topY - yDrop;
      pos.setY(i, finalY);

      // Color based on Z depth & slope
      const col = new THREE.Color();
      if (zFactor < 0.35) {
        // Center drive strip: Grass & Dirt blend
        col.lerpColors(cGrassLight, cGrassDark, (Math.sin(x * 0.5) + 1) * 0.5);
      } else if (zFactor < 0.65) {
        // Transition to dirt path
        col.lerpColors(cGrassDark, cDirtTop, (zFactor - 0.35) / 0.3);
      } else {
        // Deep earth side wall
        col.lerpColors(cDirtTop, cDirtDeep, (zFactor - 0.65) / 0.35);
      }

      colors.push(col.r, col.g, col.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  // 2. Solid Front Skirt (Closes the bottom so no void is visible)
  const skirtGeometry = useMemo(() => {
    const segments = widthSegments;
    const geo = new THREE.BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];
    const cDirtDeep = new THREE.Color('#3e2723');
    const cDirtMid = new THREE.Color('#5d4037');

    const halfW = width / 2;
    const dx = width / segments;
    const zFront = depth / 2;
    const bottomY = -30;

    for (let i = 0; i < segments; i++) {
      const x1 = -halfW + i * dx;
      const x2 = -halfW + (i + 1) * dx;
      const y1 = getTerrainHeight(x1) - 4.5;
      const y2 = getTerrainHeight(x2) - 4.5;

      // Triangle 1
      positions.push(x1, y1, zFront, x1, bottomY, zFront, x2, y1, zFront);
      // Triangle 2
      positions.push(x2, y1, zFront, x1, bottomY, zFront, x2, bottomY, zFront);

      for (let k = 0; k < 6; k++) {
        colors.push(cDirtMid.r, cDirtMid.g, cDirtMid.b);
      }
    }

    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group>
      {/* Main Ground Mesh */}
      <mesh geometry={groundGeometry} receiveShadow castShadow>
        <meshLambertMaterial vertexColors side={THREE.FrontSide} />
      </mesh>

      {/* Solid Under-Cliff Skirt */}
      <mesh geometry={skirtGeometry}>
        <meshLambertMaterial vertexColors />
      </mesh>

      {/* Layered Cartoon Background Mountains */}
      <ParallaxHills />

      {/* Stylized Vegetation & Props */}
      <DecorativeProps />
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Layered Background Cartoon Hills (Parallax Silhouettes)
// ─────────────────────────────────────────────────────────────────
function ParallaxHills() {
  const layers = [
    { z: -14, freq: 0.038, amp: 7, offsetY: 2, color: '#558b2f', opacity: 0.95 },
    { z: -25, freq: 0.024, amp: 11, offsetY: 6, color: '#33691e', opacity: 0.85 },
    { z: -40, freq: 0.015, amp: 16, offsetY: 12, color: '#1b5e20', opacity: 0.70 },
  ];

  return (
    <>
      {layers.map((layer, li) => (
        <ParallaxLayer key={li} {...layer} />
      ))}
    </>
  );
}

interface ParallaxLayerProps {
  z: number;
  freq: number;
  amp: number;
  offsetY: number;
  color: string;
  opacity: number;
}

function ParallaxLayer({ z, freq, amp, offsetY, color, opacity }: ParallaxLayerProps) {
  const geo = useMemo(() => {
    const w = width * 1.8;
    const segs = 100;
    const g = new THREE.BufferGeometry();
    const positions: number[] = [];
    const halfW = w / 2;
    const dx = w / segs;
    const bottomY = -35;

    for (let i = 0; i < segs; i++) {
      const x1 = -halfW + i * dx;
      const x2 = -halfW + (i + 1) * dx;
      const y1 = Math.sin(x1 * freq + z * 0.1) * amp + Math.sin(x1 * freq * 2.2) * (amp * 0.3) + offsetY;
      const y2 = Math.sin(x2 * freq + z * 0.1) * amp + Math.sin(x2 * freq * 2.2) * (amp * 0.3) + offsetY;

      // Triangle 1 & 2
      positions.push(x1, y1, 0, x1, bottomY, 0, x2, y1, 0);
      positions.push(x2, y1, 0, x1, bottomY, 0, x2, bottomY, 0);
    }

    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    return g;
  }, [amp, freq, offsetY, z]);

  return (
    <mesh geometry={geo} position={[0, 0, z]}>
      <meshLambertMaterial color={color} transparent opacity={opacity} side={THREE.FrontSide} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Decorative Props (Windmill, Watchtower, Trees, Rocks)
// ─────────────────────────────────────────────────────────────────
const TREE_COORDS = [
  -65, -52, -42, -32, -22, -12, -2, 10, 22, 34, 46, 58, 68,
];

function DecorativeProps() {
  return (
    <group>
      {/* Cartoon Spinning Windmill on background ridge */}
      <CartoonWindmill position={[-36, getTerrainHeight(-36) + 0.5, -14]} scale={1.2} />

      {/* Military Watchtower on right ridge */}
      <CartoonWatchtower position={[44, getTerrainHeight(44) + 0.5, -12]} scale={1.1} />

      {/* Trees positioned in the deep background (Z = -7 to -12) */}
      {TREE_COORDS.map((x, i) => {
        const y = getTerrainHeight(x);
        const zBack = -7 - (i % 3) * 2.5;
        const scale = 0.8 + (i % 4) * 0.25;
        const isPine = i % 2 === 0;

        return isPine ? (
          <CartoonPineTree key={i} position={[x, y + 0.2, zBack]} scale={scale} />
        ) : (
          <CartoonOakTree key={i} position={[x, y + 0.2, zBack]} scale={scale} />
        );
      })}

      {/* Decorative Stylized Rocks on the Hillside (Z = -2.5) */}
      {[-55, -38, -18, 5, 28, 48, 62].map((x, i) => {
        const y = getTerrainHeight(x);
        return (
          <mesh
            key={`rock-${i}`}
            position={[x, y + 0.25, -2.5]}
            rotation={[0.2, i * 0.7, 0.3]}
            castShadow
          >
            <dodecahedronGeometry args={[0.55 + (i % 3) * 0.2, 0]} />
            <meshLambertMaterial color="#78909c" />
          </mesh>
        );
      })}
    </group>
  );
}


// ─────────────────────────────────────────────────────────────────
//  Cartoon Spinning Windmill
// ─────────────────────────────────────────────────────────────────
function CartoonWindmill({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const sailsRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (sailsRef.current) {
      sailsRef.current.rotation.z += delta * 0.9;
    }
  });

  return (
    <group position={position} scale={scale}>
      {/* Mill Base */}
      <mesh position={[0, 2.0, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.8, 4.0, 10]} />
        <meshLambertMaterial color="#efebe9" />
      </mesh>
      {/* Conical Roof */}
      <mesh position={[0, 4.6, 0]} castShadow>
        <coneGeometry args={[1.4, 1.4, 10]} />
        <meshLambertMaterial color="#d32f2f" />
      </mesh>
      {/* Axle Hub */}
      <mesh position={[0, 3.8, 1.25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.25, 0.25, 0.5, 10]} />
        <meshLambertMaterial color="#5d4037" />
      </mesh>

      {/* 4 Rotating Sails */}
      <group ref={sailsRef} position={[0, 3.8, 1.5]}>
        {Array.from({ length: 4 }).map((_, i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI) / 2]}>
            {/* Wooden spar */}
            <mesh position={[0, 1.8, 0]}>
              <boxGeometry args={[0.12, 3.6, 0.08]} />
              <meshLambertMaterial color="#5d4037" />
            </mesh>
            {/* Cloth Sail */}
            <mesh position={[0.32, 2.1, 0.02]}>
              <boxGeometry args={[0.55, 2.4, 0.04]} />
              <meshLambertMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Cartoon Watchtower Outpost
// ─────────────────────────────────────────────────────────────────
function CartoonWatchtower({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* 4 Legs */}
      {[
        [-0.8, -0.8],
        [0.8, -0.8],
        [-0.8, 0.8],
        [0.8, 0.8],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 2.0, lz]} rotation={[0.08 * (lx > 0 ? -1 : 1), 0, 0.08 * (lz > 0 ? -1 : 1)]} castShadow>
          <cylinderGeometry args={[0.1, 0.14, 4.0, 6]} />
          <meshLambertMaterial color="#5d4037" />
        </mesh>
      ))}
      {/* Cross Braces */}
      <mesh position={[0, 2.0, 0]}>
        <boxGeometry args={[1.5, 0.1, 1.5]} />
        <meshLambertMaterial color="#4e342e" />
      </mesh>
      {/* Cabin Platform */}
      <mesh position={[0, 4.0, 0]} castShadow>
        <boxGeometry args={[2.2, 0.25, 2.2]} />
        <meshLambertMaterial color="#3e2723" />
      </mesh>
      {/* Cabin Roof */}
      <mesh position={[0, 5.2, 0]} castShadow>
        <coneGeometry args={[1.8, 1.2, 4]} />
        <meshLambertMaterial color="#1b5e20" />
      </mesh>
      {/* Beacon Light on Top */}
      <mesh position={[0, 6.0, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshBasicMaterial color="#ffd54f" />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Cartoon Pine Tree Model
// ─────────────────────────────────────────────────────────────────
function CartoonPineTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 2.0, 8]} />
        <meshLambertMaterial color="#5d4037" />
      </mesh>
      {/* Foliage Layers */}
      <mesh position={[0, 2.2, 0]} castShadow>
        <coneGeometry args={[1.5, 2.0, 8]} />
        <meshLambertMaterial color="#2e7d32" />
      </mesh>
      <mesh position={[0, 3.2, 0]} castShadow>
        <coneGeometry args={[1.2, 1.8, 8]} />
        <meshLambertMaterial color="#388e3c" />
      </mesh>
      <mesh position={[0, 4.1, 0]} castShadow>
        <coneGeometry args={[0.8, 1.4, 8]} />
        <meshLambertMaterial color="#43a047" />
      </mesh>
    </group>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Cartoon Round Oak Tree Model
// ─────────────────────────────────────────────────────────────────
function CartoonOakTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2.4, 8]} />
        <meshLambertMaterial color="#4e342e" />
      </mesh>
      {/* Puffy Foliage Spheres */}
      <mesh position={[0, 3.2, 0]} castShadow>
        <sphereGeometry args={[1.6, 12, 12]} />
        <meshLambertMaterial color="#66bb6a" />
      </mesh>
      <mesh position={[-0.7, 2.7, 0.4]} castShadow>
        <sphereGeometry args={[1.1, 10, 10]} />
        <meshLambertMaterial color="#4caf50" />
      </mesh>
      <mesh position={[0.7, 2.8, -0.3]} castShadow>
        <sphereGeometry args={[1.2, 10, 10]} />
        <meshLambertMaterial color="#81c784" />
      </mesh>
    </group>
  );
}

