import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────
//  Procedural Stylized Environment (Hills of Steel Aesthetic)
// ─────────────────────────────────────────────────────────────────

export function Environment() {
  const cloudsRef = useRef<THREE.Group>(null);
  const sunRaysRef = useRef<THREE.Group>(null);
  const motesRef = useRef<THREE.Points>(null);

  // Motes positions
  const MOTE_COUNT = 45;
  const motePositions = useMemo(() => {
    const arr = new Float32Array(MOTE_COUNT * 3);
    for (let i = 0; i < MOTE_COUNT; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 120;
      arr[i * 3 + 1] = Math.random() * 25 - 2;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 35;
    }
    return arr;
  }, []);

  // Animate drifting clouds, sunbeams, and floating dust motes
  useFrame((_, delta) => {
    // 1. Drifting clouds
    if (cloudsRef.current) {
      cloudsRef.current.children.forEach((cloud, i) => {
        cloud.position.x += (0.6 + (i % 3) * 0.3) * delta;
        if (cloud.position.x > 90) {
          cloud.position.x = -90;
        }
      });
    }

    // 2. Rotating Sun Rays
    if (sunRaysRef.current) {
      sunRaysRef.current.rotation.z += delta * 0.08;
    }

    // 3. Floating Dust Motes
    if (motesRef.current) {
      const pos = motesRef.current.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < MOTE_COUNT; i++) {
        let x = pos.getX(i) + delta * 0.4;
        let y = pos.getY(i) + Math.sin(Date.now() * 0.001 + i) * 0.015;
        if (x > 60) x = -60;
        pos.setX(i, x);
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  });

  return (
    <>
      {/* Dynamic cartoon sky gradient dome */}
      <SkyDome />

      {/* Radiant Sun in background */}
      <group position={[25, 28, -45]}>
        {/* Sun Core */}
        <mesh>
          <sphereGeometry args={[7.2, 24, 24]} />
          <meshBasicMaterial color="#fff3a8" />
        </mesh>
        {/* Sun glow halo */}
        <mesh position={[0, 0, -1]}>
          <sphereGeometry args={[14.5, 24, 24]} />
          <meshBasicMaterial color="#ffe57f" transparent opacity={0.38} />
        </mesh>
        {/* Outer Solar Aura */}
        <mesh position={[0, 0, -2]}>
          <sphereGeometry args={[22, 20, 20]} />
          <meshBasicMaterial color="#ffcc80" transparent opacity={0.18} />
        </mesh>

        {/* Rotating Sunbeams / God-Rays */}
        <group ref={sunRaysRef}>
          {Array.from({ length: 8 }).map((_, i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]}>
              <planeGeometry args={[1.8, 48]} />
              <meshBasicMaterial color="#fff9c4" transparent opacity={0.14} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      </group>

      {/* Floating puffy cartoon clouds */}
      <group ref={cloudsRef}>
        <CloudCluster position={[-60, 22, -30]} scale={1.3} />
        <CloudCluster position={[-20, 26, -38]} scale={1.8} />
        <CloudCluster position={[15, 20, -25]} scale={1.1} />
        <CloudCluster position={[50, 24, -32]} scale={1.5} />
        <CloudCluster position={[-80, 18, -20]} scale={1.0} />
      </group>

      {/* Atmospheric Floating Sun Motes */}
      <points ref={motesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            array={motePositions}
            count={MOTE_COUNT}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          color="#fff9c4"
          size={0.45}
          transparent
          opacity={0.65}
          sizeAttenuation
        />
      </points>
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

