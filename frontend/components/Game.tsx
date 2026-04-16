'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { BLOCKS, BLOCK_TYPES, BlockType } from '@/lib/blocks';
import { WorldRenderer } from './World';
import { PlayerController } from './Player';
import { OtherPlayersManager } from './OtherPlayers';
import Hotbar from './Hotbar';
import Chat, { ChatMsg } from './Chat';
import HUD from './HUD';
import PlayerList from './PlayerList';

interface Props {
  username: string;
  walletAddress?: string;
}

let chatIdCounter = 1;

export default function Game({ username, walletAddress }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PlayerController | null>(null);
  const [selectedBlock, setSelectedBlock] = useState(0);
  const selectedRef = useRef(0);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });
  const [showCoords, setShowCoords] = useState(true);
  const [onlinePlayers, setOnlinePlayers] = useState<Array<{ id: string; username: string; color: string }>>([]);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [worldLoaded, setWorldLoaded] = useState(false);
  const [loadedBlocks, setLoadedBlocks] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [selfColor, setSelfColor] = useState<string>('#0052FF');
  const [error, setError] = useState<string | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Track refs so callbacks use fresh values without re-binding
  useEffect(() => {
    selectedRef.current = selectedBlock;
  }, [selectedBlock]);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  function appendChat(msg: Omit<ChatMsg, 'id' | 'ts'> & { ts?: number }) {
    setChatMessages((prev) => {
      const next = [...prev, { ...msg, id: chatIdCounter++, ts: msg.ts ?? Date.now() }];
      // cap at 200
      if (next.length > 200) next.splice(0, next.length - 200);
      return next;
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Test WebGL support before doing anything heavy; bail with a clear message
    // if the user's browser can't render. Otherwise they'd just see a black canvas.
    try {
      const testCtx =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
      if (!testCtx) {
        setWebglError(
          'WebGL is not available in your browser. Try Chrome, Firefox, or Edge, and enable hardware acceleration.',
        );
        return;
      }
    } catch (err) {
      setWebglError(
        `Could not initialize WebGL: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }

    // ---- Three.js scene ----
    const scene = new THREE.Scene();
    // Base-blue horizon tint; fog slightly richer than the sky tone so distant
    // blocks visually sink into atmosphere rather than match the sky exactly.
    scene.background = new THREE.Color(0x2856d8);
    scene.fog = new THREE.Fog(0x2856d8, 20, 80);

    // Sky shader: near-black zenith → Base-blue horizon → pale near-ground tint.
    const skyGeom = new THREE.SphereGeometry(250, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x020420) },
        horizonColor: { value: new THREE.Color(0x2856d8) },
        bottomColor: { value: new THREE.Color(0x6a95e6) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorldPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPos;
        void main() {
          float h = normalize(vWorldPos).y;
          vec3 c;
          if (h > 0.0) {
            c = mix(horizonColor, topColor, clamp(h * 1.6, 0.0, 1.0));
          } else {
            c = mix(horizonColor, bottomColor, clamp(-h * 2.0, 0.0, 1.0));
          }
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthWrite: false,
    });
    const sky = new THREE.Mesh(skyGeom, skyMat);
    scene.add(sky);

    // --- Procedural cloud layer. A large, slowly-drifting semi-transparent
    // plane at y=180 with a value-noise alpha texture. Adds depth to the sky
    // without any external assets or new dependencies.
    const cloudTexSize = 128;
    const cloudData = new Uint8Array(cloudTexSize * cloudTexSize * 4);
    // Lightweight value-noise: blend a coarse lattice of random samples.
    // Good enough for clouds and costs ~16ms to build once.
    const lattice = 8;
    const samples: number[] = [];
    for (let i = 0; i < (lattice + 1) * (lattice + 1); i++) samples.push(Math.random());
    const sample = (ix: number, iy: number) => samples[iy * (lattice + 1) + ix];
    const smoothstep = (t: number) => t * t * (3 - 2 * t);
    for (let y = 0; y < cloudTexSize; y++) {
      for (let x = 0; x < cloudTexSize; x++) {
        const fx = (x / cloudTexSize) * lattice;
        const fy = (y / cloudTexSize) * lattice;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        const tx = smoothstep(fx - ix);
        const ty = smoothstep(fy - iy);
        const a = sample(ix, iy);
        const b = sample(ix + 1, iy);
        const c = sample(ix, iy + 1);
        const d = sample(ix + 1, iy + 1);
        const top = a + (b - a) * tx;
        const bot = c + (d - c) * tx;
        const n = top + (bot - top) * ty;
        // Threshold the noise so we only get wispy puffs, not a solid sheet.
        const puff = Math.max(0, (n - 0.45) / 0.55);
        const idx = (y * cloudTexSize + x) * 4;
        cloudData[idx] = 255;
        cloudData[idx + 1] = 255;
        cloudData[idx + 2] = 255;
        cloudData[idx + 3] = Math.floor(puff * 200);
      }
    }
    const cloudTexture = new THREE.DataTexture(
      cloudData,
      cloudTexSize,
      cloudTexSize,
      THREE.RGBAFormat,
    );
    cloudTexture.wrapS = THREE.RepeatWrapping;
    cloudTexture.wrapT = THREE.RepeatWrapping;
    cloudTexture.magFilter = THREE.LinearFilter;
    cloudTexture.minFilter = THREE.LinearMipMapLinearFilter;
    cloudTexture.generateMipmaps = true;
    cloudTexture.repeat.set(2, 2);
    cloudTexture.needsUpdate = true;
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTexture,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.7,
    });
    const cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), cloudMat);
    cloudMesh.rotation.x = -Math.PI / 2; // face down
    cloudMesh.position.y = 180;
    cloudMesh.renderOrder = -1;
    scene.add(cloudMesh);

    // --- Sun (warm disc) + Moon (pale disc), parented to camera so they feel "at infinity"
    // and never get clipped by fog. We disable fog on their materials and give them a huge
    // renderOrder-friendly position just inside the sky sphere.
    const celestialGroup = new THREE.Group();
    scene.add(celestialGroup);

    const sunGeom = new THREE.SphereGeometry(10, 24, 16);
    const sunMat = new THREE.MeshBasicMaterial({
      color: 0xfff1b8,
      fog: false,
      depthWrite: false,
    });
    const sun = new THREE.Mesh(sunGeom, sunMat);
    sun.position.set(120, 90, -80);
    sun.renderOrder = -1;
    celestialGroup.add(sun);

    // Inner sun glow
    const sunGlowGeom = new THREE.SphereGeometry(18, 24, 16);
    const sunGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffd873,
      fog: false,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const sunGlow = new THREE.Mesh(sunGlowGeom, sunGlowMat);
    sunGlow.position.copy(sun.position);
    sunGlow.renderOrder = -2;
    celestialGroup.add(sunGlow);

    // Outer sun halo — very soft, large radius. Fakes god-ray bloom
    // without any post-processing pass (which would need EffectComposer).
    const sunHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8,
      fog: false,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16), sunHaloMat);
    sunHalo.position.copy(sun.position);
    sunHalo.renderOrder = -3;
    celestialGroup.add(sunHalo);

    const moonGeom = new THREE.SphereGeometry(7, 24, 16);
    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xe6edff,
      fog: false,
      depthWrite: false,
    });
    const moon = new THREE.Mesh(moonGeom, moonMat);
    moon.position.set(-130, 70, 90);
    moon.renderOrder = -1;
    celestialGroup.add(moon);

    // --- Block highlight: inner crisp Base-blue outline + an outer pulsing
    // halo that gently breathes at 4 Hz. Makes the targeted block unmistakable.
    const highlightInnerEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.003, 1.003, 1.003));
    const highlightInnerMat = new THREE.LineBasicMaterial({
      color: 0x4a7cff,
      transparent: true,
      opacity: 0.95,
      fog: false,
      depthTest: true,
    });
    const highlightInner = new THREE.LineSegments(highlightInnerEdges, highlightInnerMat);
    highlightInner.visible = false;
    highlightInner.renderOrder = 10;
    scene.add(highlightInner);

    const highlightOuterEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05));
    const highlightOuterMat = new THREE.LineBasicMaterial({
      color: 0x4a7cff,
      transparent: true,
      opacity: 0.4,
      fog: false,
      depthTest: true,
    });
    const highlightOuter = new THREE.LineSegments(highlightOuterEdges, highlightOuterMat);
    highlightOuter.visible = false;
    highlightOuter.renderOrder = 9;
    scene.add(highlightOuter);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      500,
    );

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic tonemapping + shadows transform the scene from flat-lit cubes
    // into an atmospheric sandbox with real depth.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // --- Lighting rig ---------------------------------------------------
    // Ambient: cool blue fill. Kept low so directional contribution reads.
    const ambient = new THREE.AmbientLight(0x8aa8ff, 0.25);
    scene.add(ambient);

    // Sun: warm-white directional with shadow casting. Orthographic shadow
    // frustum tuned to the ~160-block visibility radius so shadow-map
    // resolution isn't wasted on off-camera geometry.
    const sun_light = new THREE.DirectionalLight(0xfff4d6, 1.4);
    sun_light.position.set(80, 120, 40);
    sun_light.castShadow = true;
    sun_light.shadow.mapSize.set(2048, 2048);
    sun_light.shadow.camera.left = -80;
    sun_light.shadow.camera.right = 80;
    sun_light.shadow.camera.top = 80;
    sun_light.shadow.camera.bottom = -80;
    sun_light.shadow.camera.near = 1;
    sun_light.shadow.camera.far = 300;
    sun_light.shadow.bias = -0.0005;
    scene.add(sun_light);
    scene.add(sun_light.target);

    // Hemisphere: sky tint from above, deep ground tint from below. Sells the
    // "world under an open sky" feel far better than a single ambient.
    const hemi = new THREE.HemisphereLight(0x6a95e6, 0x1a2048, 0.45);
    scene.add(hemi);

    // Base-blue rim: a second directional from the opposite side, tinted
    // with the brand colour. Gives block edges a subtle signature Base glow.
    const rim = new THREE.DirectionalLight(0x4a7cff, 0.35);
    rim.position.set(-60, 40, -30);
    scene.add(rim);

    // World + players
    const world = new WorldRenderer(scene);
    const others = new OtherPlayersManager(scene);

    // --- Break particles: when a block is destroyed, emit 6 small cube shards
    // that fly outward, fall under gravity, and fade out. Bought juice for
    // effectively zero performance cost — max ~50 active meshes.
    type Particle = {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      age: number;
      life: number;
    };
    const particles: Particle[] = [];
    const particleGeom = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const _particleColor = new THREE.Color();
    world.onBlockBroken = (x, y, z, type) => {
      const baseHex = BLOCKS[type].color;
      _particleColor.setHex(baseHex);
      for (let i = 0; i < 6; i++) {
        const mat = new THREE.MeshStandardMaterial({
          color: _particleColor.clone(),
          roughness: 0.7,
          transparent: true,
          opacity: 1,
        });
        const m = new THREE.Mesh(particleGeom, mat);
        m.position.set(
          x + 0.3 + Math.random() * 0.4,
          y + 0.3 + Math.random() * 0.4,
          z + 0.3 + Math.random() * 0.4,
        );
        m.castShadow = false;
        m.receiveShadow = false;
        scene.add(m);
        particles.push({
          mesh: m,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 4,
            2 + Math.random() * 3,
            (Math.random() - 0.5) * 4,
          ),
          age: 0,
          life: 0.45,
        });
      }
    };

    // Temporary spawn placeholder; will be replaced on world:init
    const tempSpawn = { x: 64.5, y: 30, z: 64.5 };
    const player = new PlayerController({
      camera,
      domElement: canvas,
      world,
      spawn: tempSpawn,
    });
    playerRef.current = player;

    // Hotbar wiring
    player.onHotbarSelect = (i) => setSelectedBlock(i);
    player.onHotbarScroll = (delta) => {
      setSelectedBlock((prev) => {
        let next = prev + (delta > 0 ? 1 : -1);
        if (next < 0) next = BLOCK_TYPES.length - 1;
        if (next >= BLOCK_TYPES.length) next = 0;
        return next;
      });
    };
    player.onToggleCoords = () => setShowCoords((v) => !v);
    player.onTabDown = (pressed) => setShowPlayerList(pressed);
    player.onChatToggle = () => {
      chatOpenRef.current = true;
      player.chatOpen = true;
      setChatOpen(true);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
    player.onPointerLockChange = (locked) => setPointerLocked(locked);

    // ---- Socket wiring ----
    const socket = getSocket();

    const onConnect = () => {
      console.log('[socket] connected', socket.id);
      setSocketConnected(true);
      socket.emit('join', { username, walletAddress });
    };

    const onDisconnect = (reason: string) => {
      console.log('[socket] disconnected', reason);
      setSocketConnected(false);
      appendChat({ username: 'system', message: `Disconnected: ${reason}. Reconnecting…`, isSystem: true });
    };

    const onReconnect = () => {
      appendChat({ username: 'system', message: 'Reconnected.', isSystem: true });
      socket.emit('join', { username, walletAddress });
    };

    const onError = (payload: { message: string }) => {
      setError(payload?.message ?? 'Unknown error');
    };

    const onWorldInit = (payload: {
      blocks: Array<{ x: number; y: number; z: number; type: BlockType }>;
      spawnPoint: { x: number; y: number; z: number };
      onlinePlayers: Array<{ id: string; username: string; color: string; x: number; y: number; z: number }>;
      you: { id: string; username: string; color: string };
      worldSize: number;
      worldHeight: number;
    }) => {
      world.clear();
      others.clear();

      for (const b of payload.blocks) {
        world.addBlock(b.x, b.y, b.z, b.type);
      }
      setLoadedBlocks(payload.blocks.length);

      for (const op of payload.onlinePlayers) {
        if (op.id === payload.you.id) continue;
        others.add(op);
      }

      setSelfColor(payload.you.color);

      player.setPosition(payload.spawnPoint.x, payload.spawnPoint.y, payload.spawnPoint.z);
    };

    const onWorldChunk = (payload: {
      blocks: Array<{ x: number; y: number; z: number; type: BlockType }>;
    }) => {
      for (const b of payload.blocks) world.addBlock(b.x, b.y, b.z, b.type);
      setLoadedBlocks((prev) => prev + payload.blocks.length);
    };

    const onWorldComplete = () => {
      setWorldLoaded(true);
    };

    const onPlayerJoined = (p: { id: string; username: string; color: string; x: number; y: number; z: number }) => {
      if (p.id === socket.id) return;
      others.add(p);
      refreshOnlineList();
    };

    const onPlayerLeft = (p: { id: string; username: string }) => {
      others.remove(p.id);
      refreshOnlineList();
    };

    const onPlayerMoved = (p: { id: string; x: number; y: number; z: number; rotY: number }) => {
      if (p.id === socket.id) return;
      others.updateTarget(p.id, p.x, p.y, p.z, p.rotY);
    };

    const onBlockUpdated = (p: { x: number; y: number; z: number; type: BlockType | null; placedBy?: string }) => {
      if (p.type === null) {
        world.removeBlock(p.x, p.y, p.z, true);
      } else {
        world.addBlock(p.x, p.y, p.z, p.type, true);
      }
    };

    const onChatReceived = (m: { username: string; message: string; isSystem?: boolean }) => {
      appendChat({ username: m.username, message: m.message, isSystem: m.isSystem });
    };

    const onChatHistory = (msgs: Array<{ username: string; message: string; created_at?: string }>) => {
      const converted: ChatMsg[] = msgs.map((m) => ({
        id: chatIdCounter++,
        username: m.username,
        message: m.message,
        ts: m.created_at ? new Date(m.created_at).getTime() : Date.now(),
      }));
      setChatMessages(converted);
    };

    const onTeleport = (p: { x: number; y: number; z: number }) => {
      player.setPosition(p.x, p.y, p.z);
    };

    function refreshOnlineList() {
      setOnlinePlayers(others.list());
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnect', onReconnect);
    socket.on('error', onError);
    socket.on('world:init', onWorldInit);
    socket.on('world:chunk', onWorldChunk);
    socket.on('world:complete', onWorldComplete);
    socket.on('player:joined', onPlayerJoined);
    socket.on('player:left', onPlayerLeft);
    socket.on('player:moved', onPlayerMoved);
    socket.on('block:updated', onBlockUpdated);
    socket.on('chat:received', onChatReceived);
    socket.on('chat:history', onChatHistory);
    socket.on('player:teleport', onTeleport);

    // If socket already connected (e.g. HMR), trigger join now
    if (socket.connected) onConnect();
    else socket.connect();

    // Refresh online list when others change
    const refreshInterval = setInterval(refreshOnlineList, 1000);

    // Player callbacks that emit to server
    let lastMoveSent = 0;
    player.onChange = (s) => {
      setCoords({ x: s.x, y: s.y, z: s.z });
      const now = performance.now();
      if (now - lastMoveSent > 100) {
        lastMoveSent = now;
        socket.emit('player:move', { x: s.x, y: s.y, z: s.z, rotY: s.rotY, rotX: s.rotX });
      }
    };
    player.onBreak = (x, y, z) => {
      socket.emit('block:break', { x, y, z });
    };
    player.onPlace = (x, y, z) => {
      const type = BLOCK_TYPES[selectedRef.current];
      socket.emit('block:place', { x, y, z, type });
    };

    // ---- Render loop ----
    const clock = new THREE.Clock();
    let elapsed = 0;
    let raf = 0;
    const tick = () => {
      const dt = clock.getDelta();
      elapsed += dt;
      player.update(dt);
      others.update(dt);
      world.update();

      // Celestial group + clouds + shadow camera follow the player so sky
      // elements feel "at infinity" and shadows stay in range.
      celestialGroup.position.copy(camera.position);
      cloudMesh.position.x = camera.position.x;
      cloudMesh.position.z = camera.position.z;
      // Drift clouds on X by animating the texture offset — no geometry update
      if (cloudTexture.offset) cloudTexture.offset.x = (elapsed * 0.008) % 1;
      // Keep sun's shadow camera centered on the player
      sun_light.target.position.copy(camera.position);
      sun_light.position.set(
        camera.position.x + 80,
        camera.position.y + 120,
        camera.position.z + 40,
      );

      // Block highlight: inner crisp outline + outer breathing halo
      const target = world.raycast(camera, 5);
      if (target) {
        highlightInner.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
        highlightOuter.position.copy(highlightInner.position);
        highlightInner.visible = true;
        highlightOuter.visible = true;
        // Pulse outer opacity between 0.2 and 0.6 at 4 Hz
        highlightOuterMat.opacity = 0.4 + Math.sin(elapsed * 4) * 0.2;
      } else {
        highlightInner.visible = false;
        highlightOuter.visible = false;
      }

      // Break particles: advance physics, fade out, recycle when done
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.age += dt;
        if (p.age >= p.life) {
          scene.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
          particles.splice(i, 1);
          continue;
        }
        // Gravity
        p.velocity.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        // Spin for personality
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;
        // Fade out in the last 50% of life
        const t = p.age / p.life;
        const mat = p.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = 1 - Math.max(0, (t - 0.5) * 2);
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // ---- Resize ----
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // ---- Cleanup ----
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(refreshInterval);
      window.removeEventListener('resize', onResize);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('reconnect', onReconnect);
      socket.off('error', onError);
      socket.off('world:init', onWorldInit);
      socket.off('world:chunk', onWorldChunk);
      socket.off('world:complete', onWorldComplete);
      socket.off('player:joined', onPlayerJoined);
      socket.off('player:left', onPlayerLeft);
      socket.off('player:moved', onPlayerMoved);
      socket.off('block:updated', onBlockUpdated);
      socket.off('chat:received', onChatReceived);
      socket.off('chat:history', onChatHistory);
      socket.off('player:teleport', onTeleport);
      player.dispose();
      playerRef.current = null;
      others.clear();
      world.dispose();
      // Dispose procedural resources we allocated in this effect
      for (const p of particles) {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
      }
      particles.length = 0;
      particleGeom.dispose();
      cloudTexture.dispose();
      cloudMat.dispose();
      cloudMesh.geometry.dispose();
      renderer.dispose();
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, walletAddress]);

  // Sync chatOpen → player (engine suppresses movement/mouse while chat is open)
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.chatOpen = chatOpen;
    }
  }, [chatOpen]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        // Fall back to the sky's horizon color so there's never a pure-black
        // flash between mount and the first WebGL frame — and so WebGL
        // failures show a blue backdrop behind the error instead of black.
        background:
          'linear-gradient(180deg, #1a3ea8 0%, #6a95e6 100%)',
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      <HUD
        coords={coords}
        showCoords={showCoords}
        onlineCount={onlinePlayers.length + 1}
        worldLoaded={worldLoaded}
        loadedCount={loadedBlocks}
        totalCount={totalBlocks}
      />

      <Hotbar
        selected={selectedBlock}
        onSelect={(i) => setSelectedBlock(i)}
      />

      <Chat
        messages={chatMessages}
        open={chatOpen}
        onOpen={() => setChatOpen(true)}
        onClose={() => setChatOpen(false)}
        onSend={(msg) => {
          const socket = getSocket();
          socket.emit('chat:send', { message: msg });
        }}
      />

      <PlayerList
        visible={showPlayerList}
        players={onlinePlayers}
        self={{ username, color: selfColor }}
      />

      {/* Block type label above hotbar */}
      <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded bg-black/50 px-2 py-0.5 text-xs text-white/80 backdrop-blur-sm">
        {BLOCKS[BLOCK_TYPES[selectedBlock]].label}
      </div>

      {/* WebGL fatal error — tell the user explicitly why the game is blank */}
      {webglError && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-red-400/40 bg-black/80 p-6 text-center shadow-2xl">
            <div className="mb-2 text-lg font-bold text-red-300">Can't start BaseCraft</div>
            <div className="text-sm text-white/80">{webglError}</div>
          </div>
        </div>
      )}

      {/* Loading overlay — visible until socket is connected AND world:complete fires.
          Without this, the user sees an empty blue canvas for 5-30s after clicking
          "Enter World" and assumes the game is broken. */}
      {!webglError && (!socketConnected || !worldLoaded) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0a0e27]/80 backdrop-blur-sm">
          <div className="rounded-xl border border-white/20 bg-black/50 px-8 py-6 text-center shadow-2xl">
            <div className="mb-3 text-2xl font-bold text-[#4a7cff]">BaseCraft</div>
            {!socketConnected ? (
              <>
                <div className="text-sm text-white/80">Connecting to server…</div>
                <div className="mt-1 text-xs text-white/40">
                  First connect can take ~30s while the world wakes up.
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-white/80">Loading world…</div>
                <div className="mt-1 text-xs text-white/40">
                  {loadedBlocks.toLocaleString()} blocks loaded
                </div>
              </>
            )}
            <div className="mt-4 flex justify-center">
              <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-[#0052FF]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click-to-play overlay — shown when the mouse isn't captured.
          Clicking the canvas itself engages pointer lock (see Player.bindEvents),
          so this overlay is purely informational and must NOT block mouse events. */}
      {!pointerLocked && !chatOpen && worldLoaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="rounded-xl border border-white/20 bg-black/60 px-8 py-6 text-center shadow-2xl">
            <div className="mb-2 text-2xl font-bold text-white">Click to Play</div>
            <div className="space-y-1 text-sm text-white/80">
              <div><span className="font-mono text-[#4a7cff]">Mouse</span> — Look around</div>
              <div><span className="font-mono text-[#4a7cff]">W A S D</span> — Move</div>
              <div><span className="font-mono text-[#4a7cff]">Space</span> — Jump &nbsp;·&nbsp; <span className="font-mono text-[#4a7cff]">Shift</span> — Sprint</div>
              <div><span className="font-mono text-[#4a7cff]">Left click</span> — Break &nbsp;·&nbsp; <span className="font-mono text-[#4a7cff]">Right click</span> — Place</div>
              <div><span className="font-mono text-[#4a7cff]">1-6</span> — Select block &nbsp;·&nbsp; <span className="font-mono text-[#4a7cff]">F</span> — Fly</div>
              <div><span className="font-mono text-[#4a7cff]">T</span> — Chat &nbsp;·&nbsp; <span className="font-mono text-[#4a7cff]">Esc</span> — Release mouse</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="pointer-events-auto absolute left-1/2 top-20 -translate-x-1/2 rounded-md border border-red-400/40 bg-red-500/20 px-4 py-2 text-sm text-red-100 backdrop-blur-sm">
          {error}
          <button className="ml-3 text-red-200/80 underline" onClick={() => setError(null)}>
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}

