import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
//  Realistic Atmospheric Environment (Alpine Sky & Volumetric Clouds)
// ─────────────────────────────────────────────────────────────────

export function Environment() {
  const cloudsRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.children.forEach((cloud, i) => {
        cloud.position.x += (0.3 + (i % 3) * 0.15) * delta;
        if (cloud.position.x > 85) {
          cloud.position.x = -85;
        }
      });
    }
  });

  return (
    <>
      {/* Realistic atmospheric sky dome */}
      <SkyDome />

      {/* Radiant Sun in sky */}
      <group position={[32, 38, -50]}>
        <mesh>
          <sphereGeometry args={[6.0, 24, 24]} />
          <meshBasicMaterial color="#fffde7" />
        </mesh>
        <mesh position={[0, 0, -1]}>
          <sphereGeometry args={[14.0, 24, 24]} />
          <meshBasicMaterial color="#fff9c4" transparent opacity={0.3} />
        </mesh>
        <mesh position={[0, 0, -2]}>
          <sphereGeometry args={[26.0, 20, 20]} />
          <meshBasicMaterial color="#ffecb3" transparent opacity={0.15} />
        </mesh>
      </group>

      {/* Realistic soft cumulus clouds */}
      <group ref={cloudsRef}>
        <CloudCluster position={[-50, 28, -38]} scale={1.5} />
        <CloudCluster position={[-12, 32, -45]} scale={1.9} />
        <CloudCluster position={[28, 26, -34]} scale={1.3} />
        <CloudCluster position={[65, 30, -40]} scale={1.7} />
      </group>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Realistic Atmospheric Sky Dome
// ─────────────────────────────────────────────────────────────────
function SkyDome() {
  const skyGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(150, 32, 24);
    geo.scale(-1, 1, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];

    // Realistic Alpine Sky Palette
    const cZenith  = new THREE.Color('#386f96'); // Deep cerulean zenith
    const cUpper   = new THREE.Color('#5d94b8'); // Upper sky azure
    const cMid     = new THREE.Color('#8cb6d2'); // Mid-sky soft blue
    const cHorizon = new THREE.Color('#cce0ec'); // Warm atmospheric haze horizon

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, (y + 15) / 130));
      const col = new THREE.Color();

      if (t > 0.65) {
        col.lerpColors(cUpper, cZenith, (t - 0.65) / 0.35);
      } else if (t > 0.3) {
        col.lerpColors(cMid, cUpper, (t - 0.3) / 0.35);
      } else {
        col.lerpColors(cHorizon, cMid, t / 0.3);
      }

      colors.push(col.r, col.g, col.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }, []);

  return (
    <mesh geometry={skyGeo} position={[0, 0, 0]}>
      <meshBasicMaterial vertexColors side={THREE.BackSide} />
    </mesh>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Realistic Soft Cloud Cluster
// ─────────────────────────────────────────────────────────────────
function CloudCluster({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const parts = useMemo(() => {
    return [
      { offset: [0, 0, 0] as [number, number, number], r: 3.4, sy: 0.58 },
      { offset: [-3.0, -0.3, 0.4] as [number, number, number], r: 2.5, sy: 0.52 },
      { offset: [3.1, -0.2, -0.3] as [number, number, number], r: 2.7, sy: 0.54 },
      { offset: [-1.5, 0.9, -0.2] as [number, number, number], r: 2.3, sy: 0.62 },
      { offset: [1.6, 0.8, 0.2] as [number, number, number], r: 2.4, sy: 0.6 },
    ];
  }, []);

  return (
    <group position={position} scale={scale}>
      {parts.map((p, i) => (
        <mesh key={i} position={p.offset} scale={[1, p.sy, 1]}>
          <sphereGeometry args={[p.r, 12, 10]} />
          <meshLambertMaterial
            color="#ffffff"
            transparent
            opacity={0.88}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
