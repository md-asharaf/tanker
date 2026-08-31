import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
//  Procedural Stylized Environment (Hills of Steel Aesthetic)
// ─────────────────────────────────────────────────────────────────

export function Environment() {
  const cloudsRef = useRef<THREE.Group>(null);

  // Animate drifting clouds
  useFrame((_, delta) => {
    if (cloudsRef.current) {
      cloudsRef.current.children.forEach((cloud, i) => {
        cloud.position.x += (0.6 + (i % 3) * 0.3) * delta;
        if (cloud.position.x > 90) {
          cloud.position.x = -90;
        }
      });
    }
  });

  return (
    <>
      {/* Dynamic cartoon sky gradient dome */}
      <SkyDome />

      {/* Radiant Sun in background */}
      <mesh position={[25, 28, -45]}>
        <sphereGeometry args={[7, 24, 24]} />
        <meshBasicMaterial color="#fff3a8" />
      </mesh>
      {/* Sun glow halo */}
      <mesh position={[25, 28, -46]}>
        <sphereGeometry args={[14, 24, 24]} />
        <meshBasicMaterial color="#ffe57f" transparent opacity={0.35} />
      </mesh>

      {/* Floating puffy cartoon clouds */}
      <group ref={cloudsRef}>
        <CloudCluster position={[-60, 22, -30]} scale={1.3} />
        <CloudCluster position={[-20, 26, -38]} scale={1.8} />
        <CloudCluster position={[15, 20, -25]} scale={1.1} />
        <CloudCluster position={[50, 24, -32]} scale={1.5} />
        <CloudCluster position={[-80, 18, -20]} scale={1.0} />
      </group>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Vibrant Cartoon Sky Dome
// ─────────────────────────────────────────────────────────────────
function SkyDome() {
  const skyGeo = useMemo(() => {
    const geo = new THREE.SphereGeometry(140, 32, 24);
    // Invert geometry so it renders inside
    geo.scale(-1, 1, 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = [];

    // Sky colors: Deep cyan-blue at zenith, vibrant bright azure mid, soft golden/warm cyan horizon
    const cZenith  = new THREE.Color('#29b6f6'); // bright sky blue
    const cMid     = new THREE.Color('#81d4fa'); // bright cyan
    const cHorizon = new THREE.Color('#e0f7fa'); // soft bright haze

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = Math.max(0, Math.min(1, (y + 10) / 120));
      const col = new THREE.Color();
      if (t > 0.4) {
        col.lerpColors(cMid, cZenith, (t - 0.4) / 0.6);
      } else {
        col.lerpColors(cHorizon, cMid, t / 0.4);
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
//  Cartoon Cloud Cluster
// ─────────────────────────────────────────────────────────────────
function CloudCluster({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const parts = useMemo(() => {
    return [
      { offset: [0, 0, 0] as [number, number, number], r: 3.2 },
      { offset: [-2.4, -0.4, 0.4] as [number, number, number], r: 2.3 },
      { offset: [2.5, -0.3, -0.3] as [number, number, number], r: 2.5 },
      { offset: [-1.2, 1.4, -0.2] as [number, number, number], r: 2.2 },
      { offset: [1.3, 1.3, 0.2] as [number, number, number], r: 2.4 },
    ];
  }, []);

  return (
    <group position={position} scale={[scale, scale * 0.75, scale]}>
      {parts.map((p, i) => (
        <mesh key={i} position={p.offset}>
          <sphereGeometry args={[p.r, 14, 14]} />
          <meshLambertMaterial color="#ffffff" emissive="#e8f5e9" emissiveIntensity={0.15} />
        </mesh>
      ))}
    </group>
  );
}
