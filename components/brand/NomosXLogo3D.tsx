"use client";

import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';

// Register all Three.js classes in R3F v9 catalog (required for JSX elements)
extend(THREE as any);

interface Logo3DProps {
  size?: number;
  className?: string;
}

function InstitutionalMark() {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (groupRef.current) {
      // Very slow, authoritative rotation — like a satellite, not a toy
      groupRef.current.rotation.y = t * 0.06;
      groupRef.current.rotation.x = Math.sin(t * 0.04) * 0.08;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.12;
    }
  });

  // Sphere: near-white, cold, high metalness — like brushed platinum
  const sphereMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e8eaf0',
    metalness: 0.72,
    roughness: 0.18,
    emissive: '#c7cce8',
    emissiveIntensity: 0.06,
  }), []);

  // X bars: pure white, slightly matte — clean authority
  const xMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.4,
    roughness: 0.3,
    emissive: '#ffffff',
    emissiveIntensity: 0.12,
  }), []);

  // Orbital ring: very thin, white semi-transparent
  const ringMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#ffffff',
    metalness: 0.0,
    roughness: 1.0,
    transparent: true,
    opacity: 0.18,
  }), []);

  return (
    <group ref={groupRef}>
      {/* Core sphere — brushed platinum */}
      <mesh material={sphereMat}>
        <sphereGeometry args={[0.58, 64, 64]} />
      </mesh>

      {/* X mark — white, crisp, inscribed on sphere surface */}
      <mesh material={xMat} position={[0, 0, 0.5]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.075, 0.76, 0.045]} />
      </mesh>
      <mesh material={xMat} position={[0, 0, 0.5]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.075, 0.76, 0.045]} />
      </mesh>

      {/* Orbital ring — subtle, scientific instrument feel */}
      <mesh ref={ringRef} material={ringMat} rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[0.82, 0.018, 16, 80]} />
      </mesh>
    </group>
  );
}

function Scene() {
  return (
    <>
      {/* Cool, neutral lighting — no color cast */}
      <ambientLight intensity={0.55} color="#e8eaf6" />
      <directionalLight position={[4, 6, 4]} intensity={1.4} color="#ffffff" />
      <directionalLight position={[-3, -2, 2]} intensity={0.5} color="#c5cae9" />
      <pointLight position={[0, 0, 3]} intensity={0.3} color="#ffffff" />
      <InstitutionalMark />
    </>
  );
}

export function NomosXLogo3D({ size = 120, className }: Logo3DProps) {
  return (
    <div className={className} style={{ width: size, height: size }}>
      <Canvas
        camera={{ position: [0, 0, 2.1], fov: 42 }}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <Scene />
        </Suspense>
      </Canvas>
    </div>
  );
}
