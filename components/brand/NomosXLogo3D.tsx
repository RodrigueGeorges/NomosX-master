"use client";

import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import * as THREE from 'three';

// Register Three.js classes used as JSX elements (required by R3F v9)
extend({
  MeshStandardMaterial: THREE.MeshStandardMaterial,
  SphereGeometry: THREE.SphereGeometry,
  BoxGeometry: THREE.BoxGeometry,
  TorusGeometry: THREE.TorusGeometry,
  IcosahedronGeometry: THREE.IcosahedronGeometry,
});

interface Logo3DProps {
  size?: number;
  className?: string;
}

function InstitutionalMark() {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const counterRingRef = useRef<THREE.Mesh>(null);

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
    if (counterRingRef.current) {
      counterRingRef.current.rotation.z = -t * 0.09;
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
    color: '#a5b4fc',
    metalness: 0.0,
    roughness: 1.0,
    transparent: true,
    opacity: 0.24,
  }), []);

  const violetRingMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#8b5cf6',
    metalness: 0.0,
    roughness: 1.0,
    transparent: true,
    opacity: 0.18,
  }), []);

  const coreMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#f5d778',
    metalness: 0.62,
    roughness: 0.16,
    emissive: '#d4af37',
    emissiveIntensity: 0.26,
  }), []);

  return (
    <group ref={groupRef}>
      {/* Core sphere — brushed platinum */}
      <mesh material={sphereMat}>
        <sphereGeometry args={[0.58, 64, 64]} />
      </mesh>

      <mesh material={coreMat} position={[0, 0, 0.68]}>
        <icosahedronGeometry args={[0.12, 1]} />
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
      <mesh ref={counterRingRef} material={violetRingMat} rotation={[Math.PI / 2.9, 0.35, Math.PI / 2]}>
        <torusGeometry args={[0.88, 0.012, 16, 96]} />
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
      <pointLight position={[0, 0, 1.2]} intensity={0.65} color="#f5d778" />
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
