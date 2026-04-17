'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { BLOCKS, BLOCK_TYPES, BlockType } from '@/lib/blocks';
import {
  ITEMS,
  ItemType,
  Inventory,
  InventorySlot,
  HOTBAR_SIZE,
  createInventory,
  addItem,
  removeFromSlot,
  useTool,
  getBlockDrop,
} from '@/lib/items';
import { RECIPES, Recipe, canCraft, craft } from '@/lib/recipes';
import { getAudio } from '@/lib/audio';
import { WorldRenderer } from './World';
import { PlayerController } from './Player';
import { OtherPlayersManager } from './OtherPlayers';
import { CowManager, PigManager, ChickenManager } from './Mobs';
import { FlowerManager } from './Flowers';
import Hotbar from './Hotbar';
import Chat, { ChatMsg } from './Chat';
import HUD from './HUD';
import PlayerList from './PlayerList';
import HealthHunger from './HealthHunger';
import InventoryScreen from './InventoryScreen';

interface Props {
  username: string;
  walletAddress?: string;
  verifiedBase?: boolean;
}

let chatIdCounter = 1;

const DAY_LENGTH_SECONDS = 240;
const SEA_LEVEL = 4;

// Health / hunger constants
const MAX_HEALTH = 20;
const MAX_HUNGER = 20;
// Hunger depletion rates (units per second)
const HUNGER_DRAIN_WALK = 0.035;
const HUNGER_DRAIN_SPRINT = 0.08;
const HUNGER_DRAIN_IDLE = 0.008;
// Regen: 0.5 HP/s when hunger > 14
const HEALTH_REGEN_RATE = 0.5;
const HEALTH_REGEN_HUNGER_MIN = 14;
// Starvation: lose HP when hunger = 0
const STARVATION_RATE = 0.3;

