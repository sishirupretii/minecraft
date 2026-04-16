'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { BLOCKS, BLOCK_TYPES, BlockType } from '@/lib/blocks';
import { getAudio } from '@/lib/audio';
import { WorldRenderer } from './World';
import { PlayerController } from './Player';
import { OtherPlayersManager } from './OtherPlayers';
import { CowManager } from './Cows';
import Hotbar from './Hotbar';
import Chat, { ChatMsg } from './Chat';
import HUD from './HUD';
import PlayerList from './PlayerList';

interface Props {
  username: string;
  walletAddress?: string;
  verifiedBase?: boolean;
}

let chatIdCounter = 1;

// Length of a full day in seconds. 4 min is short enough for new players to
// see the cycle, long enough that it doesn't feel like a disco.
const DAY_LENGTH_SECONDS = 240;

// Sea level — any terrain below this y is underwater. Keep in sync with
// world-gen's height range (0–20) so only the lower third of terrain floods.
const SEA_LEVEL = 4;

export default function Game({ username, walletAddress, verifiedBase }: Props) {
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
  const [dayPhase, setDayPhase] = useState(0.25); // start at noon
  const [muted, setMuted] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [invulnerable, setInvulnerable] = useState(false);

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
    const audio = getAudio();
    setMuted(audio.isMuted);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Debug: show FPS when ?debug=1 is in the URL.
    const showFps =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

    // Test WebGL support
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
    // Initial daytime sky / fog. Both are updated each tick by the day/night
    // cycle — this is just the first-frame fallback color.
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 20, 90);

    // ---- Sky shader ----
    // Three-stop vertical gradient (top / horizon / bottom). All three colors
    // are uniforms the render loop lerps between day/sunset/night palettes.
    const skyGeom = new THREE.SphereGeometry(300, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x2a6fd0) },
        horizonColor: { value: new THREE.Color(0x87ceeb) },
        bottomColor: { value: new THREE.Color(0xc8d8e8) },
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

    // ---- Stars ----
    // 220 Points randomly placed on the upper hemisphere of the sky sphere.
    // They fade in only when dayMix drops low (night time).
    const starGeom = new THREE.BufferGeometry();
    const starCount = 220;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI * 0.5; // upper hemisphere only
      const r = 280;
      starPositions[i * 3 + 0] = Math.sin(theta) * Math.cos(phi) * r;
      starPositions[i * 3 + 1] = Math.cos(theta) * r + 20; // lift slightly
      starPositions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    const stars = new THREE.Points(starGeom, starMat);
    stars.renderOrder = -2;
    scene.add(stars);

    // ---- Cloud layer ----
    const cloudTexSize = 128;
    const cloudData = new Uint8Array(cloudTexSize * cloudTexSize * 4);
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
    cloudMesh.rotation.x = -Math.PI / 2;
    cloudMesh.position.y = 180;
    cloudMesh.renderOrder = -1;
    scene.add(cloudMesh);

    // ---- Sun + moon ----
    // Parented under celestialGroup which follows the camera, so they feel
    // infinitely far away. Sun/moon orbit is set per-frame in the tick loop.
    const celestialGroup = new THREE.Group();
    scene.add(celestialGroup);

    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false, depthWrite: false });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), sunMat);
    sun.renderOrder = -1;
    celestialGroup.add(sun);

    const sunGlowMat = new THREE.MeshBasicMaterial({
      color: 0xffd873,
      fog: false,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 16), sunGlowMat);
    sunGlow.renderOrder = -2;
    celestialGroup.add(sunGlow);

    const sunHaloMat = new THREE.MeshBasicMaterial({
      color: 0xffe9a8,
      fog: false,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16), sunHaloMat);
    sunHalo.renderOrder = -3;
    celestialGroup.add(sunHalo);

    const moonMat = new THREE.MeshBasicMaterial({
      color: 0xe6edff,
      fog: false,
      depthWrite: false,
    });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), moonMat);
    moon.renderOrder = -1;
    celestialGroup.add(moon);

    // ---- Block highlight ----
    // Minecraft-style: crisp black outline + subtle outer white pulse.
    const highlightInnerEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.003, 1.003, 1.003));
    const highlightInnerMat = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.9,
      fog: false,
      depthTest: true,
    });
    const highlightInner = new THREE.LineSegments(highlightInnerEdges, highlightInnerMat);
    highlightInner.visible = false;
    highlightInner.renderOrder = 10;
    scene.add(highlightInner);

    const highlightOuterEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05));
    const highlightOuterMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.35,
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
    // Add the camera to the scene graph so objects parented to it (the
    // first-person hand) actually render.
    scene.add(camera);

    // ---- First-person "hand" holding the selected block ----
    // A small cube pinned to the camera at lower-right. Its color tracks the
    // currently-selected hotbar slot, and we swing it on break/place for the
    // classic Minecraft punch feel. Not a tool sprite, but reads as "holding
    // the block you're about to place", which is what the user actually wants.
    const handGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const handMat = new THREE.MeshStandardMaterial({
      color: BLOCKS[BLOCK_TYPES[0]].color,
      roughness: 0.85,
      metalness: 0,
    });
    const hand = new THREE.Mesh(handGeom, handMat);
    hand.castShadow = false;
    hand.receiveShadow = false;
    // Base resting pose — rotation values chosen so three faces of the cube
    // are visible to the camera (not a flat square).
    const HAND_REST_POS = new THREE.Vector3(0.45, -0.45, -0.9);
    const HAND_REST_ROT = new THREE.Euler(-0.25, -0.35, 0);
    hand.position.copy(HAND_REST_POS);
    hand.rotation.copy(HAND_REST_ROT);
    camera.add(hand);

    // Swing animation state. Infinity means "rest"; 0 means "just triggered".
    let handSwingTime = Infinity;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ---- Lighting rig ----
    const ambient = new THREE.AmbientLight(0xaab8cc, 0.3);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfff4d6, 1.4);
    sunLight.position.set(80, 120, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);
    scene.add(sunLight.target);

    // Hemisphere: sky tint from above, brown ground tint from below.
    const hemi = new THREE.HemisphereLight(0x9ec6f7, 0x5a4028, 0.5);
    scene.add(hemi);

    // ---- Water plane ----
    const waterGeom = new THREE.PlaneGeometry(512, 512);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2d7bd4,
      roughness: 0.2,
      metalness: 0.55,
      transparent: true,
      opacity: 0.72,
    });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, SEA_LEVEL, 0);
    water.receiveShadow = true;
    scene.add(water);

    // World + players + cows (cows are purely local, no networking)
    const world = new WorldRenderer(scene);
    const others = new OtherPlayersManager(scene);
    const cows = new CowManager(scene, world);

    // ---- Break particles ----
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
          roughness: 0.8,
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

    // ---- Player ----
    const tempSpawn = { x: 64.5, y: 30, z: 64.5 };
    const player = new PlayerController({
      camera,
      domElement: canvas,
      world,
      spawn: tempSpawn,
    });
    playerRef.current = player;

    // ---- Audio wiring ----
    const audio = getAudio();

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
    player.onPointerLockChange = (locked) => {
      setPointerLocked(locked);
      // First pointer-lock gesture is our chance to unlock the AudioContext.
      if (locked) {
        audio.resume().catch(() => {});
      }
    };
    player.onJump = () => audio.playJump();
    player.onFootstep = () => audio.playFootstep();

    // ---- Socket wiring ----
    const socket = getSocket();

    const onConnect = () => {
      console.log('[socket] connected', socket.id);
      setSocketConnected(true);
      socket.emit('join', { username, walletAddress, verifiedBase });
    };

    const onDisconnect = (reason: string) => {
      console.log('[socket] disconnected', reason);
      setSocketConnected(false);
      appendChat({ username: 'system', message: `Disconnected: ${reason}. Reconnecting…`, isSystem: true });
    };

    const onReconnect = () => {
      appendChat({ username: 'system', message: 'Reconnected.', isSystem: true });
      socket.emit('join', { username, walletAddress, verifiedBase });
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

      // Spawn protection — 5s visual pulse only.
      setInvulnerable(true);
      setTimeout(() => setInvulnerable(false), 5000);
    };

    const onWorldChunk = (payload: {
      blocks: Array<{ x: number; y: number; z: number; type: BlockType }>;
    }) => {
      for (const b of payload.blocks) world.addBlock(b.x, b.y, b.z, b.type);
      setLoadedBlocks((prev) => prev + payload.blocks.length);
    };

    const onWorldComplete = () => {
      setWorldLoaded(true);
      // Spawn a small herd once the world is fully loaded so cows can
      // actually find ground to stand on.
      cows.spawn(8, 64, 64, 32);
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
      // Idempotent: if we already optimistically applied this edit (because
      // WE caused it), both branches short-circuit and we don't double-play
      // the audio.
      if (p.type === null) {
        const wasType = world.getType(p.x, p.y, p.z);
        if (wasType) {
          world.removeBlock(p.x, p.y, p.z, true);
          audio.playBlockBreak(wasType);
        }
      } else {
        if (!world.has(p.x, p.y, p.z)) {
          world.addBlock(p.x, p.y, p.z, p.type, true);
          audio.playBlockPlace(p.type);
        }
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

    const onWelcome = (p: { message: string }) => {
      appendChat({ username: 'system', message: p.message, isSystem: true });
      setToast(p.message);
      setTimeout(() => setToast(null), 3200);
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
    socket.on('chat:welcome', onWelcome);

    if (socket.connected) onConnect();
    else socket.connect();

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
      // Optimistic removal — don't wait for the server round-trip. The server
      // echoes a `block:updated` back which is idempotent against our state
      // (see onBlockUpdated below), so we never double-act.
      const t = world.getType(x, y, z);
      if (t) {
        audio.playBlockBreak(t);
        world.removeBlock(x, y, z, true);
      }
      socket.emit('block:break', { x, y, z });
      handSwingTime = 0;
    };
    player.onPlace = (x, y, z) => {
      const type = BLOCK_TYPES[selectedRef.current];
      audio.playBlockPlace(type);
      world.addBlock(x, y, z, type, true); // optimistic
      socket.emit('block:place', { x, y, z, type });
      handSwingTime = 0;
    };

    // ---- Day/night palette lerp targets ----
    // Palettes in vec3 form (normalized 0..1) so we can lerp cleanly.
    const PALETTE = {
      night: {
        top: new THREE.Color(0x000208),
        horizon: new THREE.Color(0x0a1545),
        bottom: new THREE.Color(0x1a2860),
        sun: new THREE.Color(0x4a6cb8),
        hemiSky: new THREE.Color(0x3a4870),
        hemiGround: new THREE.Color(0x15110a),
        fog: new THREE.Color(0x0a1545),
      },
      day: {
        top: new THREE.Color(0x2a6fd0),
        horizon: new THREE.Color(0x87ceeb),
        bottom: new THREE.Color(0xc8d8e8),
        sun: new THREE.Color(0xfff4d6),
        hemiSky: new THREE.Color(0x9ec6f7),
        hemiGround: new THREE.Color(0x6a5a3a),
        fog: new THREE.Color(0x9ec6f7),
      },
      sunset: {
        top: new THREE.Color(0x0e1840),
        horizon: new THREE.Color(0xff7a3d),
        bottom: new THREE.Color(0xffb37a),
        sun: new THREE.Color(0xffb473),
        hemiSky: new THREE.Color(0xffa060),
        hemiGround: new THREE.Color(0x3a2010),
        fog: new THREE.Color(0xff9a5c),
      },
    };
    const _tmpCol = new THREE.Color();
    const _tmpCol2 = new THREE.Color();
    const lerp3 = (a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color) =>
      out.copy(a).lerp(b, t);

    // ---- Render loop ----
    const clock = new THREE.Clock();
    let elapsed = 0;
    let raf = 0;
    let frameSamples: number[] = [];
    let lowFpsSince = 0;
    let shadowsDisabled = false;

    const tick = () => {
      const dt = clock.getDelta();
      elapsed += dt;
      player.update(dt);
      others.update(dt);
      cows.update(dt);
      world.update();

      // ---- Day/night math ----
      // dayPhase sweeps 0→1 over DAY_LENGTH_SECONDS. We start at noon (0.25)
      // so players aren't plunged into darkness the second they spawn.
      const phase = ((elapsed / DAY_LENGTH_SECONDS) + 0.25) % 1;
      const sunAngle = phase * Math.PI * 2 - Math.PI / 2;
      const sy = Math.sin(sunAngle); // -1 (midnight) .. +1 (noon)
      const sx = Math.cos(sunAngle);

      // Dominant mix: 0 = deep night, 1 = broad day.
      const dayMix = Math.max(0, Math.min(1, (sy + 0.1) * 1.2));
      // Sunset weight: peaks when sun is near the horizon (|sy| small).
      const sunsetWeight = Math.max(0, 1 - Math.abs(sy) * 4) * Math.max(0, 1 - Math.abs(sy)); // tight bell

      // Resolve sky colors: lerp night→day, then blend in sunset warmth.
      lerp3(PALETTE.night.top, PALETTE.day.top, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.top, sunsetWeight);
      skyMat.uniforms.topColor.value.copy(_tmpCol);

      lerp3(PALETTE.night.horizon, PALETTE.day.horizon, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.horizon, sunsetWeight);
      skyMat.uniforms.horizonColor.value.copy(_tmpCol);

      lerp3(PALETTE.night.bottom, PALETTE.day.bottom, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.bottom, sunsetWeight);
      skyMat.uniforms.bottomColor.value.copy(_tmpCol);

      // Scene fog / background match the horizon tint so distant terrain
      // doesn't pop against the sky.
      lerp3(PALETTE.night.fog, PALETTE.day.fog, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.fog, sunsetWeight);
      (scene.fog as THREE.Fog).color.copy(_tmpCol);
      scene.background = _tmpCol.clone();

      // Sun / moon / light orbit
      const sunRadius = 220;
      sun.position.set(sx * sunRadius, sy * 150, 40);
      sunGlow.position.copy(sun.position);
      sunHalo.position.copy(sun.position);
      moon.position.set(-sx * sunRadius, -sy * 150, 40);

      // Sun light orbits with the sun; disable below horizon.
      sunLight.position.set(
        camera.position.x + sx * 120,
        camera.position.y + Math.max(20, sy * 150),
        camera.position.z + 40,
      );
      sunLight.target.position.copy(camera.position);

      lerp3(PALETTE.night.sun, PALETTE.day.sun, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.sun, sunsetWeight);
      sunLight.color.copy(_tmpCol);
      sunLight.intensity = 0.05 + 1.35 * Math.max(0, sy);

      // Sun visibility: hide the disc + glow when it's below horizon
      sun.visible = sy > -0.05;
      sunGlow.visible = sun.visible;
      sunHalo.visible = sun.visible;
      moon.visible = sy < 0.05;

      // Shadows only while sun is up — prevents weird flicker at night.
      if (sy < 0 && sunLight.castShadow) sunLight.castShadow = false;
      else if (sy >= 0.05 && !sunLight.castShadow && !shadowsDisabled) sunLight.castShadow = true;

      // Hemisphere light follows palette
      lerp3(PALETTE.night.hemiSky, PALETTE.day.hemiSky, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.hemiSky, sunsetWeight);
      hemi.color.copy(_tmpCol);
      lerp3(PALETTE.night.hemiGround, PALETTE.day.hemiGround, dayMix, _tmpCol2);
      hemi.groundColor.copy(_tmpCol2);
      hemi.intensity = 0.15 + 0.4 * dayMix;

      // Stars fade in at night only
      starMat.opacity = Math.max(0, 1 - dayMix * 3);
      stars.visible = starMat.opacity > 0.02;

      // Clouds: fade slightly at night, drift on X
      cloudMat.opacity = 0.25 + 0.45 * dayMix;
      if (cloudTexture.offset) cloudTexture.offset.x = (elapsed * 0.008) % 1;

      // Celestial + cloud follow the player
      celestialGroup.position.copy(camera.position);
      cloudMesh.position.x = camera.position.x;
      cloudMesh.position.z = camera.position.z;
      stars.position.copy(camera.position);

      // Publish phase to HUD (throttled via React setState — React bails
      // on identical values anyway, but be kind and only push every ~0.1s).
      if (Math.floor(elapsed * 10) !== Math.floor((elapsed - dt) * 10)) {
        setDayPhase(phase);
      }

      // Water bob + follow camera so its edges stay invisible in the fog
      water.position.x = camera.position.x;
      water.position.z = camera.position.z;
      water.position.y = SEA_LEVEL + Math.sin(elapsed * 0.4) * 0.06;

      // Ambient wind: louder up high
      const altitudeWind = Math.max(0, Math.min(1, (camera.position.y - 15) / 30));
      audio.setAmbientWind(altitudeWind);

      // ---- Hand: track selected block color + run swing animation ----
      const selType = BLOCK_TYPES[selectedRef.current];
      handMat.color.setHex(BLOCKS[selType].color);
      if (handSwingTime !== Infinity) {
        handSwingTime += dt;
        const swingDur = 0.25;
        if (handSwingTime >= swingDur) {
          handSwingTime = Infinity;
          hand.position.copy(HAND_REST_POS);
          hand.rotation.copy(HAND_REST_ROT);
        } else {
          const t = handSwingTime / swingDur;
          // Sine bell: 0 → 1 → 0 over the duration
          const swing = Math.sin(t * Math.PI);
          hand.rotation.x = HAND_REST_ROT.x - swing * 0.9;
          hand.rotation.z = HAND_REST_ROT.z + swing * 0.25;
          hand.position.y = HAND_REST_POS.y - swing * 0.18;
          hand.position.z = HAND_REST_POS.z + swing * 0.1;
        }
      }

      // Block highlight pulse
      const target = world.raycast(camera, 5);
      if (target) {
        highlightInner.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
        highlightOuter.position.copy(highlightInner.position);
        highlightInner.visible = true;
        highlightOuter.visible = true;
        highlightOuterMat.opacity = 0.25 + Math.sin(elapsed * 4) * 0.15;
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
        p.velocity.y -= 9 * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;
        const t = p.age / p.life;
        const mat = p.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = 1 - Math.max(0, (t - 0.5) * 2);
      }

      // FPS counter + auto-disable shadows on low FPS. Sampled per-frame,
      // reported once a second to avoid React thrash.
      if (dt > 0) {
        frameSamples.push(1 / dt);
        if (frameSamples.length > 60) frameSamples.shift();
      }
      if (showFps && frameSamples.length > 0) {
        // Throttle state updates to ~4 Hz
        if (Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) {
          const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
          setFps(avg);
        }
      }
      // Auto-disable shadows if avg FPS < 35 for 3s straight
      if (frameSamples.length >= 30) {
        const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
        if (avg < 35 && !shadowsDisabled) {
          if (lowFpsSince === 0) lowFpsSince = elapsed;
          if (elapsed - lowFpsSince > 3) {
            shadowsDisabled = true;
            sunLight.castShadow = false;
            renderer.shadowMap.enabled = false;
            console.log('[perf] Disabling shadows — sustained low FPS. Press G to re-enable.');
          }
        } else {
          lowFpsSince = 0;
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Re-enable shadows with G key
    const onReenableShadows = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'g' && shadowsDisabled) {
        shadowsDisabled = false;
        renderer.shadowMap.enabled = true;
        // castShadow toggles naturally via the day/night gating
        console.log('[perf] Shadows re-enabled.');
      }
    };
    window.addEventListener('keydown', onReenableShadows);

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
      window.removeEventListener('keydown', onReenableShadows);
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
      socket.off('chat:welcome', onWelcome);
      player.dispose();
      playerRef.current = null;
      others.clear();
      cows.clear();
      world.dispose();
      for (const p of particles) {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
      }
      particles.length = 0;
      particleGeom.dispose();
      camera.remove(hand);
      handGeom.dispose();
      handMat.dispose();
      cloudTexture.dispose();
      cloudMat.dispose();
      cloudMesh.geometry.dispose();
      waterGeom.dispose();
      waterMat.dispose();
      starGeom.dispose();
      starMat.dispose();
      renderer.dispose();
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, walletAddress, verifiedBase]);

  // Sync chatOpen → player
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.chatOpen = chatOpen;
    }
  }, [chatOpen]);

  const handleToggleMute = () => {
    const now = getAudio().toggleMute();
    setMuted(now);
  };

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        // Daylight sky gradient fallback — no pure-black flash between mount
        // and first WebGL frame.
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
        dayPhase={dayPhase}
        muted={muted}
        onToggleMute={handleToggleMute}
        fps={fps}
        toast={toast}
        invulnerable={invulnerable}
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

      {/* WebGL fatal error */}
      {webglError && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-md rounded-xl border border-red-400/40 bg-black/80 p-6 text-center shadow-2xl">
            <div className="mb-2 text-lg font-bold text-red-300">Can't start BaseCraft</div>
            <div className="text-sm text-white/80">{webglError}</div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
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

      {/* Click-to-play overlay */}
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
