'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

interface OrbSceneProps {
  hexColor: string;
}

/* Particles distributed on a spherical SHELL (innerR → outerR).
   No particles inside innerR — keeps the orb core clear for the HTML icon overlay. */
function ShellParticles({ hexColor, count, innerR, outerR, opacity, speed }: {
  hexColor: string; count: number; innerR: number; outerR: number; opacity: number; speed: number;
}) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    try {
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        const r     = innerR + Math.random() * (outerR - innerR);
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        pos[i * 3 + 2] = r * Math.cos(phi);
      }
      return pos;
    } catch {
      return new Float32Array(0);
    }
  }, [count, innerR, outerR]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (ref.current) {
        ref.current.geometry.dispose();
        if (ref.current.material instanceof THREE.Material) {
          ref.current.material.dispose();
        }
      }
    };
  }, []);

  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * speed;
      ref.current.rotation.x = clock.elapsedTime * speed * 0.3;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.042}
        color={hexColor}
        transparent
        opacity={opacity}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function OrbScene({ hexColor }: OrbSceneProps) {
  const ring1Ref = useRef<THREE.Mesh>(null);
  const ring2Ref = useRef<THREE.Mesh>(null);
  const cageRef  = useRef<THREE.Mesh>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      [ring1Ref, ring2Ref, cageRef].forEach(meshRef => {
        if (meshRef.current) {
          meshRef.current.geometry.dispose();
          if (meshRef.current.material instanceof THREE.Material) {
            meshRef.current.material.dispose();
          }
        }
      });
    };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring1Ref.current) ring1Ref.current.rotation.z  =  t * 0.18;
    if (ring2Ref.current) {
      ring2Ref.current.rotation.x = t * 0.10;
      ring2Ref.current.rotation.y = t * 0.07;
    }
    if (cageRef.current) {
      cageRef.current.rotation.x = t * 0.11;
      cageRef.current.rotation.y = t * 0.17;
      cageRef.current.rotation.z = t * 0.06;
    }
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <pointLight position={[2.5,  3,    3]}   intensity={2.2} color={hexColor} />
      <pointLight position={[-2,  -2,   -1.5]} intensity={0.9} color="#00ffc8" />

      {/* Geodesic cage — slowly rotating icosahedron wireframe framing the domain icon */}
      <mesh ref={cageRef}>
        <icosahedronGeometry args={[0.46, 1]} />
        <meshBasicMaterial color={hexColor} wireframe transparent opacity={0.16} />
      </mesh>

      {/* Float — gentle organic drift on the whole ring assembly */}
      <Float speed={1.4} rotationIntensity={0.10} floatIntensity={0.28}>
        {/* Equatorial ring */}
        <mesh ref={ring1Ref} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.10, 0.013, 6, 90]} />
          <meshBasicMaterial color={hexColor} transparent opacity={0.82} />
        </mesh>

        {/* Inclined ring — cyan */}
        <mesh ref={ring2Ref} rotation={[Math.PI / 3, Math.PI / 5, 0]}>
          <torusGeometry args={[1.24, 0.007, 6, 90]} />
          <meshBasicMaterial color="#00ffc8" transparent opacity={0.48} />
        </mesh>

        {/* Thin outer ring — domain color */}
        <mesh rotation={[Math.PI / 6, 0, Math.PI / 4]}>
          <torusGeometry args={[1.34, 0.004, 6, 90]} />
          <meshBasicMaterial color={hexColor} transparent opacity={0.28} />
        </mesh>
      </Float>

      {/* Shell particles — domain color, clear center (innerR=0.85) */}
      <ShellParticles hexColor={hexColor} count={65} innerR={0.85} outerR={1.65} opacity={0.72} speed={0.06} />
      {/* Cyan accent shell */}
      <ShellParticles hexColor="#00ffc8" count={20} innerR={0.95} outerR={1.50} opacity={0.32} speed={0.04} />
    </>
  );
}

export default function HoloOrb({ hexColor, size = 160 }: { hexColor: string; size?: number }) {
  // Check if THREE is available (prevents constructor errors during loading)
  if (typeof THREE === 'undefined' || typeof Float32Array === 'undefined') {
    return <div style={{ width: size, height: size }} />;
  }

  return (
    <div style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0, 2.9], fov: 48 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: 'transparent' }}
      >
        <OrbScene hexColor={hexColor} />
      </Canvas>
    </div>
  );
}