export default function Game({ username, walletAddress, verifiedBase }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PlayerController | null>(null);

  // ---- Inventory (slot-based) ----
  const [inventory, setInventory] = useState<Inventory>(createInventory);
  const inventoryRef = useRef<Inventory>(inventory);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);

  const [selectedSlot, setSelectedSlot] = useState(0);
  const selectedRef = useRef(0);
  useEffect(() => { selectedRef.current = selectedSlot; }, [selectedSlot]);

  // ---- Health / Hunger ----
  const [health, setHealth] = useState(MAX_HEALTH);
  const [hunger, setHunger] = useState(MAX_HUNGER);
  const healthRef = useRef(MAX_HEALTH);
  const hungerRef = useRef(MAX_HUNGER);
  useEffect(() => { healthRef.current = health; }, [health]);
  useEffect(() => { hungerRef.current = hunger; }, [hunger]);

  // ---- Inventory screen ----
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const inventoryOpenRef = useRef(false);
  useEffect(() => { inventoryOpenRef.current = inventoryOpen; }, [inventoryOpen]);

  // ---- Chat ----
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);

  // ---- Misc HUD state ----
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });
  const [showCoords, setShowCoords] = useState(true);
  const [onlinePlayers, setOnlinePlayers] = useState<Array<{ id: string; username: string; color: string }>>([]);
  const [showPlayerList, setShowPlayerList] = useState(false);
  const [worldLoaded, setWorldLoaded] = useState(false);
  const [loadedBlocks, setLoadedBlocks] = useState(0);
  const [totalBlocks, setTotalBlocks] = useState(0);
  const [selfColor, setSelfColor] = useState<string>('#6aa84f');
  const [error, setError] = useState<string | null>(null);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [dayPhase, setDayPhase] = useState(0.25);
  const [muted, setMuted] = useState(false);
  const [fps, setFps] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [invulnerable, setInvulnerable] = useState(false);

  function appendChat(msg: Omit<ChatMsg, 'id' | 'ts'> & { ts?: number }) {
    setChatMessages((prev) => {
      const next = [...prev, { ...msg, id: chatIdCounter++, ts: msg.ts ?? Date.now() }];
      if (next.length > 200) next.splice(0, next.length - 200);
      return next;
    });
  }

  useEffect(() => {
    const audio = getAudio();
    setMuted(audio.isMuted);
  }, []);

  // ---- Crafting handler ----
  const handleCraft = useCallback((recipe: Recipe) => {
    const inv = inventoryRef.current;
    if (!canCraft(inv, recipe)) return;
    const next = craft(inv, recipe);
    inventoryRef.current = next;
    setInventory(next);
    getAudio().playBlockPlace('planks'); // satisfying craft sound
  }, []);

  // Near crafting table? Check if any crafting_table block is within 4 blocks
  const worldRef = useRef<WorldRenderer | null>(null);
  const nearCraftingTable = useCallback((): boolean => {
    const w = worldRef.current;
    const p = playerRef.current;
    if (!w || !p) return false;
    const px = Math.floor(p.position.x);
    const py = Math.floor(p.position.y);
    const pz = Math.floor(p.position.z);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          if (w.getType(px + dx, py + dy, pz + dz) === 'crafting_table') return true;
        }
      }
    }
    return false;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const showFps =
      typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1';

    try {
      const testCtx =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
      if (!testCtx) {
        setWebglError('WebGL is not available. Try Chrome or Edge with hardware acceleration.');
        return;
      }
    } catch (err) {
      setWebglError(`Could not initialize WebGL: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // ---- Three.js scene ----
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 20, 90);

    // ---- Sky shader ----
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
    const starGeom = new THREE.BufferGeometry();
    const starCount = 220;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const phi = Math.random() * Math.PI * 2;
      const theta = Math.random() * Math.PI * 0.5;
      const r = 280;
      starPositions[i * 3 + 0] = Math.sin(theta) * Math.cos(phi) * r;
      starPositions[i * 3 + 1] = Math.cos(theta) * r + 20;
      starPositions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
    }
    starGeom.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 1.4, sizeAttenuation: false,
      transparent: true, opacity: 0, depthWrite: false, fog: false,
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
    const cloudTexture = new THREE.DataTexture(cloudData, cloudTexSize, cloudTexSize, THREE.RGBAFormat);
    cloudTexture.wrapS = THREE.RepeatWrapping;
    cloudTexture.wrapT = THREE.RepeatWrapping;
    cloudTexture.magFilter = THREE.LinearFilter;
    cloudTexture.minFilter = THREE.LinearMipMapLinearFilter;
    cloudTexture.generateMipmaps = true;
    cloudTexture.repeat.set(2, 2);
    cloudTexture.needsUpdate = true;
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTexture, transparent: true, depthWrite: false, fog: false, opacity: 0.7,
    });
    const cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), cloudMat);
    cloudMesh.rotation.x = -Math.PI / 2;
    cloudMesh.position.y = 180;
    cloudMesh.renderOrder = -1;
    scene.add(cloudMesh);

    // ---- Sun + moon ----
    const celestialGroup = new THREE.Group();
    scene.add(celestialGroup);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, fog: false, depthWrite: false });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), sunMat);
    sun.renderOrder = -1;
    celestialGroup.add(sun);
    const sunGlowMat = new THREE.MeshBasicMaterial({ color: 0xffd873, fog: false, transparent: true, opacity: 0.35, depthWrite: false });
    const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 16), sunGlowMat);
    sunGlow.renderOrder = -2;
    celestialGroup.add(sunGlow);
    const sunHaloMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8, fog: false, transparent: true, opacity: 0.18, depthWrite: false });
    const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16), sunHaloMat);
    sunHalo.renderOrder = -3;
    celestialGroup.add(sunHalo);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe6edff, fog: false, depthWrite: false });
    const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), moonMat);
    moon.renderOrder = -1;
    celestialGroup.add(moon);

    // ---- Block highlight ----
    const highlightInnerEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.003, 1.003, 1.003));
    const highlightInnerMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.9, fog: false, depthTest: true });
    const highlightInner = new THREE.LineSegments(highlightInnerEdges, highlightInnerMat);
    highlightInner.visible = false;
    highlightInner.renderOrder = 10;
    scene.add(highlightInner);
    const highlightOuterEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 1.05, 1.05));
    const highlightOuterMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, fog: false, depthTest: true });
    const highlightOuter = new THREE.LineSegments(highlightOuterEdges, highlightOuterMat);
    highlightOuter.visible = false;
    highlightOuter.renderOrder = 9;
    scene.add(highlightOuter);

    // ---- Break-progress cracks overlay ----
    const cracksTexSize = 64;
    const cracksCanvas = document.createElement('canvas');
    cracksCanvas.width = cracksTexSize;
    cracksCanvas.height = cracksTexSize;
    const cracksCtx = cracksCanvas.getContext('2d')!;
    cracksCtx.clearRect(0, 0, cracksTexSize, cracksTexSize);
    cracksCtx.strokeStyle = 'rgba(0,0,0,0.85)';
    cracksCtx.lineCap = 'round';
    cracksCtx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) {
      const x1 = Math.random() * cracksTexSize;
      const y1 = Math.random() * cracksTexSize;
      let cx = x1, cy = y1;
      let angle = Math.random() * Math.PI * 2;
      cracksCtx.beginPath();
      cracksCtx.moveTo(cx, cy);
      const segs = 2 + Math.floor(Math.random() * 3);
      for (let s = 0; s < segs; s++) {
        angle += (Math.random() - 0.5) * 1.2;
        cx += Math.cos(angle) * (4 + Math.random() * 5);
        cy += Math.sin(angle) * (4 + Math.random() * 5);
        cracksCtx.lineTo(cx, cy);
      }
      cracksCtx.stroke();
    }
    const cracksTex = new THREE.CanvasTexture(cracksCanvas);
    cracksTex.needsUpdate = true;
    const cracksMat = new THREE.MeshBasicMaterial({ map: cracksTex, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const cracksGeom = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const cracksMesh = new THREE.Mesh(cracksGeom, cracksMat);
    cracksMesh.visible = false;
    cracksMesh.renderOrder = 11;
    scene.add(cracksMesh);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    scene.add(camera);

    // ---- First-person hand ----
    const handGeom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const handMat = new THREE.MeshStandardMaterial({ color: BLOCKS[BLOCK_TYPES[0]].color, roughness: 0.85, metalness: 0 });
    const hand = new THREE.Mesh(handGeom, handMat);
    hand.castShadow = false;
    hand.receiveShadow = false;
    const HAND_REST_POS = new THREE.Vector3(0.45, -0.45, -0.9);
    const HAND_REST_ROT = new THREE.Euler(-0.25, -0.35, 0);
    hand.position.copy(HAND_REST_POS);
    hand.rotation.copy(HAND_REST_ROT);
    camera.add(hand);
    let handSwingTime = Infinity;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ---- Lighting ----
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
    const hemi = new THREE.HemisphereLight(0x9ec6f7, 0x5a4028, 0.5);
    scene.add(hemi);

    // ---- Water ----
    const waterGeom = new THREE.PlaneGeometry(512, 512);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x2d7bd4, roughness: 0.2, metalness: 0.55, transparent: true, opacity: 0.72 });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, SEA_LEVEL, 0);
    water.receiveShadow = true;
    scene.add(water);

    // World + players + mobs
    const world = new WorldRenderer(scene);
    worldRef.current = world;
    const others = new OtherPlayersManager(scene);
    const cows = new CowManager(scene, world);
    const pigs = new PigManager(scene, world);
    const chickens = new ChickenManager(scene, world);
    const flowers = new FlowerManager(scene);
    let worldSizeLocal = 128;
    let worldHeightLocal = 32;

    // ---- Break particles ----
    type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number; life: number };
    const particles: Particle[] = [];
    const particleGeom = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    const _particleColor = new THREE.Color();
    world.onBlockBroken = (x, y, z, type) => {
      const baseHex = BLOCKS[type].color;
      _particleColor.setHex(baseHex);
      for (let i = 0; i < 6; i++) {
        const mat = new THREE.MeshStandardMaterial({ color: _particleColor.clone(), roughness: 0.8, transparent: true, opacity: 1 });
        const m = new THREE.Mesh(particleGeom, mat);
        m.position.set(x + 0.3 + Math.random() * 0.4, y + 0.3 + Math.random() * 0.4, z + 0.3 + Math.random() * 0.4);
        m.castShadow = false;
        m.receiveShadow = false;
        scene.add(m);
        particles.push({
          mesh: m,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4),
          age: 0,
          life: 0.45,
        });
      }
    };

    // ---- Player ----
    const tempSpawn = { x: 64.5, y: 30, z: 64.5 };
    const player = new PlayerController({ camera, domElement: canvas, world, spawn: tempSpawn });
    playerRef.current = player;

    const audio = getAudio();

    player.onHotbarSelect = (i) => setSelectedSlot(i);
    player.onHotbarScroll = (delta) => {
      setSelectedSlot((prev) => {
        let next = prev + (delta > 0 ? 1 : -1);
        if (next < 0) next = HOTBAR_SIZE - 1;
        if (next >= HOTBAR_SIZE) next = 0;
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
      if (locked) audio.resume().catch(() => {});
    };
    player.onJump = () => audio.playJump();
    player.onFootstep = () => audio.playFootstep();
    player.onBreakProgress = (x, y, z, p) => {
      if (x === null || y === null || z === null) {
        cracksMesh.visible = false;
        cracksMat.opacity = 0;
      } else {
        cracksMesh.visible = true;
        cracksMesh.position.set(x + 0.5, y + 0.5, z + 0.5);
        cracksMat.opacity = Math.min(0.9, p * 0.9);
      }
    };
    player.onInventoryOpen = () => {
      setInventoryOpen((prev) => {
        const next = !prev;
        player.inventoryOpen = next;
        if (next && document.pointerLockElement === canvas) document.exitPointerLock();
        return next;
      });
    };
    // Fall damage: reduce health
    player.onFallDamage = (dmg) => {
      const hp = healthRef.current;
      const newHp = Math.max(0, hp - dmg);
      healthRef.current = newHp;
      setHealth(newHp);
      // Red flash could be added here
    };
    // Tool-aware break speed: return the held item's ItemDef if it's a tool.
    player.getHeldToolDef = () => {
      const slot = inventoryRef.current[selectedRef.current];
      if (!slot) return null;
      const def = ITEMS[slot.item];
      return def.isTool ? def : null;
    };

    // ---- Socket wiring ----
    const socket = getSocket();

    const onConnect = () => {
      setSocketConnected(true);
      socket.emit('join', { username, walletAddress, verifiedBase });
    };
    const onDisconnect = (reason: string) => {
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
      flowers.clear();
      worldSizeLocal = payload.worldSize ?? worldSizeLocal;
      worldHeightLocal = payload.worldHeight ?? worldHeightLocal;
      for (const b of payload.blocks) world.addBlock(b.x, b.y, b.z, b.type);
      setLoadedBlocks(payload.blocks.length);
      for (const op of payload.onlinePlayers) {
        if (op.id === payload.you.id) continue;
        others.add(op);
      }
      setSelfColor(payload.you.color);
      player.setPosition(payload.spawnPoint.x, payload.spawnPoint.y, payload.spawnPoint.z);
      setInvulnerable(true);
      setTimeout(() => setInvulnerable(false), 5000);
    };

    const onWorldChunk = (payload: { blocks: Array<{ x: number; y: number; z: number; type: BlockType }> }) => {
      for (const b of payload.blocks) world.addBlock(b.x, b.y, b.z, b.type);
      setLoadedBlocks((prev) => prev + payload.blocks.length);
    };

    const onWorldComplete = () => {
      setWorldLoaded(true);
      flowers.generate(world, worldSizeLocal, worldHeightLocal);
      cows.spawn(6, 64, 64, 32);
      pigs.spawn(5, 64, 64, 36);
      chickens.spawn(7, 64, 64, 30);
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

    // ---- Player callbacks ----
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
      const t = world.getType(x, y, z);
      if (t) {
        audio.playBlockBreak(t);
        world.removeBlock(x, y, z, true);
        // Drop item (stone → cobblestone, grass → dirt, etc.)
        const drop = getBlockDrop(t);
        const nextInv = addItem(inventoryRef.current, drop, 1);
        inventoryRef.current = nextInv;
        setInventory(nextInv);
        // Decrement tool durability if holding a tool
        const slot = inventoryRef.current[selectedRef.current];
        if (slot) {
          const def = ITEMS[slot.item];
          if (def.isTool && def.durability) {
            const { inv: afterTool, broke } = useTool(inventoryRef.current, selectedRef.current);
            inventoryRef.current = afterTool;
            setInventory(afterTool);
            if (broke) {
              // Tool broke sound — reuse break sound
              audio.playBlockBreak('royal_brick');
            }
          }
        }
      }
      socket.emit('block:break', { x, y, z });
      handSwingTime = 0;
    };

    player.onPlace = (x, y, z) => {
      const slot = inventoryRef.current[selectedRef.current];
      if (!slot) return;
      const def = ITEMS[slot.item];
      if (!def.isBlock) return; // can't place tools
      const type = slot.item as BlockType;
      const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
      inventoryRef.current = nextInv;
      setInventory(nextInv);
      audio.playBlockPlace(type);
      world.addBlock(x, y, z, type, true);
      socket.emit('block:place', { x, y, z, type });
      handSwingTime = 0;
    };

    // ---- Day/night palette ----
    const PALETTE = {
      night: {
        top: new THREE.Color(0x000208), horizon: new THREE.Color(0x0a1545),
        bottom: new THREE.Color(0x1a2860), sun: new THREE.Color(0x4a6cb8),
        hemiSky: new THREE.Color(0x3a4870), hemiGround: new THREE.Color(0x15110a),
        fog: new THREE.Color(0x0a1545),
      },
      day: {
        top: new THREE.Color(0x2a6fd0), horizon: new THREE.Color(0x87ceeb),
        bottom: new THREE.Color(0xc8d8e8), sun: new THREE.Color(0xfff4d6),
        hemiSky: new THREE.Color(0x9ec6f7), hemiGround: new THREE.Color(0x6a5a3a),
        fog: new THREE.Color(0x9ec6f7),
      },
      sunset: {
        top: new THREE.Color(0x0e1840), horizon: new THREE.Color(0xff7a3d),
        bottom: new THREE.Color(0xffb37a), sun: new THREE.Color(0xffb473),
        hemiSky: new THREE.Color(0xffa060), hemiGround: new THREE.Color(0x3a2010),
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

    // Health / hunger accumulators — use floats for smooth sub-frame math,
    // but only push integer-rounded values to React state.
    let healthFloat = MAX_HEALTH;
    let hungerFloat = MAX_HUNGER;

    const tick = () => {
      const dt = clock.getDelta();
      elapsed += dt;
      player.update(dt);
      others.update(dt);
      cows.update(dt, camera.position);
      pigs.update(dt, camera.position);
      chickens.update(dt, camera.position);
      world.update();

      // ---- Hunger drain ----
      const hVel = Math.abs(player.velocity.x) + Math.abs(player.velocity.z);
      const sprinting = hVel > 5;
      const walking = hVel > 0.5;
      const drainRate = sprinting ? HUNGER_DRAIN_SPRINT : walking ? HUNGER_DRAIN_WALK : HUNGER_DRAIN_IDLE;
      hungerFloat = Math.max(0, hungerFloat - drainRate * dt);
      const hungerInt = Math.round(hungerFloat);
      if (hungerInt !== hungerRef.current) {
        hungerRef.current = hungerInt;
        setHunger(hungerInt);
      }

      // ---- Health regen / starvation ----
      if (hungerFloat >= HEALTH_REGEN_HUNGER_MIN && healthFloat < MAX_HEALTH) {
        healthFloat = Math.min(MAX_HEALTH, healthFloat + HEALTH_REGEN_RATE * dt);
      } else if (hungerFloat <= 0 && healthFloat > 0) {
        healthFloat = Math.max(0, healthFloat - STARVATION_RATE * dt);
      }
      // Sync with fall damage (fall damage sets healthRef directly)
      if (healthRef.current < healthFloat) {
        healthFloat = healthRef.current;
      }
      const healthInt = Math.round(healthFloat);
      if (healthInt !== healthRef.current) {
        healthRef.current = healthInt;
        setHealth(healthInt);
      }

      // Death → respawn
      if (healthFloat <= 0) {
        healthFloat = MAX_HEALTH;
        hungerFloat = MAX_HUNGER;
        healthRef.current = MAX_HEALTH;
        hungerRef.current = MAX_HUNGER;
        setHealth(MAX_HEALTH);
        setHunger(MAX_HUNGER);
        player.setPosition(64.5, 30, 64.5);
      }

      // ---- Day/night ----
      const phase = ((elapsed / DAY_LENGTH_SECONDS) + 0.25) % 1;
      const sunAngle = phase * Math.PI * 2 - Math.PI / 2;
      const sy = Math.sin(sunAngle);
      const sx = Math.cos(sunAngle);
      const dayMix = Math.max(0, Math.min(1, (sy + 0.1) * 1.2));
      const sunsetWeight = Math.max(0, 1 - Math.abs(sy) * 4) * Math.max(0, 1 - Math.abs(sy));

      lerp3(PALETTE.night.top, PALETTE.day.top, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.top, sunsetWeight);
      skyMat.uniforms.topColor.value.copy(_tmpCol);
      lerp3(PALETTE.night.horizon, PALETTE.day.horizon, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.horizon, sunsetWeight);
      skyMat.uniforms.horizonColor.value.copy(_tmpCol);
      lerp3(PALETTE.night.bottom, PALETTE.day.bottom, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.bottom, sunsetWeight);
      skyMat.uniforms.bottomColor.value.copy(_tmpCol);
      lerp3(PALETTE.night.fog, PALETTE.day.fog, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.fog, sunsetWeight);
      (scene.fog as THREE.Fog).color.copy(_tmpCol);
      scene.background = _tmpCol.clone();

      const sunRadius = 220;
      sun.position.set(sx * sunRadius, sy * 150, 40);
      sunGlow.position.copy(sun.position);
      sunHalo.position.copy(sun.position);
      moon.position.set(-sx * sunRadius, -sy * 150, 40);
      sunLight.position.set(camera.position.x + sx * 120, camera.position.y + Math.max(20, sy * 150), camera.position.z + 40);
      sunLight.target.position.copy(camera.position);
      lerp3(PALETTE.night.sun, PALETTE.day.sun, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.sun, sunsetWeight);
      sunLight.color.copy(_tmpCol);
      sunLight.intensity = 0.05 + 1.35 * Math.max(0, sy);
      sun.visible = sy > -0.05;
      sunGlow.visible = sun.visible;
      sunHalo.visible = sun.visible;
      moon.visible = sy < 0.05;
      if (sy < 0 && sunLight.castShadow) sunLight.castShadow = false;
      else if (sy >= 0.05 && !sunLight.castShadow && !shadowsDisabled) sunLight.castShadow = true;
      lerp3(PALETTE.night.hemiSky, PALETTE.day.hemiSky, dayMix, _tmpCol);
      _tmpCol.lerp(PALETTE.sunset.hemiSky, sunsetWeight);
      hemi.color.copy(_tmpCol);
      lerp3(PALETTE.night.hemiGround, PALETTE.day.hemiGround, dayMix, _tmpCol2);
      hemi.groundColor.copy(_tmpCol2);
      hemi.intensity = 0.15 + 0.4 * dayMix;
      starMat.opacity = Math.max(0, 1 - dayMix * 3);
      stars.visible = starMat.opacity > 0.02;
      cloudMat.opacity = 0.25 + 0.45 * dayMix;
      if (cloudTexture.offset) cloudTexture.offset.x = (elapsed * 0.008) % 1;
      celestialGroup.position.copy(camera.position);
      cloudMesh.position.x = camera.position.x;
      cloudMesh.position.z = camera.position.z;
      stars.position.copy(camera.position);
      if (Math.floor(elapsed * 10) !== Math.floor((elapsed - dt) * 10)) {
        setDayPhase(phase);
      }
      water.position.x = camera.position.x;
      water.position.z = camera.position.z;
      water.position.y = SEA_LEVEL + Math.sin(elapsed * 0.4) * 0.06;
      const altitudeWind = Math.max(0, Math.min(1, (camera.position.y - 15) / 30));
      audio.setAmbientWind(altitudeWind);

      // ---- Hand ----
      const heldSlot = inventoryRef.current[selectedRef.current];
      if (heldSlot) {
        const heldDef = ITEMS[heldSlot.item];
        const heldColor = BLOCKS[heldSlot.item as BlockType]?.color ?? parseInt(heldDef.color.replace('#', ''), 16);
        handMat.color.setHex(heldColor);
        hand.visible = true;
        // Tool: show rotated / elongated
        if (heldDef.isTool) {
          hand.scale.set(0.2, 0.8, 0.2);
        } else {
          hand.scale.set(1, 1, 1);
        }
      } else {
        hand.visible = false;
      }
      if (handSwingTime !== Infinity) {
        handSwingTime += dt;
        const swingDur = 0.25;
        if (handSwingTime >= swingDur) {
          handSwingTime = Infinity;
          hand.position.copy(HAND_REST_POS);
          hand.rotation.copy(HAND_REST_ROT);
        } else {
          const t = handSwingTime / swingDur;
          const swing = Math.sin(t * Math.PI);
          hand.rotation.x = HAND_REST_ROT.x - swing * 0.9;
          hand.rotation.z = HAND_REST_ROT.z + swing * 0.25;
          hand.position.y = HAND_REST_POS.y - swing * 0.18;
          hand.position.z = HAND_REST_POS.z + swing * 0.1;
        }
      }

      // Block highlight
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

      // Break particles
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

      // FPS + auto-disable shadows
      if (dt > 0) {
        frameSamples.push(1 / dt);
        if (frameSamples.length > 60) frameSamples.shift();
      }
      if (showFps && frameSamples.length > 0) {
        if (Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) {
          const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
          setFps(avg);
        }
      }
      if (frameSamples.length >= 30) {
        const avg = frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length;
        if (avg < 35 && !shadowsDisabled) {
          if (lowFpsSince === 0) lowFpsSince = elapsed;
          if (elapsed - lowFpsSince > 3) {
            shadowsDisabled = true;
            sunLight.castShadow = false;
            renderer.shadowMap.enabled = false;
          }
        } else {
          lowFpsSince = 0;
        }
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onReenableShadows = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'g' && shadowsDisabled) {
        shadowsDisabled = false;
        renderer.shadowMap.enabled = true;
      }
    };
    window.addEventListener('keydown', onReenableShadows);

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

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
      worldRef.current = null;
      others.clear();
      cows.clear();
      pigs.clear();
      chickens.clear();
      flowers.clear();
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
      cracksGeom.dispose();
      cracksMat.dispose();
      cracksTex.dispose();
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

  useEffect(() => {
    if (playerRef.current) playerRef.current.chatOpen = chatOpen;
  }, [chatOpen]);

  const handleToggleMute = () => {
    const now = getAudio().toggleMute();
    setMuted(now);
  };

  // Label for selected item
  const heldSlot = inventory[selectedSlot];
  const heldLabel = heldSlot ? ITEMS[heldSlot.item].label : '';

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #1a3ea8 0%, #6a95e6 100%)' }}
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

      <HealthHunger
        health={health}
        maxHealth={MAX_HEALTH}
        hunger={hunger}
        maxHunger={MAX_HUNGER}
      />

      <Hotbar
        slots={inventory.slice(0, HOTBAR_SIZE)}
        selected={selectedSlot}
        onSelect={(i) => setSelectedSlot(i)}
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

      {/* Item label above hotbar */}
      {heldLabel && (
        <div
          className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 px-3 py-1"
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px',
            color: 'rgba(255,255,255,0.85)',
            background: 'rgba(0,0,0,0.5)',
            border: '1px solid rgba(255,255,255,0.1)',
            textShadow: '1px 1px 0 rgba(0,0,0,0.7)',
          }}
        >
          {heldLabel}
        </div>
      )}

      {/* Inventory screen */}
      {inventoryOpen && (
        <InventoryScreen
          inventory={inventory}
          onInventoryChange={(inv) => {
            inventoryRef.current = inv;
            setInventory(inv);
          }}
          onCraft={handleCraft}
          nearCraftingTable={nearCraftingTable()}
          onClose={() => {
            setInventoryOpen(false);
            if (playerRef.current) playerRef.current.inventoryOpen = false;
          }}
        />
      )}

      {/* WebGL error */}
      {webglError && (
        <div className="pointer-events-auto absolute inset-0 flex items-center justify-center p-6">
          <div className="bc-panel p-6 text-center" style={{ maxWidth: '400px' }}>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '12px',
                color: '#ff6666',
                marginBottom: '8px',
              }}
            >
              CANNOT START
            </div>
            <div style={{ fontFamily: "'VT323', monospace", fontSize: '16px', color: 'rgba(255,255,255,0.8)' }}>
              {webglError}
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {!webglError && (!socketConnected || !worldLoaded) && (
        <div className="pointer-events-none absolute inset-0 mc-dirt-bg flex items-center justify-center">
          <div className="bc-panel px-8 py-6 text-center">
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '16px',
                color: '#fff',
                textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
                marginBottom: '12px',
              }}
            >
              BASECRAFT
            </div>
            {!socketConnected ? (
              <>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: '18px', color: 'rgba(255,255,255,0.8)' }}>
                  Connecting to server...
                </div>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                  First connect can take ~30s while the world wakes up.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: '18px', color: 'rgba(255,255,255,0.8)' }}>
                  Loading world...
                </div>
                <div style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                  {loadedBlocks.toLocaleString()} blocks loaded
                </div>
              </>
            )}
            <div className="mt-4 flex justify-center">
              <div style={{ width: '128px', height: '4px', background: '#333', border: '1px solid #555' }}>
                <div
                  className="animate-pulse"
                  style={{ height: '100%', width: '33%', background: '#5cb85c' }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Click-to-play overlay */}
      {!pointerLocked && !chatOpen && !inventoryOpen && worldLoaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="bc-panel px-8 py-6 text-center">
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '14px',
                color: '#fff',
                textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
                marginBottom: '12px',
              }}
            >
              CLICK TO PLAY
            </div>
            <div
              className="space-y-1"
              style={{
                fontFamily: "'VT323', monospace",
                fontSize: '18px',
                color: 'rgba(255,255,255,0.8)',
                textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
              }}
            >
              <div><span style={{ color: '#ffff55' }}>MOUSE</span> — Look around</div>
              <div><span style={{ color: '#ffff55' }}>W A S D</span> — Move</div>
              <div><span style={{ color: '#ffff55' }}>SPACE</span> — Jump · <span style={{ color: '#ffff55' }}>SHIFT</span> — Sprint · <span style={{ color: '#ffff55' }}>CTRL</span> — Sneak</div>
              <div><span style={{ color: '#ffff55' }}>HOLD LEFT CLICK</span> — Mine · <span style={{ color: '#ffff55' }}>RIGHT CLICK</span> — Place</div>
              <div><span style={{ color: '#ffff55' }}>1-9</span> — Select slot · <span style={{ color: '#ffff55' }}>E</span> — Inventory/Craft</div>
              <div><span style={{ color: '#ffff55' }}>F</span> — Fly · <span style={{ color: '#ffff55' }}>T</span> — Chat</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          className="pointer-events-auto absolute left-1/2 top-20 -translate-x-1/2 px-4 py-2"
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '16px',
            color: '#ff8888',
            background: 'rgba(0,0,0,0.7)',
            border: '2px solid #7a2a2a',
            textShadow: '1px 1px 0 rgba(0,0,0,0.7)',
          }}
        >
          {error}
          <button
            className="ml-3 underline"
            style={{ color: '#ff6666' }}
            onClick={() => setError(null)}
          >
            dismiss
          </button>
        </div>
      )}
    </div>
  );
}
