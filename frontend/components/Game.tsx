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
  FOOD_ITEMS,
  createInventory,
  addItem,
  removeFromSlot,
  useTool,
  getBlockDrop,
  BLOCK_XP,
  ArmorSlots,
  createArmorSlots,
  applyArmorReduction,
  countItem,
  removeItem,
  INVENTORY_SIZE,
  getArmorDefense,
} from '@/lib/items';
import { RECIPES, Recipe, canCraft, craft } from '@/lib/recipes';
import { getAudio } from '@/lib/audio';
import {
  PlayerStats,
  LandClaim,
  BalanceTier,
} from '@/lib/chain/types';
import {
  getTierForBalance,
  getTierInfo,
  canAccessBlock,
  TIER_COSMETICS,
  TIER_XP_MULTIPLIER,
  TIER_KILL_BOUNTY,
  WALLET_REWARD_INTERVAL_MS,
  TIER_MAX_ENCHANT,
  TIER_BEACON_MULTIPLIER,
  TIER_MINING_SPEED,
  TIER_SPEED_BONUS,
  TIER_KEEP_INVENTORY,
  TIER_LUCKY_MINING,
  CAMPFIRE_COOK_INTERVAL,
  TIER_DAMAGE_REDUCTION,
  TIER_RESPAWN_PROTECTION,
  TIER_MOB_DROP_BONUS,
} from '@/lib/chain/constants';
import {
  ACHIEVEMENT_DEFS,
  checkNewAchievements,
  getAchievementDef,
} from '@/lib/chain/achievements';
import {
  getChunkCoords,
  chunkKey,
  canModifyBlock,
} from '@/lib/chain/landClaims';
import { WorldRenderer } from './World';
import { PlayerController } from './Player';
import { OtherPlayersManager } from './OtherPlayers';
import { CowManager, PigManager, ChickenManager, ZombieManager, SkeletonManager, CreeperManager, SpiderManager, WolfManager, EndermanManager, IronGolemManager, SlimeManager, BatManager, VillagerManager, WitchManager, BlazeManager, PhantomManager, FoxManager, GhastManager, ParrotManager, TurtleManager, WardenManager } from './Mobs';
import { FlowerManager } from './Flowers';
import Hotbar from './Hotbar';
import Chat, { ChatMsg } from './Chat';
import HUD from './HUD';
import PlayerList from './PlayerList';
import HealthHunger from './HealthHunger';
import InventoryScreen from './InventoryScreen';
import DeathScreen from './DeathScreen';
import XPBar, { computeLevel } from './XPBar';
import ProfilePanel from './panels/ProfilePanel';
import LeaderboardPanel from './panels/LeaderboardPanel';
import AchievementToast from './panels/AchievementToast';
import AchievementPanel from './panels/AchievementPanel';
import LandClaimPanel from './panels/LandClaimPanel';
import TierPerksPanel from './panels/TierPerksPanel';
import ControlsPanel from './panels/ControlsPanel';
import SettingsPanel from './panels/SettingsPanel';
import BountyBoard from './panels/BountyBoard';
import Minimap from './Minimap';

interface Props {
  username: string;
  walletAddress?: string;
  verifiedBase?: boolean;
  ethBalance?: bigint;
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

export default function Game({ username, walletAddress, verifiedBase, ethBalance }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<PlayerController | null>(null);

  // ---- Inventory (slot-based) ----
  const [inventory, setInventory] = useState<Inventory>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('bc_inventory');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length === 36) return parsed;
        }
      } catch {}
    }
    return createInventory();
  });
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

  // ---- XP ----
  const [totalXp, setTotalXp] = useState(0);
  const totalXpRef = useRef(0);
  useEffect(() => { totalXpRef.current = totalXp; }, [totalXp]);

  // ---- Armor ----
  const [armor, setArmor] = useState<ArmorSlots>(createArmorSlots);
  const armorRef = useRef<ArmorSlots>(armor);
  useEffect(() => { armorRef.current = armor; }, [armor]);

  // ---- Shield / blocking ----
  const [isBlocking, setIsBlocking] = useState(false);
  const isBlockingRef = useRef(false);
  useEffect(() => { isBlockingRef.current = isBlocking; }, [isBlocking]);

  // ---- Breath (for drowning HUD) ----
  const [breath, setBreath] = useState(10);
  const breathRef = useRef(10);

  // ---- On-chain: Balance tier ----
  const balanceTier: BalanceTier = walletAddress && ethBalance !== undefined
    ? getTierForBalance(ethBalance) : verifiedBase ? 'base' : 'none';
  const tierInfo = getTierInfo(balanceTier);

  // ---- On-chain: Stats tracking ----
  const statsRef = useRef<PlayerStats>({
    blocksPlaced: 0, blocksBroken: 0, mobsKilled: 0, deaths: 0,
    playTimeSeconds: 0, diamondsFound: 0,
    itemsCrafted: 0, itemsEnchanted: 0, villagerTrades: 0,
    emeraldsEarned: 0, beaconsPlaced: 0, enderPearlsThrown: 0,
    distanceWalked: 0, highestY: 0, lowestY: 64, longestLifeSeconds: 0,
    currentLifeSeconds: 0, walletConnected: false, currentTier: 'none',
    copperMined: 0, amethystMined: 0,
    luckyDrops: 0, maxMiningCombo: 0,
    fishCaught: 0, foodEaten: 0, maxKillStreak: 0, currentLevel: 0,
    baseCoinsCollected: 0,
  });

  // ---- On-chain: Achievements ----
  const [earnedAchievements, setEarnedAchievements] = useState<Set<string>>(new Set());
  const earnedRef = useRef<Set<string>>(new Set());
  const [achievementToast, setAchievementToast] = useState<{ id: string; name: string; description: string; icon: string } | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  // ---- On-chain: Leaderboard ----
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<Array<{ rank: number; username: string; score: number; blocks_placed: number; mobs_killed: number; balance_tier: string }>>([]);

  // ---- On-chain: Profile ----
  const [profileOpen, setProfileOpen] = useState(false);

  // ---- On-chain: Land claims ----
  const [tierPerksOpen, setTierPerksOpen] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bountyBoardOpen, setBountyBoardOpen] = useState(false);
  const [gameVolume, setGameVolume] = useState(1.0);
  const [gameFov, setGameFov] = useState(75);
  const [renderDist, setRenderDist] = useState(90);
  const [shadowsOn, setShadowsOn] = useState(true);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [landClaims, setLandClaims] = useState<Map<string, LandClaim>>(new Map());
  const landClaimsRef = useRef<Map<string, LandClaim>>(new Map());
  const [landClaimOpen, setLandClaimOpen] = useState(false);

  // ---- Inventory screen ----
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const inventoryOpenRef = useRef(false);
  useEffect(() => { inventoryOpenRef.current = inventoryOpen; }, [inventoryOpen]);

  // ---- Death screen ----
  const [isDead, setIsDead] = useState(false);
  const [deathCause, setDeathCause] = useState<string>('Died');

  // ---- Chat ----
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  useEffect(() => { chatOpenRef.current = chatOpen; }, [chatOpen]);

  // ---- Misc HUD state ----
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });
  const [showCoords, setShowCoords] = useState(true);
  const [onlinePlayers, setOnlinePlayers] = useState<Array<{ id: string; username: string; color: string }>>([]);
  const [minimapPlayers, setMinimapPlayers] = useState<Array<{ x: number; z: number; color: string; username: string }>>([]);
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
  const [killFeed, setKillFeed] = useState<Array<{ id: number; text: string; ts: number }>>([]);
  const [invulnerable, setInvulnerable] = useState(false);
  const invulnerableRef = useRef(false);

  // ---- Weather system ----
  const [weatherType, setWeatherType] = useState<'clear' | 'rain' | 'thunder'>('clear');
  const [showMinimap, setShowMinimap] = useState(true);
  // ---- Bed spawn point ----
  const spawnPointRef = useRef<{ x: number; y: number; z: number } | null>(null);
  // ---- Compass ----
  const [hasCompass, setHasCompass] = useState(false);
  // ---- Fishing cooldown ----
  const fishingCooldownRef = useRef(0);
  const weatherRef = useRef<'clear' | 'rain' | 'thunder'>('clear');
  // ---- Potion effects ----
  const [activePotion, setActivePotion] = useState<string | null>(null);
  const potionTimerRef = useRef(0);
  const potionTypeRef = useRef<string | null>(null);
  // ---- Door states (open/closed) ----
  const openDoorsRef = useRef<Set<string>>(new Set());
  // ---- Spyglass zoom ----
  const [spyglassActive, setSpyglassActive] = useState(false);
  const spyglassRef = useRef(false);
  // ---- Sign text storage ----
  const signTextsRef = useRef<Map<string, string>>(new Map());
  // ---- Noteblock pitch ----
  const noteblockPitchRef = useRef<Map<string, number>>(new Map());
  // ---- Lever states (on/off) ----
  const leverStatesRef = useRef<Set<string>>(new Set());
  // ---- Enchantment tracking ----
  const enchantedItemsRef = useRef<Map<number, string>>(new Map()); // slot → enchantment name
  // ---- On-chain: wallet reward timer ----
  const lastWalletRewardRef = useRef(0);
  // ---- Beacon active buffs ----
  const beaconBuffsRef = useRef<{ speed: number; regen: number; strength: number }>({ speed: 0, regen: 0, strength: 0 });
  // ---- Ender pearl cooldown ----
  const enderPearlCdRef = useRef(0);
  // ---- Visual overlays ----
  const [damageFlash, setDamageFlash] = useState(0); // 0..1 opacity
  const [isUnderwater, setIsUnderwater] = useState(false);
  const damageFlashRef = useRef(0);
  // ---- Biome detection ----
  const [currentBiome, setCurrentBiome] = useState<string>('Plains');
  const currentBiomeRef = useRef('Plains');
  // ---- Mining combo display ----
  const [miningComboDisplay, setMiningComboDisplay] = useState(0);
  // ---- Beacon active state ----
  const [beaconActive, setBeaconActive] = useState(false);
  // ---- Creeper proximity warning ----
  const [creeperNear, setCreeperNear] = useState(false);
  const creeperNearRef = useRef(false);
  // ---- Custom home points (wallet-gated) ----
  const customHomesRef = useRef<Map<string, { x: number; y: number; z: number }>>(new Map());
  // ---- Freezing effect in snowy biomes ----
  const [freezing, setFreezing] = useState(0); // 0..1 frost intensity
  const freezingRef = useRef(0);
  // ---- Low health heartbeat ----
  const lastHeartbeatRef = useRef(0);
  // ---- Daily challenge (wallet-exclusive) ----
  const [dailyChallenge, setDailyChallenge] = useState<{
    type: string; target: number; current: number; reward: string; completed: boolean;
    rewardItem?: ItemType; rewardCount?: number;
  } | null>(null);

  // Helper: advance daily challenge by 1 if type matches keywords
  function advanceDailyChallenge(...keywords: string[]) {
    setDailyChallenge(prev => {
      if (!prev || prev.completed) return prev;
      const lower = prev.type.toLowerCase();
      if (!keywords.some(k => lower.includes(k))) return prev;
      const next = { ...prev, current: prev.current + 1 };
      if (next.current >= next.target) {
        next.completed = true;
        setToast(`🏆 Daily Challenge Complete! ${next.reward}`);
        setTimeout(() => setToast(null), 3000);
        // Deliver reward items
        if (next.rewardItem && next.rewardCount) {
          const newInv = addItem(inventoryRef.current, next.rewardItem, next.rewardCount);
          inventoryRef.current = newInv;
          setInventory(newInv);
        }
        // Save completion
        const today = new Date().toISOString().split('T')[0];
        try { window.localStorage.setItem(`bc_challenge_${today}`, JSON.stringify(next)); } catch {}
      }
      return next;
    });
  }

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
    // On-chain check: wallet-exclusive blocks require sufficient tier
    const resultDef = ITEMS[recipe.result.item];
    if (resultDef.walletExclusive) {
      const requiredTier = resultDef.requiredTier ?? 'base';
      if (!canAccessBlock(recipe.result.item, balanceTier)) {
        const info = getTierInfo(requiredTier as BalanceTier);
        setToast(`⛓ Need ${info.label} tier to craft ${resultDef.label}!`);
        setTimeout(() => setToast(null), 3000);
        return;
      }
    }
    const next = craft(inv, recipe);
    inventoryRef.current = next;
    setInventory(next);
    statsRef.current.itemsCrafted++;
    getAudio().playBlockPlace('planks');
    // Daily challenge progress: craft items
    advanceDailyChallenge('craft');
  }, [balanceTier]);

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

  // Near furnace?
  const nearFurnace = useCallback((): boolean => {
    const w = worldRef.current;
    const p = playerRef.current;
    if (!w || !p) return false;
    const px = Math.floor(p.position.x);
    const py = Math.floor(p.position.y);
    const pz = Math.floor(p.position.z);
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -4; dz <= 4; dz++) {
          if (w.getType(px + dx, py + dy, pz + dz) === 'furnace') return true;
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

    // ---- BASECRAFT sky logo (Base branding) ----
    // Generate a canvas texture with the "BASECRAFT" text in Base blue
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 1024;
    logoCanvas.height = 256;
    const lctx = logoCanvas.getContext('2d')!;
    // Transparent background
    lctx.clearRect(0, 0, 1024, 256);
    // Base blue gradient text
    const logoGrad = lctx.createLinearGradient(0, 0, 0, 256);
    logoGrad.addColorStop(0, '#3478f6');
    logoGrad.addColorStop(0.5, '#0052ff');
    logoGrad.addColorStop(1, '#0033aa');
    lctx.fillStyle = logoGrad;
    lctx.font = 'bold 150px "Press Start 2P", monospace';
    lctx.textAlign = 'center';
    lctx.textBaseline = 'middle';
    // Drop shadow
    lctx.shadowColor = 'rgba(0,0,0,0.8)';
    lctx.shadowBlur = 12;
    lctx.shadowOffsetX = 4;
    lctx.shadowOffsetY = 4;
    lctx.fillText('BASECRAFT', 512, 128);
    // Reset shadow, add outline
    lctx.shadowColor = 'transparent';
    lctx.strokeStyle = '#ffffff';
    lctx.lineWidth = 3;
    lctx.strokeText('BASECRAFT', 512, 128);
    const logoTex = new THREE.CanvasTexture(logoCanvas);
    logoTex.needsUpdate = true;
    const logoMat = new THREE.SpriteMaterial({
      map: logoTex,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    });
    const logoSprite = new THREE.Sprite(logoMat);
    logoSprite.scale.set(180, 45, 1);
    logoSprite.position.set(0, 140, -180); // high in the sky, slightly north
    logoSprite.renderOrder = 5;
    scene.add(logoSprite);

    // "Built on Base" subtitle
    const subCanvas = document.createElement('canvas');
    subCanvas.width = 1024;
    subCanvas.height = 128;
    const sctx = subCanvas.getContext('2d')!;
    sctx.clearRect(0, 0, 1024, 128);
    sctx.fillStyle = '#0052ff';
    sctx.font = 'bold 60px "Press Start 2P", monospace';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.shadowColor = 'rgba(0,0,0,0.7)';
    sctx.shadowBlur = 8;
    sctx.shadowOffsetY = 3;
    sctx.fillText('⬢ BUILT ON BASE ⬢', 512, 64);
    const subTex = new THREE.CanvasTexture(subCanvas);
    const subMat = new THREE.SpriteMaterial({
      map: subTex,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
    });
    const subSprite = new THREE.Sprite(subMat);
    subSprite.scale.set(120, 15, 1);
    subSprite.position.set(0, 115, -180);
    subSprite.renderOrder = 5;
    scene.add(subSprite);

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
    cameraRef.current = camera;
    sceneRef.current = scene;

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
    rendererRef.current = renderer;

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

    // ---- Held torch/lantern point light ----
    const holdLight = new THREE.PointLight(0xffaa44, 1.5, 15);
    holdLight.visible = false;
    scene.add(holdLight);

    // ---- Water ----
    const waterGeom = new THREE.PlaneGeometry(512, 512);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x2d7bd4, roughness: 0.2, metalness: 0.55, transparent: true, opacity: 0.72 });
    const water = new THREE.Mesh(waterGeom, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, SEA_LEVEL, 0);
    water.receiveShadow = true;
    scene.add(water);

    // ---- Rain particles ----
    const rainCount = 500;
    const rainGeom = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3 + 0] = (Math.random() - 0.5) * 80;
      rainPositions[i * 3 + 1] = Math.random() * 40 + 10;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 80;
    }
    rainGeom.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0x9aaedd, size: 0.12, transparent: true, opacity: 0.6,
      depthWrite: false, sizeAttenuation: true,
    });
    const rainMesh = new THREE.Points(rainGeom, rainMat);
    rainMesh.visible = false;
    scene.add(rainMesh);

    // Snow particle system
    const snowCount = 400;
    const snowGeom = new THREE.BufferGeometry();
    const snowPositions = new Float32Array(snowCount * 3);
    for (let i = 0; i < snowCount; i++) {
      snowPositions[i * 3 + 0] = (Math.random() - 0.5) * 60;
      snowPositions[i * 3 + 1] = Math.random() * 30 + 10;
      snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    snowGeom.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    const snowMat = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.18, transparent: true, opacity: 0.85,
      depthWrite: false, sizeAttenuation: true,
    });
    const snowMesh = new THREE.Points(snowGeom, snowMat);
    snowMesh.visible = false;
    scene.add(snowMesh);

    // Lightning bolt visual
    const boltGeom = new THREE.BufferGeometry();
    const boltMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2, transparent: true, opacity: 0.9 });
    const boltLine = new THREE.Line(boltGeom, boltMat);
    boltLine.visible = false;
    scene.add(boltLine);
    let boltTimer = 0;

    let currentWeather: 'clear' | 'rain' | 'thunder' = 'clear';
    let lightningFlashTimer = 0;
    let rainSoundTimer = 0;

    // World + players + mobs
    const world = new WorldRenderer(scene);
    worldRef.current = world;
    const others = new OtherPlayersManager(scene);
    const cows = new CowManager(scene, world);
    const pigs = new PigManager(scene, world);
    const chickens = new ChickenManager(scene, world);
    const zombies = new ZombieManager(scene, world);
    const skeletons = new SkeletonManager(scene, world);
    const creepers = new CreeperManager(scene, world);
    const spiders = new SpiderManager(scene, world);
    const wolves = new WolfManager(scene, world);
    const endermen = new EndermanManager(scene, world);
    const ironGolems = new IronGolemManager(scene, world);
    const slimes = new SlimeManager(scene, world);
    const bats = new BatManager(scene, world);
    const villagers = new VillagerManager(scene, world);
    const witches = new WitchManager(scene, world);
    const blazes = new BlazeManager(scene, world);
    const phantoms = new PhantomManager(scene, world);
    const foxes = new FoxManager(scene, world);
    const ghasts = new GhastManager(scene, world);
    const parrots = new ParrotManager(scene, world);
    const turtles = new TurtleManager(scene, world);
    const wardens = new WardenManager(scene, world);
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
      const count = 8 + Math.floor(Math.random() * 4); // 8-11 particles
      for (let i = 0; i < count; i++) {
        // Vary color slightly for each particle
        const variedColor = _particleColor.clone();
        variedColor.offsetHSL(0, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.15);
        const size = 0.08 + Math.random() * 0.12;
        const geom = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ color: variedColor, roughness: 0.8, transparent: true, opacity: 1 });
        const m = new THREE.Mesh(geom, mat);
        m.position.set(x + 0.2 + Math.random() * 0.6, y + 0.2 + Math.random() * 0.6, z + 0.2 + Math.random() * 0.6);
        m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
        m.castShadow = false;
        m.receiveShadow = false;
        scene.add(m);
        particles.push({
          mesh: m,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 5,
            1.5 + Math.random() * 4,
            (Math.random() - 0.5) * 5
          ),
          age: 0,
          life: 0.4 + Math.random() * 0.3,
        });
      }
    };

    // ---- Place particles (subtle puff when a block is placed) ----
    world.onBlockPlaced = (x, y, z, type) => {
      const baseHex = BLOCKS[type].color;
      _particleColor.setHex(baseHex);
      for (let i = 0; i < 4; i++) {
        const variedColor = _particleColor.clone();
        variedColor.offsetHSL(0, 0, 0.15); // lighter puff
        const mat = new THREE.MeshStandardMaterial({ color: variedColor, roughness: 0.8, transparent: true, opacity: 0.7 });
        const m = new THREE.Mesh(particleGeom, mat);
        m.position.set(x + 0.3 + Math.random() * 0.4, y + Math.random() * 0.3, z + 0.3 + Math.random() * 0.4);
        m.castShadow = false;
        m.receiveShadow = false;
        scene.add(m);
        particles.push({
          mesh: m,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2),
          age: 0,
          life: 0.3,
        });
      }
    };

    // ---- Torch particles ----
    type TorchParticle = { mesh: THREE.Mesh; age: number; life: number; baseY: number };
    const torchParticles: TorchParticle[] = [];
    const torchParticleGeom = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    let lastTorchParticleSpawn = 0;

    // ---- Dynamic torch point lights (max 4 nearest torches) ----
    const MAX_TORCH_LIGHTS = 4;
    const torchLights: THREE.PointLight[] = [];
    for (let i = 0; i < MAX_TORCH_LIGHTS; i++) {
      const tl = new THREE.PointLight(0xffaa44, 0, 6);
      tl.castShadow = false;
      scene.add(tl);
      torchLights.push(tl);
    }
    let lastTorchLightUpdate = 0;

    // ---- XP orbs ----
    type XPOrb = { mesh: THREE.Mesh; velocity: THREE.Vector3; age: number; life: number };
    const xpOrbs: XPOrb[] = [];
    const xpOrbGeom = new THREE.SphereGeometry(0.08, 6, 6);
    const xpOrbMat = new THREE.MeshStandardMaterial({ color: 0x88ff44, emissive: 0x44cc22, emissiveIntensity: 0.8, transparent: true });

    function spawnXPOrbs(x: number, y: number, z: number, count: number) {
      for (let i = 0; i < count; i++) {
        const mat = xpOrbMat.clone();
        const m = new THREE.Mesh(xpOrbGeom, mat);
        m.position.set(x + 0.5, y + 0.5, z + 0.5);
        m.castShadow = false;
        scene.add(m);
        xpOrbs.push({
          mesh: m,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2),
          age: 0,
          life: 1.2,
        });
      }
    }

    // ---- Arrow projectiles (visual) ----
    type ArrowProjectile = {
      mesh: THREE.Mesh;
      velocity: THREE.Vector3;
      age: number;
    };
    const arrowProjectiles: ArrowProjectile[] = [];
    const arrowGeom = new THREE.BoxGeometry(0.06, 0.06, 0.5);
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3a });

    // ---- Base coins (collectible Base-themed pickups) ----
    type BaseCoin = { group: THREE.Group; baseY: number; collected: boolean; spinPhase: number };
    const baseCoins: BaseCoin[] = [];
    // Hexagonal Base coin geometry (cylinder with 6 sides = hexagon)
    const coinGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.08, 6);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0x0052ff, emissive: 0x0052ff, emissiveIntensity: 0.5,
      metalness: 0.8, roughness: 0.3,
    });
    const coinGlowMat = new THREE.MeshBasicMaterial({
      color: 0x3478f6, transparent: true, opacity: 0.35,
    });
    function spawnBaseCoin(x: number, y: number, z: number) {
      const g = new THREE.Group();
      const coin = new THREE.Mesh(coinGeom, coinMat);
      coin.rotation.x = Math.PI / 2; // stand upright
      g.add(coin);
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 6), coinGlowMat);
      glow.rotation.x = Math.PI / 2;
      g.add(glow);
      g.position.set(x, y, z);
      scene.add(g);
      baseCoins.push({ group: g, baseY: y, collected: false, spinPhase: Math.random() * Math.PI * 2 });
    }
    function spawnArrow(origin: THREE.Vector3, direction: THREE.Vector3) {
      const mesh = new THREE.Mesh(arrowGeom, arrowMat.clone());
      mesh.position.copy(origin);
      mesh.lookAt(origin.clone().add(direction));
      scene.add(mesh);
      arrowProjectiles.push({
        mesh,
        velocity: direction.clone().multiplyScalar(30), // fast arrow
        age: 0,
      });
    }

    // ---- Tier aura particles ----
    type AuraParticle = { mesh: THREE.Mesh; age: number; life: number; offset: THREE.Vector3; speed: number };
    const auraParticles: AuraParticle[] = [];
    const auraGeom = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const TIER_AURA_COLORS: Record<string, number> = {
      none: 0x000000, base: 0x0052ff, bronze: 0xcd7f32, silver: 0xc0c0c0, gold: 0xffd700, diamond: 0x4de8e0,
    };
    let lastAuraSpawn = 0;

    // ---- Block selection outline (wireframe cube showing targeted block) ----
    const selectionGeom = new THREE.BoxGeometry(1.005, 1.005, 1.005);
    const selectionEdges = new THREE.EdgesGeometry(selectionGeom);
    const selectionLine = new THREE.LineSegments(
      selectionEdges,
      new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.6, depthTest: true })
    );
    selectionLine.visible = false;
    selectionLine.renderOrder = 999;
    scene.add(selectionLine);

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
    player.onFootstep = () => {
      // Terrain-aware footstep: detect block under feet
      const fx = Math.floor(player.position.x);
      const fy = Math.floor(player.position.y) - 1;
      const fz = Math.floor(player.position.z);
      const footBlock = world.getType(fx, fy, fz);
      audio.playFootstep(footBlock ?? undefined);
      // Sprint particles: kick up dirt behind the player when moving fast
      const hSpeed = Math.sqrt(player.velocity.x ** 2 + player.velocity.z ** 2);
      if (hSpeed > 5.5 && footBlock && footBlock !== 'water') {
        const blockColor = BLOCKS[footBlock as BlockType]?.color ?? 0x8B7355;
        const mat = new THREE.MeshStandardMaterial({ color: blockColor, roughness: 1, transparent: true, opacity: 0.6 });
        const m = new THREE.Mesh(particleGeom, mat);
        m.position.set(player.position.x + (Math.random() - 0.5) * 0.4, fy + 1.05, player.position.z + (Math.random() - 0.5) * 0.4);
        m.castShadow = false; m.receiveShadow = false;
        scene.add(m);
        particles.push({
          mesh: m,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.3 + Math.random() * 0.8, (Math.random() - 0.5) * 1.5),
          age: 0, life: 0.25 + Math.random() * 0.2,
        });
      }
    };
    // Q key: drop held item
    player.onDropItem = () => {
      const slot = inventoryRef.current[selectedRef.current];
      if (!slot) return;
      const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
      inventoryRef.current = nextInv;
      setInventory(nextInv);
      setToast(`Dropped ${ITEMS[slot.item].label}`);
      setTimeout(() => setToast(null), 1500);
    };
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
      // Hay bale: 80% fall damage reduction (MC-style)
      const px = Math.floor(player.position.x);
      const py = Math.floor(player.position.y) - 1;
      const pz = Math.floor(player.position.z);
      const blockBelow = world.getType(px, py, pz);
      const reducedDmg = blockBelow === 'hay_bale' ? Math.max(1, Math.floor(dmg * 0.2)) : dmg;
      const hp = healthRef.current;
      const newHp = Math.max(0, hp - reducedDmg);
      healthRef.current = newHp;
      setHealth(newHp);
      // Screen shake on fall damage (intensity scales with damage)
      cameraShakeTimer = Math.min(0.5, reducedDmg * 0.08);
      cameraShakeIntensity = Math.min(0.15, reducedDmg * 0.02);
      audio.playBlockBreak('gravel'); // impact sound
      setDeathCause('Fell from a high place');
      // Fall damage particles (dirt/dust puff)
      const landColor = blockBelow === 'sand_blue' ? 0xc2b280 : blockBelow === 'snow_block' ? 0xffffff : 0x8B7355;
      for (let i = 0; i < Math.min(12, reducedDmg * 2); i++) {
        const mat = new THREE.MeshStandardMaterial({ color: landColor, roughness: 1, transparent: true, opacity: 0.8 });
        const m = new THREE.Mesh(particleGeom, mat);
        m.position.set(px + Math.random(), py + 1.1, pz + Math.random());
        m.castShadow = false; m.receiveShadow = false;
        scene.add(m);
        particles.push({
          mesh: m,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 3, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 3),
          age: 0, life: 0.4 + Math.random() * 0.3,
        });
      }
    };
    // Void death: kill player if they fall into void
    player.onVoidDeath = () => {
      healthFloat = 0;
      healthRef.current = 0;
      setHealth(0);
      setDeathCause('Fell out of the world');
    };
    // Drowning damage
    player.onDrown = (dmg) => {
      const reduced = applyArmorReduction(dmg, armorRef.current);
      healthFloat = Math.max(0, healthFloat - reduced);
      healthRef.current = Math.round(healthFloat);
      setHealth(Math.round(healthFloat));
      setDeathCause('Drowned');
    };
    // Lava damage (blocked by fire resistance potion)
    player.onLavaDamage = (dmg) => {
      if (potionTypeRef.current === 'potion_fire_resist') return; // immune to lava
      const reduced = applyArmorReduction(dmg, armorRef.current);
      healthFloat = Math.max(0, healthFloat - reduced);
      healthRef.current = Math.round(healthFloat);
      setHealth(Math.round(healthFloat));
      hurtFlashTimer = 0.3;
      setDeathCause('Tried to swim in lava');
      // Fire particles rising from player
      for (let fp = 0; fp < 6; fp++) {
        const fireMat = new THREE.MeshBasicMaterial({
          color: Math.random() > 0.5 ? 0xff4400 : 0xffaa00,
          transparent: true, opacity: 0.8,
        });
        const fm = new THREE.Mesh(particleGeom, fireMat);
        fm.position.set(
          camera.position.x + (Math.random() - 0.5) * 0.6,
          camera.position.y - 0.5 + Math.random() * 0.3,
          camera.position.z + (Math.random() - 0.5) * 0.6,
        );
        fm.castShadow = false;
        scene.add(fm);
        particles.push({
          mesh: fm,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            2 + Math.random() * 2,
            (Math.random() - 0.5) * 0.5,
          ),
          age: 0,
          life: 0.5 + Math.random() * 0.3,
        });
      }
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
      // SAFE SPAWN: reject any spawn inside the city bounds (x=40-88, z=40-88).
      // The city is dense and players get stuck in buildings. Force fallback to (20, 20, 20).
      let safeSp = { ...payload.spawnPoint };
      const inCityBounds =
        safeSp.x >= 40 && safeSp.x <= 88 &&
        safeSp.z >= 40 && safeSp.z <= 88;
      if (inCityBounds) {
        console.log('[spawn] Server sent city-bounds spawn, overriding to safe platform');
        safeSp = { x: 20.5, y: 20, z: 20.5 };
      }
      const sx = Math.floor(safeSp.x);
      const sz = Math.floor(safeSp.z);
      let safeY = Math.floor(safeSp.y);
      // If inside/under a block, scan upward for a clear 3-block column
      let attempts = 0;
      while (attempts < 80 && (world.has(sx, safeY, sz) || world.has(sx, safeY + 1, sz))) {
        safeY++;
        attempts++;
      }
      // Guarantee floor-y of at least 20 so player is never underground
      if (safeY < 20) safeY = 20;
      safeSp.y = safeY + 0.01;
      spawnPointRef.current = { x: safeSp.x, y: safeSp.y, z: safeSp.z };
      // Force-clear blocks at spawn position AND ensure a ground platform below
      for (let cy = safeY; cy <= safeY + 3; cy++) {
        if (world.has(sx, cy, sz)) world.removeBlock(sx, cy, sz, true);
      }
      if (!world.has(sx, safeY - 1, sz)) {
        world.addBlock(sx, safeY - 1, sz, 'royal_brick');
      }
      player.setPosition(safeSp.x, safeSp.y, safeSp.z);
      player.velocity.set(0, 0, 0);
      // Give starter pickaxe if player has no tools (first-time players can break blocks)
      const hasPickaxe = inventoryRef.current.some(s => s && ITEMS[s.item]?.toolKind === 'pickaxe');
      if (!hasPickaxe) {
        const starterInv = addItem(inventoryRef.current, 'wooden_pickaxe', 1);
        inventoryRef.current = starterInv;
        setInventory(starterInv);
      }
      setInvulnerable(true);
      invulnerableRef.current = true;
      setTimeout(() => { setInvulnerable(false); invulnerableRef.current = false; }, 5000);
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
      wolves.spawn(3, 64, 64, 40);
      ironGolems.spawn(1, 64, 64, 30);
      bats.spawnBats(4, 64, 64, 40);
      villagers.spawn(3, 64, 64, 25);
      foxes.spawn(3, 64, 64, 35);
      parrots.spawnFlying(4, 64, 64, 40);
      turtles.spawn(3, 64, 64, 30);
      // Warden boss — spawns deep underground (rare, 1 per world)
      wardens.spawn(1, 32 + Math.floor(Math.random() * 64), 32 + Math.floor(Math.random() * 64), 10);

      // ---- Spawn Base coins scattered across the world (surface + underground) ----
      const coinCount = 60; // 60 surface coins
      for (let ci = 0; ci < coinCount; ci++) {
        // Find a random surface position
        for (let attempt = 0; attempt < 10; attempt++) {
          const cx = 8 + Math.floor(Math.random() * 112);
          const cz = 8 + Math.floor(Math.random() * 112);
          // Scan down from y=80 to find top solid block
          let topY = -1;
          for (let ty = 80; ty >= 1; ty--) {
            const bt = world.getType(cx, ty, cz);
            if (bt && bt !== 'water' && bt !== 'lava' && bt !== 'leaves') {
              topY = ty;
              break;
            }
          }
          if (topY > 0 && topY < 70) {
            spawnBaseCoin(cx + 0.5, topY + 1.5, cz + 0.5);
            break;
          }
        }
      }
      // Additional underground coins in caves (exploration reward)
      const undergroundCoins = 25;
      for (let ci = 0; ci < undergroundCoins; ci++) {
        for (let attempt = 0; attempt < 10; attempt++) {
          const cx = 8 + Math.floor(Math.random() * 112);
          const cz = 8 + Math.floor(Math.random() * 112);
          const cy = 3 + Math.floor(Math.random() * 10); // deep
          // Check if there's air at this position (inside a cave)
          if (!world.has(cx, cy, cz) && world.has(cx, cy - 1, cz)) {
            spawnBaseCoin(cx + 0.5, cy + 0.5, cz + 0.5);
            break;
          }
        }
      }
      // Cluster of coins near spawn point for easy early-game discovery
      const sp = spawnPointRef.current;
      if (sp) {
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const r = 6 + Math.random() * 4;
          const ccx = Math.floor(sp.x + Math.cos(angle) * r);
          const ccz = Math.floor(sp.z + Math.sin(angle) * r);
          let topY = -1;
          for (let ty = 80; ty >= 1; ty--) {
            const bt = world.getType(ccx, ty, ccz);
            if (bt && bt !== 'water' && bt !== 'lava' && bt !== 'leaves') {
              topY = ty;
              break;
            }
          }
          if (topY > 0) {
            spawnBaseCoin(ccx + 0.5, topY + 1.5, ccz + 0.5);
          }
        }
      }

      // ---- Generate structures: small dungeons ----
      const dungeonCount = 3 + Math.floor(Math.random() * 3);
      for (let d = 0; d < dungeonCount; d++) {
        const dx = 20 + Math.floor(Math.random() * 88);
        const dz = 20 + Math.floor(Math.random() * 88);
        const dy = 5 + Math.floor(Math.random() * 8); // underground
        const size = 3 + Math.floor(Math.random() * 3); // 3-5 blocks wide
        // Build walls of mossy cobblestone or stone bricks
        const wallType: BlockType = Math.random() < 0.5 ? 'mossy_cobblestone' : 'stone_bricks';
        for (let wx = -size; wx <= size; wx++) {
          for (let wz = -size; wz <= size; wz++) {
            // Floor
            world.addBlock(dx + wx, dy - 1, dz + wz, wallType);
            // Ceiling
            world.addBlock(dx + wx, dy + 3, dz + wz, wallType);
            // Walls
            if (Math.abs(wx) === size || Math.abs(wz) === size) {
              for (let wy = 0; wy < 3; wy++) {
                world.addBlock(dx + wx, dy + wy, dz + wz, wallType);
              }
            }
          }
        }
        // Place chest in center
        world.addBlock(dx, dy, dz, 'chest');
        // Place torches
        world.addBlock(dx + size - 1, dy + 1, dz, 'torch');
        world.addBlock(dx - size + 1, dy + 1, dz, 'torch');
        // Spawn a spawner-like area (cobwebs = wool blocks)
        if (Math.random() < 0.5) {
          world.addBlock(dx, dy, dz + 1, 'cobblestone');
        }
      }

      // ---- Generate structures: ocean ruins (prismarine) ----
      const ruinCount = 2 + Math.floor(Math.random() * 2);
      for (let r = 0; r < ruinCount; r++) {
        const rx = 15 + Math.floor(Math.random() * 98);
        const rz = 15 + Math.floor(Math.random() * 98);
        const ry = 2 + Math.floor(Math.random() * 4);
        const rSize = 2 + Math.floor(Math.random() * 3);
        for (let wx = -rSize; wx <= rSize; wx++) {
          for (let wz = -rSize; wz <= rSize; wz++) {
            if (Math.abs(wx) === rSize || Math.abs(wz) === rSize) {
              const height = 1 + Math.floor(Math.random() * 3); // ruins are partially broken
              for (let wy = 0; wy < height; wy++) {
                const blockType: BlockType = Math.random() < 0.3 ? 'sea_lantern' : 'prismarine';
                world.addBlock(rx + wx, ry + wy, rz + wz, blockType);
              }
            }
          }
        }
        // Place a chest with loot
        world.addBlock(rx, ry, rz, 'chest');
      }

      // ---- Generate: Nether ruins (small nether brick structures for wallet users to find) ----
      if (Math.random() < 0.5) {
        const nx = 30 + Math.floor(Math.random() * 68);
        const nz = 30 + Math.floor(Math.random() * 68);
        const ny = 3 + Math.floor(Math.random() * 5);
        // Small nether brick archway
        for (let wy = 0; wy < 5; wy++) {
          world.addBlock(nx - 2, ny + wy, nz, 'nether_bricks');
          world.addBlock(nx + 2, ny + wy, nz, 'nether_bricks');
        }
        for (let wx = -2; wx <= 2; wx++) {
          world.addBlock(nx + wx, ny + 4, nz, 'nether_bricks');
        }
        // Place a nether portal in center (tier-gated)
        world.addBlock(nx, ny + 1, nz, 'glowstone');
        world.addBlock(nx, ny + 2, nz, 'soul_sand');
        world.addBlock(nx, ny + 3, nz, 'glowstone');
      }

      // ---- Generate: Watchtowers (tall stone brick structures) ----
      const towerCount = 1 + Math.floor(Math.random() * 2);
      for (let t = 0; t < towerCount; t++) {
        const tx = 25 + Math.floor(Math.random() * 78);
        const tz = 25 + Math.floor(Math.random() * 78);
        // Find ground level
        let tGround = 20;
        for (let sy = 40; sy >= 0; sy--) {
          const bt = world.getType(tx, sy, tz);
          if (bt && bt !== 'water' && bt !== 'leaves') { tGround = sy + 1; break; }
        }
        const towerHeight = 8 + Math.floor(Math.random() * 5); // 8-12 blocks tall
        // Build 3x3 tower
        for (let wy = 0; wy < towerHeight; wy++) {
          for (let wx = -1; wx <= 1; wx++) {
            for (let wz = -1; wz <= 1; wz++) {
              if (wx === 0 && wz === 0 && wy > 0 && wy < towerHeight - 1) continue; // hollow inside
              world.addBlock(tx + wx, tGround + wy, tz + wz, 'stone_bricks');
            }
          }
        }
        // Platform on top (5x5)
        for (let wx = -2; wx <= 2; wx++) {
          for (let wz = -2; wz <= 2; wz++) {
            world.addBlock(tx + wx, tGround + towerHeight, tz + wz, 'stone_bricks');
          }
        }
        // Crenellations (battlements)
        for (let wx = -2; wx <= 2; wx++) {
          for (let wz = -2; wz <= 2; wz++) {
            if (Math.abs(wx) === 2 || Math.abs(wz) === 2) {
              if ((wx + wz) % 2 === 0) {
                world.addBlock(tx + wx, tGround + towerHeight + 1, tz + wz, 'stone_bricks');
              }
            }
          }
        }
        // Torch on top
        world.addBlock(tx, tGround + towerHeight + 1, tz, 'torch');
        // Ladder inside
        for (let ly = 0; ly < towerHeight; ly++) {
          world.addBlock(tx + 1, tGround + ly, tz, 'ladder');
        }
        // Chest with loot at top
        world.addBlock(tx - 1, tGround + towerHeight, tz, 'chest');
      }

      // ---- On-chain: Wallet starter kit (one-time bonus) ----
      if (walletAddress) {
        const starterKey = `bc_starter_${walletAddress.toLowerCase()}`;
        if (!window.localStorage.getItem(starterKey)) {
          window.localStorage.setItem(starterKey, '1');
          let sInv = inventoryRef.current;
          // Give starter items based on tier
          sInv = addItem(sInv, 'iron_pickaxe', 1);
          sInv = addItem(sInv, 'iron_sword', 1);
          sInv = addItem(sInv, 'torch', 16);
          sInv = addItem(sInv, 'bread', 8);
          sInv = addItem(sInv, 'cobblestone', 32);
          if (balanceTier === 'bronze' || balanceTier === 'silver' || balanceTier === 'gold' || balanceTier === 'diamond') {
            sInv = addItem(sInv, 'diamond', 3);
            sInv = addItem(sInv, 'iron_ingot', 16);
          }
          if (balanceTier === 'gold' || balanceTier === 'diamond') {
            sInv = addItem(sInv, 'diamond_pickaxe', 1);
            sInv = addItem(sInv, 'golden_apple', 3);
            sInv = addItem(sInv, 'ender_pearl', 2);
          }
          if (balanceTier === 'diamond') {
            sInv = addItem(sInv, 'diamond_chestplate', 1);
            sInv = addItem(sInv, 'diamond_sword', 1);
            sInv = addItem(sInv, 'enchanted_book', 1);
          }
          inventoryRef.current = sInv;
          setInventory(sInv);
          appendChat({
            username: 'system',
            message: `⛓️ Welcome, ${tierInfo.label} tier holder! Starter kit received.`,
            isSystem: true,
          });
        }
      }

      // Generate daily challenge for wallet holders
      if (walletAddress) {
        const today = new Date().toISOString().slice(0, 10);
        const challengeKey = `bc_challenge_${today}`;
        if (!window.localStorage.getItem(challengeKey)) {
          const challenges = [
            { type: 'Mine 50 blocks', target: 50, reward: '10 Iron Ingots', rewardItem: 'iron_ingot' as ItemType, rewardCount: 10 },
            { type: 'Kill 10 mobs', target: 10, reward: '5 Diamonds', rewardItem: 'diamond' as ItemType, rewardCount: 5 },
            { type: 'Place 30 blocks', target: 30, reward: '20 Coal', rewardItem: 'coal' as ItemType, rewardCount: 20 },
            { type: 'Walk 500 blocks', target: 500, reward: '3 Golden Apples', rewardItem: 'golden_apple' as ItemType, rewardCount: 3 },
            { type: 'Craft 10 items', target: 10, reward: '8 Iron Ingots', rewardItem: 'iron_ingot' as ItemType, rewardCount: 8 },
          ];
          const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0);
          const challenge = challenges[seed % challenges.length];
          setDailyChallenge({ ...challenge, current: 0, completed: false });
          window.localStorage.setItem(challengeKey, JSON.stringify(challenge));
        } else {
          try {
            const saved = JSON.parse(window.localStorage.getItem(challengeKey)!);
            setDailyChallenge({ ...saved, current: 0, completed: false });
          } catch {}
        }

        // Daily login streak bonus
        const streakKey = 'bc_login_streak';
        const lastLoginKey = 'bc_last_login';
        const lastLogin = window.localStorage.getItem(lastLoginKey);
        const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        let streak = parseInt(window.localStorage.getItem(streakKey) || '0');
        if (lastLogin === yesterday) {
          streak++;
        } else if (lastLogin !== today) {
          streak = 1;
        }
        window.localStorage.setItem(streakKey, streak.toString());
        window.localStorage.setItem(lastLoginKey, today);
        // Give XP bonus based on streak (capped at 7 days)
        const streakBonus = Math.min(streak, 7) * 50;
        if (lastLogin !== today) {
          const newXp = totalXpRef.current + streakBonus;
          totalXpRef.current = newXp;
          setTotalXp(newXp);
          setTimeout(() => {
            setToast(`🔥 Login Streak: Day ${streak}! +${streakBonus} XP`);
            setTimeout(() => setToast(null), 3000);
          }, 3000); // delay so it shows after initial load
        }
      }
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
    const onChatReceived = (m: { username: string; message: string; isSystem?: boolean; tier?: string; tierColor?: string }) => {
      // Color current player's name with their tier color
      const isMe = m.username === username;
      const nameColor = isMe ? tierInfo.color || '#59a5ff' : (m.tierColor || undefined);
      // Tier badge for wallet holders
      let tierBadge: string | undefined;
      let tierBadgeColor: string | undefined;
      if (isMe && balanceTier !== 'none') {
        tierBadge = tierInfo.label.toUpperCase();
        tierBadgeColor = tierInfo.color;
      } else if (m.tier && m.tier !== 'none') {
        tierBadge = m.tier.toUpperCase();
        tierBadgeColor = m.tierColor;
      }
      appendChat({ username: m.username, message: m.message, isSystem: m.isSystem, nameColor, tierBadge, tierBadgeColor });
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
      setMinimapPlayers(others.listWithPositions());
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

    // ---- On-chain socket events ----
    const onLeaderboardData = (entries: any[]) => setLeaderboardData(entries);
    const onAchievementData = (data: Array<{ achievement_id: string }>) => {
      const set = new Set(data.map(a => a.achievement_id));
      earnedRef.current = set;
      setEarnedAchievements(set);
    };
    const onLandData = (data: Array<{ chunk_x: number; chunk_z: number; wallet_address: string; username: string; claimed_at: string }>) => {
      const map = new Map<string, LandClaim>();
      for (const c of data) map.set(chunkKey(c.chunk_x, c.chunk_z), c);
      landClaimsRef.current = map;
      setLandClaims(map);
    };
    const onLandClaimed = (p: { chunkX: number; chunkZ: number; walletAddress: string; username: string }) => {
      const claim: LandClaim = { chunk_x: p.chunkX, chunk_z: p.chunkZ, wallet_address: p.walletAddress, username: p.username, claimed_at: new Date().toISOString() };
      const next = new Map(landClaimsRef.current);
      next.set(chunkKey(p.chunkX, p.chunkZ), claim);
      landClaimsRef.current = next;
      setLandClaims(next);
    };
    const onLandUnclaimed = (p: { chunkX: number; chunkZ: number }) => {
      const next = new Map(landClaimsRef.current);
      next.delete(chunkKey(p.chunkX, p.chunkZ));
      landClaimsRef.current = next;
      setLandClaims(next);
    };
    // Command-triggered panel opens
    const onProfileOpen = () => setProfileOpen(true);
    const onLeaderboardOpen = () => { socket.emit('leaderboard:get'); setLeaderboardOpen(true); };
    const onAchievementsOpen = () => setAchievementsOpen(true);
    const onLandDoClaim = (p: { chunkX: number; chunkZ: number }) => socket.emit('land:claim', p);
    const onLandDoUnclaim = (p: { chunkX: number; chunkZ: number }) => socket.emit('land:unclaim', p);

    socket.on('leaderboard:data', onLeaderboardData);
    socket.on('achievement:data', onAchievementData);
    socket.on('land:data', onLandData);
    socket.on('land:claimed', onLandClaimed);
    socket.on('land:unclaimed', onLandUnclaimed);
    socket.on('profile:open', onProfileOpen);
    socket.on('leaderboard:open', onLeaderboardOpen);
    socket.on('achievements:open', onAchievementsOpen);
    socket.on('land:do_claim', onLandDoClaim);
    socket.on('land:do_unclaim', onLandDoUnclaim);

    if (socket.connected) onConnect();
    else socket.connect();

    // Request achievements on connect
    setTimeout(() => { socket.emit('achievement:list'); }, 2000);

    const refreshInterval = setInterval(refreshOnlineList, 1000);

    // ---- Stats flush every 60 seconds ----
    const statsFlushInterval = setInterval(() => {
      const s = statsRef.current;
      if (s.blocksPlaced > 0 || s.blocksBroken > 0 || s.mobsKilled > 0 || s.deaths > 0) {
        socket.emit('player:stats', {
          blocksPlaced: s.blocksPlaced,
          blocksBroken: s.blocksBroken,
          mobsKilled: s.mobsKilled,
          deaths: s.deaths,
          playTime: Math.floor(s.playTimeSeconds),
        });
      }
    }, 60000);

    // ---- Achievement checker every 10 seconds ----
    const achievementCheckInterval = setInterval(() => {
      const newAchs = checkNewAchievements(statsRef.current, earnedRef.current);
      for (const achId of newAchs) {
        earnedRef.current = new Set([...earnedRef.current, achId]);
        setEarnedAchievements(new Set(earnedRef.current));
        socket.emit('achievement:unlock', { achievementId: achId });
        const def = getAchievementDef(achId);
        if (def) {
          setAchievementToast({ id: achId, name: def.name, description: def.description, icon: def.icon });
          audio.playAchievement();
          setTimeout(() => setAchievementToast(null), 5000);
        }
      }
    }, 10000);

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
      // Land claim check
      const landCheck = canModifyBlock(x, z, walletAddress, landClaimsRef.current);
      if (!landCheck.allowed) {
        setToast(`⛳ This land is claimed by ${landCheck.owner}!`);
        setTimeout(() => setToast(null), 2000);
        return;
      }
      const t = world.getType(x, y, z);
      if (t) {
        audio.playBlockBreak(t);
        world.removeBlock(x, y, z, true);
        // Stats tracking
        statsRef.current.blocksBroken++;
        if (t === 'diamond_ore') statsRef.current.diamondsFound++;
        if (t === 'copper_ore') statsRef.current.copperMined++;
        if (t === 'amethyst') statsRef.current.amethystMined++;
        // Daily challenge progress: mine blocks
        advanceDailyChallenge('mine', 'break');
        // Drop item (stone → cobblestone, grass → dirt, etc.)
        const drop = getBlockDrop(t);
        let nextInv = addItem(inventoryRef.current, drop, 1);
        // Rare apple drop from leaves (~10% chance)
        if (t === 'leaves' && Math.random() < 0.1) {
          nextInv = addItem(nextInv, 'apple', 1);
        }
        // Wheat drops seeds + wheat_item
        if (t === 'wheat') {
          nextInv = addItem(nextInv, 'seeds', 1 + Math.floor(Math.random() * 2));
        }
        // Lucky mining: tier-boosted chance for bonus drops
        const luckyChance = TIER_LUCKY_MINING[balanceTier];
        if (Math.random() < luckyChance) {
          const luckyDrops: { item: ItemType; weight: number }[] = [
            { item: 'coal', weight: 30 },
            { item: 'raw_iron', weight: 20 },
            { item: 'raw_copper', weight: 15 },
            { item: 'raw_gold', weight: 10 },
            { item: 'diamond', weight: 3 },
            { item: 'emerald', weight: 5 },
            { item: 'amethyst_shard', weight: 8 },
            { item: 'golden_apple', weight: 1 },
            { item: 'ender_pearl', weight: 2 },
          ];
          const totalWeight = luckyDrops.reduce((s, d) => s + d.weight, 0);
          let roll = Math.random() * totalWeight;
          let luckyItem: ItemType = 'coal';
          for (const ld of luckyDrops) {
            roll -= ld.weight;
            if (roll <= 0) { luckyItem = ld.item; break; }
          }
          nextInv = addItem(nextInv, luckyItem, 1);
          const luckyLabel = ITEMS[luckyItem].label;
          setToast(`🍀 Lucky find! +1 ${luckyLabel}`);
          setTimeout(() => setToast(null), 2000);
          statsRef.current.luckyDrops++;
          // Spawn extra XP orbs for lucky find
          spawnXPOrbs(x, y, z, 3);
        }
        // ⬢ Base coin hidden in bricks — random chance when breaking stone/brick blocks
        const coinBlocks: BlockType[] = [
          'cobblestone', 'stone_bricks', 'mossy_cobblestone', 'bricks',
          'royal_brick', 'deepslate', 'nether_bricks', 'sandstone' as BlockType,
        ];
        if (coinBlocks.includes(t)) {
          // Base coin drop chance: 2% base, up to 6% for diamond tier
          const coinChance = 0.02 + (TIER_LUCKY_MINING[balanceTier] * 0.5);
          if (Math.random() < coinChance) {
            // Bonus: emerald + XP
            const coinEmeralds = 1 + Math.floor(Math.random() * 2);
            const coinXp = 30 + Math.floor(Math.random() * 30);
            nextInv = addItem(nextInv, 'emerald', coinEmeralds);
            const newCoinXp = totalXpRef.current + coinXp;
            totalXpRef.current = newCoinXp;
            setTotalXp(newCoinXp);
            statsRef.current.emeraldsEarned += coinEmeralds;
            statsRef.current.baseCoinsCollected = (statsRef.current.baseCoinsCollected ?? 0) + 1;
            setToast(`⬢ Base Coin found in brick! (#${statsRef.current.baseCoinsCollected}) +${coinEmeralds} Emerald, +${coinXp} XP`);
            setTimeout(() => setToast(null), 2500);
            audio.playLevelUp();
            // Visual: spawn a spinning Base coin at break position that auto-collects
            spawnBaseCoin(x + 0.5, y + 1.5, z + 0.5);
            // Extra sparkle particles in Base blue
            for (let sp = 0; sp < 8; sp++) {
              const sparkMat = new THREE.MeshBasicMaterial({
                color: 0x0052ff, transparent: true, opacity: 0.9,
              });
              const sm = new THREE.Mesh(particleGeom, sparkMat);
              sm.position.set(x + 0.5, y + 0.5, z + 0.5);
              sm.castShadow = false;
              scene.add(sm);
              particles.push({
                mesh: sm,
                velocity: new THREE.Vector3(
                  (Math.random() - 0.5) * 3,
                  1.5 + Math.random() * 2,
                  (Math.random() - 0.5) * 3,
                ),
                age: 0, life: 0.7 + Math.random() * 0.3,
              });
            }
          }
        }
        // On-chain: Legendary item discovery (very rare, wallet-exclusive)
        if (walletAddress && (t === 'diamond_ore' || t === 'emerald_ore' || t === 'amethyst') && Math.random() < 0.08) {
          // Give an enchanted diamond tool with custom name
          const legendaryNames = [
            'Excalibur', 'Mjolnir', 'Dragonbane', 'Stormbreaker',
            'Frostmourne', 'Ashbringer', 'Dawnbreaker', 'Soulreaver',
          ];
          const legendaryTools: ItemType[] = ['diamond_pickaxe', 'diamond_sword', 'diamond_axe'];
          const chosenTool = legendaryTools[Math.floor(Math.random() * legendaryTools.length)];
          const chosenName = legendaryNames[Math.floor(Math.random() * legendaryNames.length)];
          nextInv = addItem(nextInv, chosenTool, 1);
          // Enchant it
          const enchSlot = nextInv.findIndex(s => s && s.item === chosenTool);
          if (enchSlot >= 0) {
            enchantedItemsRef.current.set(enchSlot, `${chosenName} ✧`);
          }
          spawnXPOrbs(x, y, z, 10);
          cameraShakeTimer = 0.5;
          cameraShakeIntensity = 0.05;
          appendChat({
            username: 'system',
            message: `⚡ ${username} discovered a LEGENDARY ${chosenName}!`,
            isSystem: true,
          });
          setToast(`⚡ LEGENDARY: ${chosenName}! (${ITEMS[chosenTool].label})`);
          setTimeout(() => setToast(null), 4000);
        }

        inventoryRef.current = nextInv;
        setInventory(nextInv);
        // Mining combo: consecutive blocks within 3s get bonus XP
        miningCombo++;
        miningComboTimer = 3.0; // 3 second window
        const comboMultiplier = Math.min(1 + miningCombo * 0.1, 3.0); // max 3x from combo
        // XP gain from mining + XP orbs (tier multiplier applied)
        const baseXp = BLOCK_XP[t] ?? 0;
        // Thunderstorm bonus: 2x XP for wallet holders during storms
        const stormBonus = (weatherRef.current === 'thunder' && walletAddress) ? 2 : 1;
        const xpGain = Math.round(baseXp * TIER_XP_MULTIPLIER[balanceTier] * stormBonus * comboMultiplier);
        if (xpGain > 0) {
          const newXp = totalXpRef.current + xpGain;
          totalXpRef.current = newXp;
          setTotalXp(newXp);
          spawnXPOrbs(x, y, z, Math.min(xpGain, 5));
        }
        // Track max combo
        if (miningCombo > statsRef.current.maxMiningCombo) {
          statsRef.current.maxMiningCombo = miningCombo;
        }
        // Show combo streak for 5+ blocks
        if (miningCombo >= 5) {
          setToast(`⛏️ Mining streak x${miningCombo}! (${comboMultiplier.toFixed(1)}x XP)`);
        }
        // Decrement tool durability if holding a tool
        const slot = inventoryRef.current[selectedRef.current];
        if (slot) {
          const def = ITEMS[slot.item];
          if (def.isTool && def.durability) {
            const { inv: afterTool, broke } = useTool(inventoryRef.current, selectedRef.current);
            inventoryRef.current = afterTool;
            setInventory(afterTool);
            if (broke) {
              audio.playBlockBreak('royal_brick');
              setToast(`🔨 ${def.label} broke!`);
              setTimeout(() => setToast(null), 2000);
            } else {
              // Warning when durability is low (< 10%)
              const newSlot = afterTool[selectedRef.current];
              if (newSlot && newSlot.durability !== undefined && def.durability) {
                const pct = newSlot.durability / def.durability;
                if (pct <= 0.1 && pct > 0.05) {
                  setToast(`⚠️ ${def.label} is about to break!`);
                  setTimeout(() => setToast(null), 1500);
                }
              }
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

      // Shield: right-click toggles blocking
      if (def.isShield) {
        const blocking = !isBlockingRef.current;
        isBlockingRef.current = blocking;
        setIsBlocking(blocking);
        setToast(blocking ? '🛡 Blocking' : '🛡 Stopped blocking');
        setTimeout(() => setToast(null), 1500);
        return;
      }

      // Armor: right-click to equip
      if (def.isArmor && def.armorSlot) {
        const slotName = def.armorSlot as keyof ArmorSlots;
        const currentArmor = { ...armorRef.current };
        const oldPiece = currentArmor[slotName];
        currentArmor[slotName] = { item: slot.item, count: 1 };
        let inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
        if (oldPiece) inv = addItem(inv, oldPiece.item, 1);
        inventoryRef.current = inv;
        setInventory(inv);
        armorRef.current = currentArmor;
        setArmor(currentArmor);
        audio.playArmorEquip();
        setToast(`Equipped ${def.label}`);
        setTimeout(() => setToast(null), 2000);
        return;
      }

      // Flint & Steel: ignite TNT
      if (slot.item === 'flint_and_steel') {
        const hit = world.raycast(camera, 5);
        if (hit) {
          const bt = world.getType(hit.x, hit.y, hit.z);
          if (bt === 'tnt') {
            // Explode TNT!
            world.removeBlock(hit.x, hit.y, hit.z, true);
            socket.emit('block:break', { x: hit.x, y: hit.y, z: hit.z });
            // 4×4×4 explosion
            const cx = hit.x, cy = hit.y, cz = hit.z;
            for (let ddx = -2; ddx <= 2; ddx++) {
              for (let ddy = -2; ddy <= 2; ddy++) {
                for (let ddz = -2; ddz <= 2; ddz++) {
                  if (ddx * ddx + ddy * ddy + ddz * ddz > 6) continue; // spherical
                  const bx = cx + ddx, by = cy + ddy, bz = cz + ddz;
                  const bt2 = world.getType(bx, by, bz);
                  if (bt2 && bt2 !== 'bedrock' && bt2 !== 'obsidian') {
                    world.removeBlock(bx, by, bz, true);
                    socket.emit('block:break', { x: bx, y: by, z: bz });
                    // Chain reaction: nearby TNT
                    if (bt2 === 'tnt') {
                      for (let cx2 = -2; cx2 <= 2; cx2++) {
                        for (let cy2 = -2; cy2 <= 2; cy2++) {
                          for (let cz2 = -2; cz2 <= 2; cz2++) {
                            const bt3 = world.getType(bx + cx2, by + cy2, bz + cz2);
                            if (bt3 && bt3 !== 'bedrock' && bt3 !== 'obsidian') {
                              world.removeBlock(bx + cx2, by + cy2, bz + cz2, true);
                              socket.emit('block:break', { x: bx + cx2, y: by + cy2, z: bz + cz2 });
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            // Damage player if close
            const pdx = player.position.x - cx;
            const pdy = player.position.y - cy;
            const pdz = player.position.z - cz;
            const pdist = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
            if (pdist < 5) {
              const dmg = Math.floor(12 * (1 - pdist / 5));
              const reduced = applyArmorReduction(dmg, armorRef.current);
              const newHp = Math.max(0, healthRef.current - reduced);
              healthRef.current = Math.round(newHp);
              setHealth(Math.round(newHp));
            }
            audio.playExplosion();
            // Camera shake from explosion
            cameraShakeTimer = 0.5;
            cameraShakeIntensity = Math.max(0, 0.3 * (1 - pdist / 8));
            // Explosion flash
            hurtFlashTimer = 0.2;
            // Spawn lots of explosion particles
            for (let ep = 0; ep < 20; ep++) {
              const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(Math.random() < 0.5 ? 0xff6600 : 0xffaa00), roughness: 1, transparent: true, opacity: 1 });
              const m = new THREE.Mesh(particleGeom, mat);
              m.position.set(cx + (Math.random() - 0.5) * 3, cy + (Math.random() - 0.5) * 3, cz + (Math.random() - 0.5) * 3);
              m.castShadow = false;
              m.receiveShadow = false;
              scene.add(m);
              particles.push({
                mesh: m,
                velocity: new THREE.Vector3((Math.random() - 0.5) * 8, 2 + Math.random() * 6, (Math.random() - 0.5) * 8),
                age: 0,
                life: 0.5 + Math.random() * 0.3,
              });
            }
            // Use durability
            const { inv: afterFS, broke: fsBroke } = useTool(inventoryRef.current, selectedRef.current);
            inventoryRef.current = afterFS;
            setInventory(afterFS);
            if (fsBroke) audio.playBlockBreak('royal_brick');
            handSwingTime = 0;
            return;
          }
        }
        // Flint & steel on non-TNT: just use durability
        const { inv: afterFS2 } = useTool(inventoryRef.current, selectedRef.current);
        inventoryRef.current = afterFS2;
        setInventory(afterFS2);
        return;
      }

      // Bed: right-click to set spawn point or skip night
      if (slot.item === 'bed' && def.isBlock) {
        // Check if there's already a bed below — if clicking bed block, use it
        const hit = world.raycast(camera, 5);
        if (hit) {
          const bt = world.getType(hit.x, hit.y, hit.z);
          if (bt === 'bed') {
            spawnPointRef.current = { x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5 };
            setToast('🛏️ Spawn point set!');
            setTimeout(() => setToast(null), 2000);
            return;
          }
        }
        // Otherwise place the bed
      }

      // Bucket: right-click water → water_bucket, right-click lava → lava_bucket
      if (slot.item === 'bucket') {
        const hit = world.raycast(camera, 5);
        if (hit) {
          const bt = world.getType(hit.x, hit.y, hit.z);
          if (bt === 'water') {
            // Pick up placed water block
            world.removeBlock(hit.x, hit.y, hit.z, true);
            socket.emit('block:break', { x: hit.x, y: hit.y, z: hit.z });
            let inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
            inv = addItem(inv, 'water_bucket', 1);
            inventoryRef.current = inv;
            setInventory(inv);
            setToast('Scooped water!');
            setTimeout(() => setToast(null), 1500);
            return;
          }
          if (bt === 'lava') {
            world.removeBlock(hit.x, hit.y, hit.z, true);
            socket.emit('block:break', { x: hit.x, y: hit.y, z: hit.z });
            let inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
            inv = addItem(inv, 'lava_bucket', 1);
            inventoryRef.current = inv;
            setInventory(inv);
            setToast('Scooped lava!');
            setTimeout(() => setToast(null), 1500);
            return;
          }
        }
        // Fallback: scoop water if near sea level
        if (player.position.y < SEA_LEVEL + 0.5) {
          let inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
          inv = addItem(inv, 'water_bucket', 1);
          inventoryRef.current = inv;
          setInventory(inv);
          setToast('Scooped water!');
          setTimeout(() => setToast(null), 1500);
          return;
        }
        return;
      }

      // Water bucket: place water block at target position
      if (slot.item === 'water_bucket') {
        const type = 'water' as BlockType;
        world.addBlock(x, y, z, type, true);
        socket.emit('block:place', { x, y, z, type });
        let inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
        inv = addItem(inv, 'bucket', 1);
        inventoryRef.current = inv;
        setInventory(inv);
        audio.playBlockPlace(type);
        handSwingTime = 0;
        setToast('Placed water');
        setTimeout(() => setToast(null), 1500);
        return;
      }

      // Lava bucket: place lava block
      if (slot.item === 'lava_bucket') {
        const type = 'lava' as BlockType;
        world.addBlock(x, y, z, type, true);
        socket.emit('block:place', { x, y, z, type });
        let inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
        inv = addItem(inv, 'bucket', 1);
        inventoryRef.current = inv;
        setInventory(inv);
        audio.playBlockPlace(type);
        handSwingTime = 0;
        return;
      }

      // Hoe: right-click grass/dirt → farmland
      if (def.isTool && def.toolKind === 'hoe') {
        const hit = world.raycast(camera, 5);
        if (hit) {
          const bt = world.getType(hit.x, hit.y, hit.z);
          if (bt === 'base_blue' || bt === 'deep_blue') {
            world.removeBlock(hit.x, hit.y, hit.z, true);
            world.addBlock(hit.x, hit.y, hit.z, 'farmland', true);
            socket.emit('block:break', { x: hit.x, y: hit.y, z: hit.z });
            socket.emit('block:place', { x: hit.x, y: hit.y, z: hit.z, type: 'farmland' });
            audio.playBlockBreak('deep_blue');
            // Use durability
            const { inv: afterHoe, broke } = useTool(inventoryRef.current, selectedRef.current);
            inventoryRef.current = afterHoe;
            setInventory(afterHoe);
            if (broke) audio.playBlockBreak('royal_brick');
            // Drop seeds from tilling (~30% chance)
            if (Math.random() < 0.3) {
              let inv = addItem(inventoryRef.current, 'seeds', 1);
              inventoryRef.current = inv;
              setInventory(inv);
            }
            handSwingTime = 0;
            return;
          }
        }
        return;
      }

      // Seeds: right-click farmland → plant wheat
      if (slot.item === 'seeds') {
        const hit = world.raycast(camera, 5);
        if (hit) {
          const bt = world.getType(hit.x, hit.y, hit.z);
          if (bt === 'farmland' && !world.has(hit.x, hit.y + 1, hit.z)) {
            world.addBlock(hit.x, hit.y + 1, hit.z, 'wheat', true);
            socket.emit('block:place', { x: hit.x, y: hit.y + 1, z: hit.z, type: 'wheat' });
            const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
            inventoryRef.current = nextInv;
            setInventory(nextInv);
            audio.playBlockPlace('base_blue');
            setToast('🌱 Planted wheat!');
            setTimeout(() => setToast(null), 1500);
            handSwingTime = 0;
            return;
          }
        }
        return;
      }

      // Fishing rod: right-click near water → catch fish
      if (slot.item === 'fishing_rod') {
        if (player.isInWater() || player.position.y < SEA_LEVEL + 2) {
          if (fishingCooldownRef.current <= 0) {
            // Rain = faster fishing, thunder = best fishing
            const fishCooldown = weatherRef.current === 'thunder' ? 1.5 : weatherRef.current === 'rain' ? 2 : 3;
            fishingCooldownRef.current = fishCooldown;
            // Enhanced fishing loot table (MC-style: fish/junk/treasure)
            const roll = Math.random();
            const weatherBonus = weatherRef.current === 'thunder' ? 0.08 : weatherRef.current === 'rain' ? 0.04 : 0;
            const tierBonus = (TIER_XP_MULTIPLIER[balanceTier] > 1 ? 0.05 : 0) + weatherBonus;
            let catchItem: ItemType;
            let catchCount = 1;
            let catchMsg = '';
            if (roll < 0.45) {
              catchItem = 'raw_fish'; catchMsg = '🐟 Caught a fish!';
            } else if (roll < 0.65) {
              catchItem = 'raw_fish'; catchCount = 2; catchMsg = '🐟 Great catch! x2';
            } else if (roll < 0.72) {
              catchItem = 'string'; catchMsg = '🧵 Caught string...';
            } else if (roll < 0.78) {
              catchItem = 'bone'; catchMsg = '🦴 Caught a bone...';
            } else if (roll < 0.83) {
              catchItem = 'leather'; catchMsg = '🥾 Caught leather boots... wait, leather!';
            } else if (roll < 0.87) {
              catchItem = 'iron_ingot'; catchMsg = '🔩 Treasure! Iron Ingot';
            } else if (roll < 0.90 + tierBonus) {
              catchItem = 'prismarine_shard'; catchMsg = '🔷 Treasure! Prismarine Shard';
            } else if (roll < 0.93 + tierBonus) {
              catchItem = 'gold_ingot'; catchMsg = '✨ Treasure! Gold Ingot';
            } else if (roll < 0.96 + tierBonus) {
              catchItem = 'enchanted_book'; catchMsg = '📕 Treasure! Enchanted Book';
            } else if (roll < 0.98 + tierBonus) {
              catchItem = 'emerald'; catchMsg = '💚 Treasure! Emerald';
            } else {
              catchItem = 'diamond'; catchMsg = '💎 Legendary catch! Diamond!';
            }
            let inv = addItem(inventoryRef.current, catchItem, catchCount);
            inventoryRef.current = inv;
            setInventory(inv);
            statsRef.current.fishCaught += catchCount;
            setToast(catchMsg);
            setTimeout(() => setToast(null), 2000);
            const { inv: afterFish, broke } = useTool(inventoryRef.current, selectedRef.current);
            inventoryRef.current = afterFish;
            setInventory(afterFish);
            if (broke) audio.playBlockBreak('royal_brick');
            audio.playBlockPlace('sand_blue');
            handSwingTime = 0;
            const newXp = totalXpRef.current + 3;
            totalXpRef.current = newXp;
            setTotalXp(newXp);
          } else {
            setToast('🎣 Wait a moment...');
            setTimeout(() => setToast(null), 1000);
          }
        } else {
          setToast('🎣 Need to be near water!');
          setTimeout(() => setToast(null), 1500);
        }
        return;
      }

      // Wolf taming: right-click wild wolf with bone
      if (slot.item === 'bone') {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const origin = camera.position.clone();
        const mob = wolves.hitTest(origin, camDir, 4);
        if (mob && !wolves.isTamed(mob)) {
          if (Math.random() < 0.33) {
            wolves.tame(mob);
            setToast('🐺 Wolf tamed!');
          } else {
            setToast('🐺 Wolf not interested...');
          }
          setTimeout(() => setToast(null), 2000);
          const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
          inventoryRef.current = nextInv;
          setInventory(nextInv);
          handSwingTime = 0;
          return;
        }
        // Right-click tamed wolf → sit/stand
        if (mob && wolves.isTamed(mob)) {
          wolves.toggleSit(mob);
          const isSitting = wolves.sittingWolves.has(mob);
          setToast(isSitting ? '🐺 Wolf sitting' : '🐺 Wolf following');
          setTimeout(() => setToast(null), 1500);
          return;
        }
      }

      // Bow: shoot arrow
      if (def.isRanged && def.ammoType) {
        // Check for arrow ammo
        const ammoIdx = inventoryRef.current.findIndex(s => s && s.item === def.ammoType);
        if (ammoIdx === -1) {
          setToast('No arrows!');
          setTimeout(() => setToast(null), 1500);
          return;
        }
        // Consume arrow
        let inv = removeFromSlot(inventoryRef.current, ammoIdx, 1);
        inventoryRef.current = inv;
        setInventory(inv);
        // Fire at mobs
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const origin = camera.position.clone();
        const arrowDamage = def.projectileDamage ?? 6;
        const managers = [cows, pigs, chickens, zombies, skeletons, creepers, spiders, wolves, endermen, ironGolems, slimes, bats, villagers, witches, blazes, phantoms, foxes, ghasts, parrots, turtles];
        for (const mgr of managers) {
          const mob = mgr.hitTest(origin, camDir, 24);
          if (mob) {
            const drops = mgr.dealDamage(mob, arrowDamage);
            audio.playBlockBreak('royal_brick');
            if (drops) {
              let invAfter = inventoryRef.current;
              for (const drop of drops) invAfter = addItem(invAfter, drop.item, drop.count);
              inventoryRef.current = invAfter;
              setInventory(invAfter);
              const newXp = totalXpRef.current + 5;
              totalXpRef.current = newXp;
              setTotalXp(newXp);
            }
            break;
          }
        }
        // Durability on bow
        const { inv: afterBow, broke } = useTool(inventoryRef.current, selectedRef.current);
        inventoryRef.current = afterBow;
        setInventory(afterBow);
        if (broke) audio.playBlockBreak('royal_brick');
        audio.playJump(); // arrow swoosh
        // Spawn visual arrow projectile
        spawnArrow(camera.position.clone(), camDir.clone());
        handSwingTime = 0;
        return;
      }

      // Food: eat instead of place
      if (def.isFood && def.foodRestore) {
        if (hungerRef.current < MAX_HUNGER) {
          const newHunger = Math.min(MAX_HUNGER, hungerRef.current + def.foodRestore);
          hungerRef.current = newHunger;
          setHunger(newHunger);
          const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
          inventoryRef.current = nextInv;
          setInventory(nextInv);
          audio.playEat();
          statsRef.current.foodEaten++;
          setToast(`Ate ${def.label} (+${def.foodRestore} hunger)`);
          setTimeout(() => setToast(null), 2000);
          // Golden apple: also restore health
          if (slot.item === 'golden_apple') {
            healthFloat = Math.min(MAX_HEALTH, healthFloat + 4);
            healthRef.current = Math.round(healthFloat);
            setHealth(Math.round(healthFloat));
          }
        }
        return;
      }

      // Bed use: right-click on a placed bed to set spawn + skip night
      {
        const hit = world.raycast(camera, 5);
        if (hit) {
          const bt = world.getType(hit.x, hit.y, hit.z);
          if (bt === 'bed') {
            spawnPointRef.current = { x: hit.x + 0.5, y: hit.y + 1, z: hit.z + 0.5 };
            // Actually skip night: advance elapsed to next dawn
            const currentPhase = ((elapsedRef.current / DAY_LENGTH_SECONDS) + 0.25) % 1;
            const isNight = currentPhase > 0.55 || currentPhase < 0.15;
            if (isNight) {
              // Skip to dawn (phase 0.15 which is early morning)
              const targetPhase = 0.15;
              const currentCycle = Math.floor((elapsedRef.current / DAY_LENGTH_SECONDS) + 0.25);
              const nextDawn = (currentCycle + (currentPhase > 0.15 ? 1 : 0) + targetPhase - 0.25) * DAY_LENGTH_SECONDS;
              const skip = nextDawn - elapsedRef.current;
              if (skip > 0 && skip < DAY_LENGTH_SECONDS) {
                elapsed += skip;
                elapsedRef.current = elapsed;
              }
              insomniaNights = 0; // Reset insomnia on sleep
              setToast('🛏️ Spawn set! Good morning!');
            } else {
              setToast('🛏️ Spawn point set! (Can only sleep at night)');
            }
            setTimeout(() => setToast(null), 2500);
            return;
          }
          // Door toggle: right-click to open/close
          if (bt === 'oak_door' || bt === 'trapdoor') {
            const key = `${hit.x},${hit.y},${hit.z}`;
            if (openDoorsRef.current.has(key)) {
              openDoorsRef.current.delete(key);
              setToast('Door closed');
            } else {
              openDoorsRef.current.add(key);
              setToast('Door opened');
            }
            audio.playBlockPlace(bt);
            setTimeout(() => setToast(null), 1500);
            return;
          }
          // Noteblock: right-click to play note (pitch cycles)
          if (bt === 'noteblock') {
            const key = `${hit.x},${hit.y},${hit.z}`;
            const pitch = (noteblockPitchRef.current.get(key) ?? 0) + 1;
            noteblockPitchRef.current.set(key, pitch % 25);
            // Play note using WebAudio
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = 220 * Math.pow(2, (pitch % 25) / 12);
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.2, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.connect(gain).connect(ctx.destination);
            osc.start(); osc.stop(ctx.currentTime + 0.5);
            setToast(`🎵 Note: ${pitch % 25}`);
            setTimeout(() => setToast(null), 1500);
            return;
          }
          // Jukebox: play a random melody
          if (bt === 'jukebox') {
            const ctx = new AudioContext();
            // Play a procedural melody (one of 4 random tunes)
            const melodies = [
              [523, 587, 659, 698, 784, 698, 659, 587, 523, 440, 523, 659],  // C major scale up/down
              [392, 440, 523, 440, 392, 330, 392, 440, 523, 659, 784, 659],  // playful melody
              [330, 392, 440, 523, 440, 392, 330, 294, 330, 392, 440, 523],  // gentle ascent
              [784, 659, 523, 440, 392, 440, 523, 659, 784, 880, 784, 659],  // dramatic
            ];
            const melody = melodies[Math.floor(Math.random() * melodies.length)];
            for (let i = 0; i < melody.length; i++) {
              const osc = ctx.createOscillator();
              osc.type = i % 2 === 0 ? 'sine' : 'triangle';
              osc.frequency.value = melody[i];
              const gain = ctx.createGain();
              gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.2);
              gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.2 + 0.18);
              osc.connect(gain).connect(ctx.destination);
              osc.start(ctx.currentTime + i * 0.2);
              osc.stop(ctx.currentTime + i * 0.2 + 0.2);
            }
            // Note particles (music notes floating up)
            for (let np = 0; np < 5; np++) {
              const mat = new THREE.MeshStandardMaterial({ color: 0x44ff44, emissive: 0x22cc22, emissiveIntensity: 1, transparent: true, opacity: 0.8 });
              const m = new THREE.Mesh(particleGeom, mat);
              m.position.set(hit.x + 0.5 + (Math.random() - 0.5), hit.y + 1.5, hit.z + 0.5 + (Math.random() - 0.5));
              m.castShadow = false; m.receiveShadow = false;
              scene.add(m);
              particles.push({
                mesh: m,
                velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1 + Math.random(), (Math.random() - 0.5) * 0.5),
                age: 0, life: 1.5 + Math.random(),
              });
            }
            setToast('🎶 Playing music...');
            setTimeout(() => setToast(null), 3000);
            return;
          }
          // Sign: right-click to read or set text
          if (bt === 'sign') {
            const key = `${hit.x},${hit.y},${hit.z}`;
            const text = signTextsRef.current.get(key);
            if (text) {
              setToast(`📜 Sign: "${text}"`);
            } else {
              const newText = `${username}'s sign`;
              signTextsRef.current.set(key, newText);
              setToast(`📜 Sign placed: "${newText}"`);
            }
            setTimeout(() => setToast(null), 3000);
            return;
          }
          // Brewing stand: shows brewing hint
          if (bt === 'brewing_stand') {
            setToast('🧪 Brewing Stand — craft potions at a crafting table with glass bottles');
            setTimeout(() => setToast(null), 3000);
            return;
          }
          // Lever: toggle on/off + activate nearby redstone lamps
          if (bt === 'lever') {
            const key = `${hit.x},${hit.y},${hit.z}`;
            const wasOn = leverStatesRef.current.has(key);
            if (wasOn) {
              leverStatesRef.current.delete(key);
              setToast('⚡ Lever: OFF');
            } else {
              leverStatesRef.current.add(key);
              setToast('⚡ Lever: ON');
            }
            // Toggle nearby redstone lamps (within 3 blocks)
            for (let ldx = -3; ldx <= 3; ldx++) {
              for (let ldy = -2; ldy <= 2; ldy++) {
                for (let ldz = -3; ldz <= 3; ldz++) {
                  const lampType = world.getType(hit.x + ldx, hit.y + ldy, hit.z + ldz);
                  if (lampType === 'redstone_lamp') {
                    // Toggle lamp brightness via emissive (visual cue)
                    const lampKey = `lamp_${hit.x + ldx},${hit.y + ldy},${hit.z + ldz}`;
                    if (!wasOn) {
                      leverStatesRef.current.add(lampKey);
                    } else {
                      leverStatesRef.current.delete(lampKey);
                    }
                  }
                }
              }
            }
            audio.playBlockPlace('stone_bricks');
            setTimeout(() => setToast(null), 1500);
            return;
          }
          // Redstone lamp: right-click to toggle
          if (bt === 'redstone_lamp') {
            const lampKey = `lamp_${hit.x},${hit.y},${hit.z}`;
            if (leverStatesRef.current.has(lampKey)) {
              leverStatesRef.current.delete(lampKey);
              setToast('💡 Lamp: OFF');
            } else {
              leverStatesRef.current.add(lampKey);
              setToast('💡 Lamp: ON');
            }
            audio.playBlockPlace('glass');
            setTimeout(() => setToast(null), 1500);
            return;
          }
          // Anvil: repair held tool
          if (bt === 'anvil') {
            const hSlot = inventoryRef.current[selectedRef.current];
            if (hSlot) {
              const hDef = ITEMS[hSlot.item];
              if (hDef.isTool && hDef.durability && hSlot.durability !== undefined) {
                const ironNeeded = 1;
                const ironIdx = inventoryRef.current.findIndex(s => s && s.item === 'iron_ingot');
                if (ironIdx !== -1) {
                  let inv = removeFromSlot(inventoryRef.current, ironIdx, 1);
                  // Restore 25% durability
                  const restore = Math.floor(hDef.durability * 0.25);
                  const slot = inv[selectedRef.current];
                  if (slot && slot.durability !== undefined) {
                    slot.durability = Math.min(hDef.durability, slot.durability + restore);
                  }
                  inventoryRef.current = inv;
                  setInventory([...inv]);
                  audio.playAnvilUse();
                  setToast(`🔨 Repaired ${hDef.label} (+${restore} durability)`);
                } else {
                  setToast('🔨 Need Iron Ingot to repair');
                }
              } else {
                setToast('🔨 Hold a tool to repair it');
              }
            } else {
              setToast('🔨 Hold a tool to repair it');
            }
            setTimeout(() => setToast(null), 2500);
            return;
          }
          // Enchanting Table: enchant held weapon/tool
          if (bt === 'enchanting_table') {
            const hSlot = inventoryRef.current[selectedRef.current];
            if (hSlot) {
              const hDef = ITEMS[hSlot.item];
              if (hDef.isTool) {
                // Need XP + lapis (diamond as substitute)
                const xpCost = 10;
                if (totalXpRef.current >= xpCost) {
                  // Random enchantment (tier-exclusive max levels)
                  const enchants = ['Sharpness', 'Efficiency', 'Unbreaking', 'Fortune', 'Power', 'Knockback'];
                  const ench = enchants[Math.floor(Math.random() * enchants.length)];
                  const maxLevel = TIER_MAX_ENCHANT[balanceTier];
                  const level = 1 + Math.floor(Math.random() * Math.min(maxLevel, 7));
                  const numLabels = ['I','II','III','IV','V','VI','VII'];
                  enchantedItemsRef.current.set(selectedRef.current, `${ench} ${numLabels[level-1]}`);
                  statsRef.current.itemsEnchanted++;
                  // Deduct XP
                  const newXp = totalXpRef.current - xpCost;
                  totalXpRef.current = newXp;
                  setTotalXp(newXp);
                  // Boost the tool stats
                  const inv = [...inventoryRef.current];
                  const slot = inv[selectedRef.current];
                  if (slot && slot.durability !== undefined) {
                    if (ench === 'Unbreaking') slot.durability = Math.floor(slot.durability * (1 + level * 0.3));
                  }
                  inventoryRef.current = inv;
                  setInventory(inv);
                  audio.playBlockPlace('diamond_ore');
                  setToast(`✨ Enchanted: ${ench} ${numLabels[level-1]}!`);
                } else {
                  setToast(`✨ Need ${xpCost} XP to enchant (have ${totalXpRef.current})`);
                }
              } else {
                setToast('✨ Hold a tool or weapon to enchant');
              }
            } else {
              setToast('✨ Hold a tool or weapon to enchant');
            }
            setTimeout(() => setToast(null), 3000);
            return;
          }
        }
      }

      // Barrel / Redstone Lamp / Melon interactions
      {
        const hit = world.raycast(camera, 5);
        if (hit) {
          const bt = world.getType(hit.x, hit.y, hit.z);
          if (bt === 'barrel') {
            const key = `barrel_${hit.x},${hit.y},${hit.z}`;
            if (!leverStatesRef.current.has(key)) {
              leverStatesRef.current.add(key);
              const lootTable: Array<{ item: ItemType; count: number; label: string }> = [
                { item: 'iron_ingot', count: 2 + Math.floor(Math.random() * 3), label: 'Iron Ingots' },
                { item: 'coal', count: 3 + Math.floor(Math.random() * 5), label: 'Coal' },
                { item: 'bread', count: 2 + Math.floor(Math.random() * 3), label: 'Bread' },
                { item: 'arrow', count: 5 + Math.floor(Math.random() * 10), label: 'Arrows' },
                { item: 'string', count: 2 + Math.floor(Math.random() * 4), label: 'String' },
                { item: 'emerald', count: 1 + Math.floor(Math.random() * 2), label: 'Emeralds' },
              ];
              const loot = lootTable[Math.floor(Math.random() * lootTable.length)];
              let inv = inventoryRef.current;
              inv = addItem(inv, loot.item, loot.count);
              inventoryRef.current = inv;
              setInventory(inv);
              audio.playChest();
              setToast(`📦 Barrel: Found ${loot.count} ${loot.label}!`);
              setTimeout(() => setToast(null), 2500);
              return;
            } else {
              setToast('📦 This barrel is empty');
              setTimeout(() => setToast(null), 1500);
              return;
            }
          }
          // Redstone Lamp: toggle emissive on/off
          if (bt === 'redstone_lamp') {
            audio.playBlockPlace('redstone_lamp');
            setToast('💡 Redstone Lamp toggled!');
            setTimeout(() => setToast(null), 1500);
            return;
          }
          // Melon: gives melon slices when right-clicked
          if (bt === 'melon') {
            let inv = inventoryRef.current;
            const slices = 3 + Math.floor(Math.random() * 5);
            inv = addItem(inv, 'melon_slice', slices);
            inventoryRef.current = inv;
            setInventory(inv);
            world.removeBlock(hit.x, hit.y, hit.z, true);
            audio.playBlockBreak('melon');
            setToast(`🍉 Got ${slices} Melon Slices!`);
            setTimeout(() => setToast(null), 2000);
            return;
          }
        }
      }

      // Villager trading: right-click with emerald or bone etc
      {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const origin = camera.position.clone();
        const mob = villagers.hitTest(origin, camDir, 4);
        if (mob) {
          if (villagers.canTrade(mob)) {
            // Trade offers based on what player holds
            const tradeSlot = inventoryRef.current[selectedRef.current];
            if (tradeSlot && tradeSlot.item === 'emerald' && tradeSlot.count >= 1) {
              // Random trade: emerald → useful item (tier affects selection)
              const trades: Array<{ item: ItemType; count: number; label: string }> = [
                { item: 'diamond', count: 1, label: '💎 Diamond' },
                { item: 'iron_ingot', count: 4, label: '🔩 4 Iron Ingots' },
                { item: 'golden_apple', count: 1, label: '🍎 Golden Apple' },
                { item: 'arrow', count: 16, label: '🏹 16 Arrows' },
                { item: 'book', count: 3, label: '📖 3 Books' },
                { item: 'bread', count: 6, label: '🍞 6 Bread' },
                { item: 'enchanted_book', count: 1, label: '📕 Enchanted Book' },
              ];
              // Higher tiers get better trades
              if (balanceTier === 'bronze' || balanceTier === 'silver' || balanceTier === 'gold' || balanceTier === 'diamond') {
                trades.push({ item: 'ender_pearl', count: 2, label: '🌀 2 Ender Pearls' });
                trades.push({ item: 'diamond', count: 2, label: '💎 2 Diamonds' });
                trades.push({ item: 'cooked_beef', count: 8, label: '🥩 8 Steak' });
              }
              if (balanceTier === 'gold' || balanceTier === 'diamond') {
                trades.push({ item: 'diamond', count: 3, label: '💎 3 Diamonds' });
                trades.push({ item: 'golden_apple', count: 2, label: '🍎 2 Golden Apples' });
                trades.push({ item: 'enchanted_book', count: 2, label: '📕 2 Enchanted Books' });
              }
              if (balanceTier === 'diamond') {
                trades.push({ item: 'diamond', count: 5, label: '💎 5 Diamonds' });
                trades.push({ item: 'beacon', count: 1, label: '🔷 Beacon' });
              }
              const trade = trades[Math.floor(Math.random() * trades.length)];
              let inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
              inv = addItem(inv, trade.item, trade.count);
              inventoryRef.current = inv;
              setInventory(inv);
              villagers.markTraded(mob);
              statsRef.current.villagerTrades++;
              audio.playVillagerTrade();
              setToast(`🤝 Traded: 1 Emerald → ${trade.label}`);
              setTimeout(() => setToast(null), 2500);
              return;
            } else {
              // Show trade hint
              setToast('🏪 Villager — hold Emeralds to trade!');
              setTimeout(() => setToast(null), 2500);
              return;
            }
          } else {
            setToast('🏪 Villager is resting...');
            setTimeout(() => setToast(null), 1500);
            return;
          }
        }
      }

      // Ender pearl teleport: right-click to throw
      if (slot.item === 'ender_pearl') {
        const now = performance.now();
        if (now - enderPearlCdRef.current > 1000) { // 1s cooldown
          enderPearlCdRef.current = now;
          const dir = new THREE.Vector3();
          camera.getWorldDirection(dir);
          // Teleport 12 blocks in look direction
          const dist = 12;
          const newX = player.position.x + dir.x * dist;
          const newY = player.position.y + dir.y * dist + 1;
          const newZ = player.position.z + dir.z * dist;
          player.position.set(newX, Math.max(2, newY), newZ);
          // Use the pearl
          const inv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
          inventoryRef.current = inv;
          setInventory(inv);
          statsRef.current.enderPearlsThrown++;
          // Take 3 damage (MC-style)
          healthRef.current = Math.max(0, healthRef.current - 3);
          setHealth(healthRef.current);
          audio.playEnchant();
          setToast('🌀 Teleported!');
          setTimeout(() => setToast(null), 1500);
          // Ender pearl teleport particles (purple sparkles at destination)
          for (let ep = 0; ep < 12; ep++) {
            const mat = new THREE.MeshStandardMaterial({
              color: new THREE.Color(0x8844cc),
              emissive: new THREE.Color(0x6622aa),
              emissiveIntensity: 1.5,
              transparent: true,
              opacity: 0.9,
            });
            const m = new THREE.Mesh(particleGeom, mat);
            m.position.set(
              newX + (Math.random() - 0.5) * 2,
              Math.max(2, newY) + Math.random() * 2,
              newZ + (Math.random() - 0.5) * 2
            );
            m.castShadow = false; m.receiveShadow = false;
            scene.add(m);
            particles.push({
              mesh: m,
              velocity: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3),
              age: 0, life: 0.6 + Math.random() * 0.4,
            });
          }
          return;
        }
      }

      // Map: show expanded minimap
      if (slot.item === 'map') {
        setToast('🗺️ Map — minimap expanded while held');
        setTimeout(() => setToast(null), 2000);
        return;
      }

      // Potion use: right-click to drink
      if (slot.item.startsWith('potion_')) {
        const potionType = slot.item as string;
        let duration = 30; // seconds
        let effectMsg = '';
        switch (potionType) {
          case 'potion_healing':
            healthRef.current = Math.min(MAX_HEALTH, healthRef.current + 8);
            setHealth(healthRef.current);
            effectMsg = '❤️ Healed 4 hearts!';
            duration = 0; // instant
            break;
          case 'potion_speed':
            effectMsg = '💨 Speed Boost (30s)';
            break;
          case 'potion_strength':
            effectMsg = '💪 Strength (30s)';
            break;
          case 'potion_fire_resist':
            effectMsg = '🔥 Fire Resistance (30s)';
            break;
          case 'potion_night_vision':
            effectMsg = '👁️ Night Vision (60s)';
            duration = 60;
            break;
          case 'potion_jump':
            effectMsg = '🦘 Jump Boost (30s)';
            break;
        }
        if (duration > 0) {
          potionTypeRef.current = potionType;
          potionTimerRef.current = duration;
          setActivePotion(potionType);
        }
        const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
        // Give back empty bottle
        const bottleInv = addItem(nextInv, 'glass_bottle', 1);
        inventoryRef.current = bottleInv;
        setInventory(bottleInv);
        setToast(effectMsg);
        setTimeout(() => setToast(null), 2500);
        return;
      }

      // Spyglass: right-click toggles zoom
      if (slot.item === 'spyglass') {
        spyglassRef.current = !spyglassRef.current;
        setSpyglassActive(spyglassRef.current);
        setToast(spyglassRef.current ? '🔭 Zoomed in' : '🔭 Zoom off');
        setTimeout(() => setToast(null), 1500);
        return;
      }

      // Breeding: right-click passive mob with bread or apple
      if (slot.item === 'bread' || slot.item === 'apple') {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        const origin = camera.position.clone();
        const passiveMgrs = [cows, pigs, chickens];
        for (const mgr of passiveMgrs) {
          const mob = mgr.hitTest(origin, camDir, 4);
          if (mob) {
            // "Breed" — spawn a baby (just spawn 1 more near that mob)
            const mx = mob.group.position.x + (Math.random() - 0.5) * 2;
            const mz = mob.group.position.z + (Math.random() - 0.5) * 2;
            mgr.spawn(1, Math.floor(mx), Math.floor(mz), 3);
            const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
            inventoryRef.current = nextInv;
            setInventory(nextInv);
            audio.playBlockPlace('base_blue');
            setToast('♥ Bred animal!');
            setTimeout(() => setToast(null), 2000);
            return;
          }
        }
      }

      if (!def.isBlock) return; // can't place tools
      // Land claim check
      const placeCheck = canModifyBlock(x, z, walletAddress, landClaimsRef.current);
      if (!placeCheck.allowed) {
        setToast(`⛳ This land is claimed by ${placeCheck.owner}!`);
        setTimeout(() => setToast(null), 2000);
        return;
      }
      // On-chain: tier-gated blocks
      if (def.walletExclusive) {
        if (!canAccessBlock(slot.item, balanceTier)) {
          const requiredTier = def.requiredTier ?? 'base';
          const info = getTierInfo(requiredTier as BalanceTier);
          setToast(`⛓ Need ${info.label} tier to place ${def.label}!`);
          setTimeout(() => setToast(null), 3000);
          return;
        }
      }
      const type = slot.item as BlockType;
      const nextInv = removeFromSlot(inventoryRef.current, selectedRef.current, 1);
      inventoryRef.current = nextInv;
      setInventory(nextInv);
      // Stats tracking
      statsRef.current.blocksPlaced++;
      if (type === 'beacon') statsRef.current.beaconsPlaced++;
      // Daily challenge progress: place blocks
      advanceDailyChallenge('place', 'build');
      audio.playBlockPlace(type);
      world.addBlock(x, y, z, type, true);
      socket.emit('block:place', { x, y, z, type });
      // Block place particles (small poof)
      const blockColor = BLOCKS[type].color;
      for (let bp = 0; bp < 4; bp++) {
        const mat = new THREE.MeshStandardMaterial({
          color: blockColor, transparent: true, opacity: 0.7,
        });
        const m = new THREE.Mesh(particleGeom, mat);
        m.position.set(
          x + 0.5 + (Math.random() - 0.5) * 0.6,
          y + 0.5 + (Math.random() - 0.5) * 0.6,
          z + 0.5 + (Math.random() - 0.5) * 0.6,
        );
        m.castShadow = false;
        scene.add(m);
        particles.push({
          mesh: m,
          velocity: new THREE.Vector3(
            (Math.random() - 0.5) * 1.5,
            Math.random() * 1.5,
            (Math.random() - 0.5) * 1.5,
          ),
          age: 0,
          life: 0.3 + Math.random() * 0.2,
        });
      }
      handSwingTime = 0;
    };

    // ---- Mob attack (left click with sword) ----
    const tryAttackMob = () => {
      const slot = inventoryRef.current[selectedRef.current];
      const def = slot ? ITEMS[slot.item] : null;
      let damage = def?.attackDamage ?? 1;

      // Strength potion: +50% damage
      if (potionTypeRef.current === 'potion_strength') {
        damage = Math.floor(damage * 1.5);
      }

      // Critical hit: falling → 1.5× damage (MC-style jump-attack)
      if (player.velocity.y < -0.5) {
        damage = Math.floor(damage * 1.5);
      }

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      const origin = camera.position.clone();

      // Check all mob managers for hits
      const managersWithNames: Array<[any, string]> = [
        [cows, 'Cow'], [pigs, 'Pig'], [chickens, 'Chicken'], [zombies, 'Zombie'],
        [skeletons, 'Skeleton'], [creepers, 'Creeper'], [spiders, 'Spider'],
        [wolves, 'Wolf'], [endermen, 'Enderman'], [ironGolems, 'Iron Golem'],
        [slimes, 'Slime'], [bats, 'Bat'], [villagers, 'Villager'],
        [witches, 'Witch'], [blazes, 'Blaze'], [phantoms, 'Phantom'],
        [foxes, 'Fox'], [ghasts, 'Ghast'],
        [parrots, 'Parrot'], [turtles, 'Turtle'],
        [wardens, 'Warden'],
      ];
      let hit = false;
      for (const [mgr, mobName] of managersWithNames) {
        const mob = mgr.hitTest(origin, camDir, 4);
        if (mob) {
          // Critical hit: falling + attacking = 1.5x damage + particles
          const isCritical = player.velocity.y < -0.5 && Math.abs(player.velocity.y) > 0.1;
          const finalDamage = isCritical ? Math.floor(damage * 1.5) : damage;
          const drops = mgr.dealDamage(mob, finalDamage);
          audio.playMobHurt();
          // Critical hit golden sparkle particles
          if (isCritical) {
            for (let ci = 0; ci < 8; ci++) {
              const critMat = new THREE.MeshBasicMaterial({
                color: 0xffdd00, transparent: true, opacity: 0.9,
              });
              const critMesh = new THREE.Mesh(particleGeom, critMat);
              critMesh.position.copy(mob.group.position);
              critMesh.position.y += 1;
              critMesh.castShadow = false;
              scene.add(critMesh);
              particles.push({
                mesh: critMesh,
                velocity: new THREE.Vector3(
                  (Math.random() - 0.5) * 3,
                  1 + Math.random() * 2,
                  (Math.random() - 0.5) * 3,
                ),
                age: 0, life: 0.5 + Math.random() * 0.3,
              });
            }
            setToast('💥 Critical Hit!');
            setTimeout(() => setToast(null), 1000);
          }
          if (drops) {
            let inv = inventoryRef.current;
            for (const drop of drops) {
              inv = addItem(inv, drop.item, drop.count);
            }
            inventoryRef.current = inv;
            setInventory(inv);
            // XP for killing mob + stats + XP orbs (tier multiplied)
            statsRef.current.mobsKilled++;
            // Daily challenge progress: kill mobs
            advanceDailyChallenge('kill', 'slay');
            // Kill streak tracking
            killStreak++;
            killStreakTimer = 8; // 8 second window for next kill
            if (killStreak > statsRef.current.maxKillStreak) statsRef.current.maxKillStreak = killStreak;
            const streakBonus = killStreak >= 5 ? 3 : killStreak >= 3 ? 2 : 1;
            // Kill feed entry
            const streakText = killStreak >= 3 ? ` (${killStreak}x streak!)` : '';
            setKillFeed(prev => {
              const next = [...prev, { id: Date.now(), text: `⚔ Killed ${mobName}${streakText}`, ts: Date.now() }];
              if (next.length > 5) next.shift();
              return next;
            });
            if (killStreak === 3) {
              setToast('🔥 Triple Kill!');
              audio.playKillStreak();
              setTimeout(() => setToast(null), 2000);
            } else if (killStreak === 5) {
              setToast('🔥🔥 Killing Spree!');
              audio.playKillStreak();
              setTimeout(() => setToast(null), 2000);
            } else if (killStreak === 7) {
              setToast('⚡ DOMINATING!');
              audio.playKillStreak();
              setTimeout(() => setToast(null), 2500);
            } else if (killStreak === 10) {
              setToast('💀 UNSTOPPABLE!');
              audio.playKillStreak();
              setTimeout(() => setToast(null), 2500);
            } else if (killStreak === 15) {
              setToast('👑 GODLIKE!');
              audio.playKillStreak();
              setTimeout(() => setToast(null), 3000);
            }
            // Mob-specific XP values (harder mobs = more XP)
            const MOB_XP: Record<string, number> = {
              'Cow': 3, 'Pig': 3, 'Chicken': 2, 'Fox': 3, 'Parrot': 2, 'Turtle': 3, 'Bat': 1,
              'Zombie': 5, 'Skeleton': 7, 'Spider': 5, 'Creeper': 8, 'Slime': 4,
              'Enderman': 10, 'Witch': 12, 'Blaze': 12, 'Phantom': 8, 'Ghast': 15,
              'Iron Golem': 20, 'Warden': 50, 'Wolf': 3, 'Villager': 1,
            };
            const baseXp = MOB_XP[mobName] ?? 5;
            const mobXp = Math.round(baseXp * TIER_XP_MULTIPLIER[balanceTier] * streakBonus * (isCritical ? 1.5 : 1));
            const newXp = totalXpRef.current + mobXp;
            totalXpRef.current = newXp;
            setTotalXp(newXp);
            spawnXPOrbs(mob.group.position.x, mob.group.position.y, mob.group.position.z, 3);
            // Kill bounty: wallet users earn emeralds on kill
            const bounty = TIER_KILL_BOUNTY[balanceTier];
            if (bounty > 0) {
              let bInv = inventoryRef.current;
              bInv = addItem(bInv, 'emerald', bounty);
              inventoryRef.current = bInv;
              setInventory(bInv);
              statsRef.current.emeraldsEarned += bounty;
            }
            // Tier-based bonus mob drops (extra random loot)
            const bonusChance = TIER_MOB_DROP_BONUS[balanceTier];
            if (bonusChance > 0 && Math.random() < bonusChance) {
              const bonusDrops: ItemType[] = ['bone', 'string', 'iron_ingot', 'gold_ingot', 'diamond', 'emerald', 'ender_pearl'];
              const bonusDrop = bonusDrops[Math.floor(Math.random() * bonusDrops.length)];
              let bInv2 = inventoryRef.current;
              bInv2 = addItem(bInv2, bonusDrop, 1);
              inventoryRef.current = bInv2;
              setInventory(bInv2);
            }
          }
          // Decrement tool durability
          if (slot && def?.isTool && def.durability) {
            const { inv: afterTool, broke } = useTool(inventoryRef.current, selectedRef.current);
            inventoryRef.current = afterTool;
            setInventory(afterTool);
            if (broke) audio.playBlockBreak('royal_brick');
          }
          hit = true;
          break;
        }
      }
      return hit;
    };

    // Override onBreak to first check for mob attack
    const originalOnBreak = player.onBreak;
    player.onBreak = (x, y, z) => {
      // Try to attack mob first — if no mob hit, break block
      const mobHit = tryAttackMob();
      if (mobHit) {
        handSwingTime = 0;
        return;
      }
      if (originalOnBreak) originalOnBreak(x, y, z);
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
    // Expose elapsed via ref for bed/time-skip interactions
    const elapsedRef = { current: elapsed };
    let raf = 0;
    let frameSamples: number[] = [];
    let lowFpsSince = 0;
    let shadowsDisabled = false;

    // Health / hunger accumulators
    let healthFloat = MAX_HEALTH;
    let hungerFloat = MAX_HUNGER;
    let justDied = false; // guards death-loop re-firing
    let lastZombieSpawn = 0;
    let hurtFlashTimer = 0;
    let lastPosX = camera.position.x;
    let lastPosZ = camera.position.z;
    let cameraShakeTimer = 0;
    let cameraShakeIntensity = 0;
    // Kill streak tracking: consecutive kills within 8s
    let killStreak = 0;
    let killStreakTimer = 0;
    // Insomnia: tracks how many nights player hasn't slept (more phantoms)
    let insomniaNights = 0;
    let lastNightCheck = false;
    // Ambient mob sounds timer
    let lastAmbientSound = 0;
    // Day/night transition tracking
    let wasNightLast = false;
    // Creeper fuse tracking
    let wasCreeperFusing = false;
    // Mining combo: consecutive blocks within 3s increase XP bonus
    let miningCombo = 0;
    let miningComboTimer = 0;

    const tick = () => {
      const dt = clock.getDelta();
      elapsed += dt;
      elapsedRef.current = elapsed;
      player.update(dt);
      others.update(dt);
      cows.update(dt, camera.position);
      pigs.update(dt, camera.position);
      chickens.update(dt, camera.position);
      world.update();

      // Mining combo timer decay
      if (miningComboTimer > 0) {
        miningComboTimer -= dt;
        if (miningComboTimer <= 0) {
          miningCombo = 0;
          setMiningComboDisplay(0);
        }
      }
      // Kill streak timer
      if (killStreakTimer > 0) {
        killStreakTimer -= dt;
        if (killStreakTimer <= 0) {
          killStreak = 0;
        }
      }
      // Update combo display every few blocks
      if (miningCombo >= 5 && miningCombo !== miningComboDisplay) {
        setMiningComboDisplay(miningCombo);
      }

      // ---- Day/night phase ----
      const phase = ((elapsed / DAY_LENGTH_SECONDS) + 0.25) % 1;
      const sunAngle = phase * Math.PI * 2 - Math.PI / 2;
      const sy = Math.sin(sunAngle);
      const sx = Math.cos(sunAngle);
      const dayMix = Math.max(0, Math.min(1, (sy + 0.1) * 1.2));
      const isNight = sy < -0.05;

      // ---- Day/night transition messages ----
      if (isNight && !wasNightLast) {
        setToast('🌙 Night falls... Beware of monsters!');
        setTimeout(() => setToast(null), 3000);
      } else if (!isNight && wasNightLast) {
        setToast('☀️ The sun rises. Monsters burn in daylight!');
        setTimeout(() => setToast(null), 3000);
      }
      wasNightLast = isNight;

      // ---- Hostile mob spawning & update ----
      zombies.isNight = isNight;
      skeletons.isNight = isNight;
      creepers.isNight = isNight;
      spiders.isNight = isNight;
      if (isNight) {
        if (elapsed - lastZombieSpawn > 30) {
          if (zombies.getMobs().length < 8) zombies.spawnNight(3, camera.position.x, camera.position.z);
          if (skeletons.getMobs().length < 4) skeletons.spawnNight(2, camera.position.x, camera.position.z);
          if (creepers.getMobs().length < 3) creepers.spawnNight(1, camera.position.x, camera.position.z);
          if (spiders.getMobs().length < 5) spiders.spawnNight(2, camera.position.x, camera.position.z);
          lastZombieSpawn = elapsed;
        }
      }
      // Reset insomnia night flag when day starts
      if (!isNight) lastNightCheck = false;

      zombies.update(dt, camera.position);
      skeletons.update(dt, camera.position);
      creepers.update(dt, camera.position);
      spiders.update(dt, camera.position);
      wolves.update(dt, camera.position);
      endermen.isNight = isNight;
      endermen.update(dt, camera.position);
      ironGolems.update(dt, camera.position);
      slimes.update(dt, camera.position);
      bats.update(dt, camera.position);
      villagers.update(dt, camera.position);
      witches.update(dt, camera.position);
      blazes.update(dt, camera.position);
      phantoms.isNight = isNight;
      phantoms.update(dt, camera.position);
      foxes.update(dt, camera.position);
      ghasts.update(dt, camera.position);
      parrots.update(dt, camera.position);
      turtles.update(dt, camera.position);
      wardens.update(dt, camera.position);

      // ---- Ambient mob sounds (play random mob sounds every 8-15 seconds) ----
      if (elapsed - lastAmbientSound > 8 + Math.random() * 7) {
        lastAmbientSound = elapsed;
        // Check which mobs are nearby and play their sound
        const nearCows = cows.getMobs().some(m => m.group.position.distanceTo(camera.position) < 20);
        const nearPigs = pigs.getMobs().some(m => m.group.position.distanceTo(camera.position) < 20);
        const nearChickens = chickens.getMobs().some(m => m.group.position.distanceTo(camera.position) < 20);
        const nearZombies = isNight && zombies.getMobs().some(m => m.group.position.distanceTo(camera.position) < 25);
        const nearSkeletons = isNight && skeletons.getMobs().some(m => m.group.position.distanceTo(camera.position) < 25);
        const candidates: (() => void)[] = [];
        if (nearCows) candidates.push(() => audio.playCowMoo());
        if (nearPigs) candidates.push(() => audio.playPigOink());
        if (nearChickens) candidates.push(() => audio.playChickenCluck());
        if (nearZombies) candidates.push(() => audio.playZombieGroan());
        if (nearSkeletons) candidates.push(() => audio.playSkeletonRattle());
        if (candidates.length > 0) {
          candidates[Math.floor(Math.random() * candidates.length)]();
        }
      }

      // Enderman spawn at night (rare)
      witches.isNight = isNight;
      if (isNight && elapsed - lastZombieSpawn < 1) {
        if (endermen.getMobs().length < 2) endermen.spawnNight(1, camera.position.x, camera.position.z);
        if (slimes.getMobs().length < 3) slimes.spawnNight(2, camera.position.x, camera.position.z);
        if (witches.getMobs().length < 2) witches.spawnNight(1, camera.position.x, camera.position.z);
        // Track insomnia (night transitions without sleeping)
        if (!lastNightCheck) {
          insomniaNights++;
          lastNightCheck = true;
        }
        // Phantoms spawn at night — more with insomnia!
        const phantomCap = Math.min(6, 2 + insomniaNights);
        if (phantoms.getMobs().length < phantomCap) phantoms.spawnFlying(1, camera.position.x, camera.position.z, 30);
        // Rare blaze spawns
        if (blazes.getMobs().length < 1 && Math.random() < 0.3) blazes.spawn(1, camera.position.x, camera.position.z, 20);
        // Very rare ghast (only for wallet users, tier bonus)
        if (ghasts.getMobs().length < 1 && walletAddress && Math.random() < 0.15) {
          ghasts.spawnFlying(1, camera.position.x, camera.position.z, 25);
        }
      }

      // Creeper proximity warning — flash green vignette when creeper is close
      {
        let creeperClose = false;
        for (const mob of creepers.getMobs()) {
          const dx = mob.group.position.x - camera.position.x;
          const dz = mob.group.position.z - camera.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < 5 && mob.health > 0) {
            creeperClose = true;
            break;
          }
        }
        if (creeperClose !== creeperNearRef.current) {
          creeperNearRef.current = creeperClose;
          setCreeperNear(creeperClose);
        }
      }

      // Warden boss proximity warning (within 25 blocks)
      {
        let wardenClose = false;
        for (const mob of wardens.getMobs()) {
          if (mob.dead) continue;
          const dx = mob.group.position.x - camera.position.x;
          const dz = mob.group.position.z - camera.position.z;
          const dy = mob.group.position.y - camera.position.y;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 25) {
            wardenClose = true;
            break;
          }
        }
        if (wardenClose && Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) {
          // Pulsing darkness effect when warden is near
          cameraShakeTimer = 0.05;
          cameraShakeIntensity = 0.01;
        }
      }

      // Enderman: check if player is looking at one
      {
        const lookDir = new THREE.Vector3();
        camera.getWorldDirection(lookDir);
        endermen.checkLookedAt(camera.position, lookDir);
      }

      // Tamed wolves attack hostile mobs near them
      for (const hostileMgr of [zombies, skeletons, spiders, slimes]) {
        for (const mob of hostileMgr.getMobs()) {
          if (mob.dead) continue;
          const wolfDmg = wolves.attackTarget(mob.group.position);
          if (wolfDmg > 0) {
            hostileMgr.dealDamage(mob, wolfDmg);
          }
        }
      }

      // ---- Hostile mob attacks on player ----
      let lastDamageSource = 'Died';
      const applyMobDamage = (rawDmg: number, source?: string) => {
        if (rawDmg <= 0) return;
        if (invulnerableRef.current) return; // spawn protection
        if (source) lastDamageSource = source;
        // Shield blocking: halve damage if blocking
        let dmg = rawDmg;
        if (isBlockingRef.current) dmg = Math.floor(dmg * 0.5);
        // Armor reduction
        dmg = applyArmorReduction(dmg, armorRef.current);
        // Tier damage reduction (on-chain perk)
        dmg = Math.max(1, Math.round(dmg * (1 - TIER_DAMAGE_REDUCTION[balanceTier])));
        healthFloat = Math.max(0, healthFloat - dmg);
        healthRef.current = Math.round(healthFloat);
        setHealth(Math.round(healthFloat));
        hurtFlashTimer = 0.3;
        audio.playBlockBreak('royal_brick');
      };

      // Zombie melee
      applyMobDamage(zombies.checkAttack(camera.position), 'Slain by Zombie');
      // Skeleton ranged
      applyMobDamage(skeletons.checkRangedAttack(camera.position), 'Shot by Skeleton');
      // Creeper fuse warning hiss (play once when fuse starts)
      const creeperFusing = creepers.isCreeperFusing();
      if (creeperFusing && !wasCreeperFusing) {
        audio.playCreeperHiss();
      }
      wasCreeperFusing = creeperFusing;
      // Creeper explosion
      const creeperResult = creepers.checkExplosion(camera.position, dt);
      if (creeperResult) {
        applyMobDamage(creeperResult.damage, 'Blown up by Creeper');
        // Creeper explosion destroys nearby blocks (3×3×3 around detonation)
        const cx = Math.floor(creeperResult.pos.x);
        const cy = Math.floor(creeperResult.pos.y);
        const cz = Math.floor(creeperResult.pos.z);
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              const bx = cx + dx, by = cy + dy, bz = cz + dz;
              const bt = world.getType(bx, by, bz);
              if (bt && bt !== 'bedrock' && bt !== 'obsidian') {
                world.removeBlock(bx, by, bz, true);
                socket.emit('block:break', { x: bx, y: by, z: bz });
              }
            }
          }
        }
        audio.playExplosion();
        // Camera shake from creeper
        const cDist = camera.position.distanceTo(creeperResult.pos);
        if (cDist < 10) {
          cameraShakeTimer = 0.4;
          cameraShakeIntensity = 0.2 * (1 - cDist / 10);
        }
      }
      // Spider melee
      applyMobDamage(spiders.checkAttack(camera.position), 'Bitten by Spider');
      // Enderman melee
      applyMobDamage(endermen.checkAttack(camera.position), 'Killed by Enderman');
      // Slime melee
      applyMobDamage(slimes.checkAttack(camera.position), 'Squished by Slime');
      // Witch ranged potion attack
      applyMobDamage(witches.checkRangedAttack(camera.position), 'Poisoned by Witch');
      // Blaze fireball attack
      applyMobDamage(blazes.checkRangedAttack(camera.position), 'Burned by Blaze');
      // Phantom dive attack
      applyMobDamage(phantoms.checkDiveAttack(camera.position), 'Swooped by Phantom');
      // Ghast fireball attack
      applyMobDamage(ghasts.checkRangedAttack(camera.position), 'Fireballed by Ghast');
      // Warden melee (boss mob — high damage)
      applyMobDamage(wardens.checkAttack(camera.position), 'Crushed by Warden');

      // Iron golem auto-attacks nearby hostile mobs (all hostile types)
      const golemTargetMgrs = [zombies, skeletons, spiders, creepers, slimes, witches] as const;
      for (const mgr of golemTargetMgrs) {
        for (const mob of mgr.getMobs()) {
          if (mob.dead) continue;
          const golemDmg = ironGolems.attackHostileNear(mob.group.position);
          if (golemDmg > 0) mgr.dealDamage(mob, golemDmg);
        }
      }

      // ---- Cactus contact damage (check every ~0.5s) ----
      if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) {
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        for (let ddx = -1; ddx <= 1; ddx++) {
          for (let ddy = -1; ddy <= 1; ddy++) {
            for (let ddz = -1; ddz <= 1; ddz++) {
              if (world.getType(px + ddx, py + ddy, pz + ddz) === 'cactus') {
                const cdx = (px + ddx + 0.5) - camera.position.x;
                const cdz = (pz + ddz + 0.5) - camera.position.z;
                if (Math.abs(cdx) < 0.9 && Math.abs(cdz) < 0.9) {
                  applyMobDamage(1, 'Pricked by cactus'); // 1 damage from cactus
                }
              }
            }
          }
        }
      }

      // ---- Soul sand slowdown ----
      {
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y) - 1;
        const pz = Math.floor(camera.position.z);
        const below = world.getType(px, py, pz);
        if (below === 'soul_sand') {
          player.speedMultiplier = Math.min(player.speedMultiplier, 0.4);
        }
        if (below === 'mud') {
          player.speedMultiplier = Math.min(player.speedMultiplier, 0.5);
        }
        // Water slowdown: check if player is inside water block
        const atFeet = world.getType(px, py + 1, pz);
        if (atFeet === 'water') {
          player.speedMultiplier = Math.min(player.speedMultiplier, 0.35);
        }
      }

      // ---- Nether portal interaction (standing on/near portal block) ----
      {
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        let nearPortal = false;
        for (let dx = -1; dx <= 1 && !nearPortal; dx++) {
          for (let dy = -1; dy <= 1 && !nearPortal; dy++) {
            for (let dz = -1; dz <= 1 && !nearPortal; dz++) {
              if (world.getType(px + dx, py + dy, pz + dz) === 'nether_portal') {
                nearPortal = true;
              }
            }
          }
        }
        if (nearPortal && Math.floor(elapsed * 0.2) !== Math.floor((elapsed - dt) * 0.2)) {
          // Random teleport in a 40-block radius (nether portal effect)
          const angle = Math.random() * Math.PI * 2;
          const dist = 20 + Math.random() * 20;
          const nx = player.position.x + Math.cos(angle) * dist;
          const nz = player.position.z + Math.sin(angle) * dist;
          player.position.set(nx, 25, nz);
          setToast('🌀 Nether Portal — Teleported to a new location!');
          setTimeout(() => setToast(null), 3000);
        }
      }

      // ---- Sponge absorbs nearby water (removes lava blocks within 3-block radius) ----
      if (Math.floor(elapsed) !== Math.floor(elapsed - dt)) {
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        for (let dx = -5; dx <= 5; dx++) {
          for (let dy = -5; dy <= 5; dy++) {
            for (let dz = -5; dz <= 5; dz++) {
              if (world.getType(px + dx, py + dy, pz + dz) === 'sponge') {
                // Remove lava within 3 blocks of sponge
                const sx = px + dx, sy = py + dy, sz = pz + dz;
                for (let sdx = -3; sdx <= 3; sdx++) {
                  for (let sdy = -3; sdy <= 3; sdy++) {
                    for (let sdz = -3; sdz <= 3; sdz++) {
                      if (world.getType(sx + sdx, sy + sdy, sz + sdz) === 'lava') {
                        world.removeBlock(sx + sdx, sy + sdy, sz + sdz, true);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }

      // ---- Melon drops slices on break (already in BLOCK_DROPS) ----

      // ---- Beacon area buffs (check every ~2s) ----
      if (Math.floor(elapsed * 0.5) !== Math.floor((elapsed - dt) * 0.5)) {
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        let nearBeacon = false;
        // Scan 16-block radius for beacons
        for (let dx = -16; dx <= 16 && !nearBeacon; dx += 4) {
          for (let dz = -16; dz <= 16 && !nearBeacon; dz += 4) {
            for (let dy = -8; dy <= 8 && !nearBeacon; dy += 2) {
              if (world.getType(px + dx, py + dy, pz + dz) === 'beacon') {
                nearBeacon = true;
              }
            }
          }
        }
        if (nearBeacon) {
          const mult = TIER_BEACON_MULTIPLIER[balanceTier];
          beaconBuffsRef.current = { speed: 0.15 * mult, regen: 0.3 * mult, strength: 0.1 * mult };
          if (!beaconActive) setBeaconActive(true);
        } else {
          beaconBuffsRef.current = { speed: 0, regen: 0, strength: 0 };
          if (beaconActive) setBeaconActive(false);
        }
      }
      // Beacon beam particles: spawn glowing particles above nearby beacons
      if (beaconActive && Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) {
        const bpx = Math.floor(camera.position.x);
        const bpy = Math.floor(camera.position.y);
        const bpz = Math.floor(camera.position.z);
        for (let dx = -16; dx <= 16; dx += 4) {
          for (let dz = -16; dz <= 16; dz += 4) {
            for (let dy = -8; dy <= 8; dy += 2) {
              const bx = bpx + dx, by = bpy + dy, bz = bpz + dz;
              if (world.getType(bx, by, bz) === 'beacon') {
                const beamMat = new THREE.MeshStandardMaterial({
                  color: 0x88ccff, emissive: 0x4488ff, emissiveIntensity: 2,
                  transparent: true, opacity: 0.6,
                });
                const beamM = new THREE.Mesh(particleGeom, beamMat);
                beamM.position.set(bx + 0.5, by + 2 + Math.random() * 10, bz + 0.5);
                beamM.castShadow = false; beamM.receiveShadow = false;
                scene.add(beamM);
                particles.push({
                  mesh: beamM,
                  velocity: new THREE.Vector3(0, 3 + Math.random() * 2, 0),
                  age: 0, life: 1.5,
                });
              }
            }
          }
        }
      }

      // Apply beacon regen
      if (beaconBuffsRef.current.regen > 0) {
        healthFloat = Math.min(MAX_HEALTH, healthFloat + beaconBuffsRef.current.regen * dt);
        healthRef.current = Math.round(healthFloat);
        setHealth(Math.round(healthFloat));
      }

      // ---- Wallet daily rewards (every 5 min of play) ----
      if (walletAddress && elapsed > 30) {
        const timeSinceReward = (elapsed * 1000) - lastWalletRewardRef.current;
        if (timeSinceReward >= WALLET_REWARD_INTERVAL_MS) {
          lastWalletRewardRef.current = elapsed * 1000;
          // Random reward based on tier
          const rewardPool: Array<{ item: ItemType; count: number; label: string }> = [
            { item: 'iron_ingot', count: 2, label: '🔩 2 Iron' },
            { item: 'coal', count: 4, label: '⚫ 4 Coal' },
            { item: 'arrow', count: 8, label: '🏹 8 Arrows' },
            { item: 'bread', count: 3, label: '🍞 3 Bread' },
          ];
          if (balanceTier === 'bronze' || balanceTier === 'silver' || balanceTier === 'gold' || balanceTier === 'diamond') {
            rewardPool.push({ item: 'diamond', count: 1, label: '💎 Diamond' });
            rewardPool.push({ item: 'golden_apple', count: 1, label: '🍎 Golden Apple' });
          }
          if (balanceTier === 'gold' || balanceTier === 'diamond') {
            rewardPool.push({ item: 'emerald', count: 3, label: '💚 3 Emeralds' });
            rewardPool.push({ item: 'ender_pearl', count: 1, label: '🌀 Ender Pearl' });
          }
          const reward = rewardPool[Math.floor(Math.random() * rewardPool.length)];
          let rInv = inventoryRef.current;
          rInv = addItem(rInv, reward.item, reward.count);
          inventoryRef.current = rInv;
          setInventory(rInv);
          setToast(`⛓ Wallet Reward: ${reward.label}!`);
          setTimeout(() => setToast(null), 3000);
        }
      }

      // ---- Diamond tier perk: auto-repair tools (1 durability per 10s) ----
      if (balanceTier === 'diamond' && Math.floor(elapsed / 10) !== Math.floor((elapsed - dt) / 10)) {
        const inv = inventoryRef.current;
        let repaired = false;
        const newInv = inv.map(slot => {
          if (!slot) return slot;
          const def = ITEMS[slot.item];
          if (def.isTool && def.durability && slot.durability !== undefined && slot.durability < def.durability) {
            repaired = true;
            return { ...slot, durability: Math.min(def.durability, slot.durability + 1) };
          }
          return slot;
        });
        if (repaired) {
          inventoryRef.current = newInv;
          setInventory(newInv);
        }
      }

      // ---- Gold tier perk: slow hunger drain reduction ----
      // Gold+ tiers get 20% slower hunger drain (applied via multiplier in hunger calc)

      // ---- Potion effect timer + apply effects ----
      if (potionTypeRef.current) {
        potionTimerRef.current -= dt;
        if (potionTimerRef.current <= 0) {
          potionTypeRef.current = null;
          potionTimerRef.current = 0;
          setActivePotion(null);
          // Reset player modifiers
          player.speedMultiplier = 1.0;
          player.jumpMultiplier = 1.0;
        } else {
          // Apply continuous potion effects
          switch (potionTypeRef.current) {
            case 'potion_speed':
              player.speedMultiplier = 1.5 + beaconBuffsRef.current.speed;
              break;
            case 'potion_jump':
              player.jumpMultiplier = 1.6;
              player.speedMultiplier = 1.0 + beaconBuffsRef.current.speed;
              break;
            default:
              player.speedMultiplier = 1.0 + beaconBuffsRef.current.speed;
              player.jumpMultiplier = 1.0;
              break;
          }
        }
      } else {
        player.speedMultiplier = 1.0 + beaconBuffsRef.current.speed;
        player.jumpMultiplier = 1.0;
      }

      // Apply tier-based bonuses
      player.miningSpeedMultiplier = TIER_MINING_SPEED[balanceTier];
      player.speedMultiplier *= TIER_SPEED_BONUS[balanceTier];

      // Hunger-based speed penalty: very hungry = slow movement
      if (hungerFloat <= 2) {
        player.speedMultiplier *= 0.6; // 40% slower when starving
      } else if (hungerFloat <= 4) {
        player.speedMultiplier *= 0.8; // 20% slower when very hungry
      }

      // Freezing speed penalty
      if (freezingRef.current > 0.3) {
        player.speedMultiplier *= Math.max(0.5, 1 - freezingRef.current * 0.5);
      }

      // ---- FOV: spyglass zoom / sprint widen ----
      const isSprinting = Math.abs(player.velocity.x) + Math.abs(player.velocity.z) > 5;
      const targetFov = spyglassRef.current ? 15 : isSprinting ? 85 : 75;
      if (Math.abs(camera.fov - targetFov) > 0.5) {
        camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 6);
        camera.updateProjectionMatrix();
      }

      // ---- Falling blocks (sand, gravel) ----
      if (Math.floor(elapsed * 4) !== Math.floor((elapsed - dt) * 4)) {
        // Check every ~0.25s for performance
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        for (let dx = -8; dx <= 8; dx++) {
          for (let dz = -8; dz <= 8; dz++) {
            for (let dy = 1; dy <= 24; dy++) {
              const bx = px + dx, bz = pz + dz;
              const bt = world.getType(bx, dy, bz);
              if ((bt === 'sand_blue' || bt === 'gravel') && !world.has(bx, dy - 1, bz)) {
                world.removeBlock(bx, dy, bz, true);
                // Find where it lands
                let landY = dy - 1;
                while (landY > 0 && !world.has(bx, landY - 1, bz)) landY--;
                world.addBlock(bx, landY, bz, bt, true);
                socket.emit('block:break', { x: bx, y: dy, z: bz });
                socket.emit('block:place', { x: bx, y: landY, z: bz, type: bt });
              }
            }
          }
        }
      }

      // ---- Fishing cooldown ----
      if (fishingCooldownRef.current > 0) fishingCooldownRef.current -= dt;

      // ---- Wheat growth: every ~30s (faster in rain), check nearby farmland for wheat ----
      const wheatGrowInterval = weatherRef.current === 'rain' || weatherRef.current === 'thunder' ? 15 : 30;
      if (Math.floor(elapsed / wheatGrowInterval) !== Math.floor((elapsed - dt) / wheatGrowInterval)) {
        const px = Math.floor(camera.position.x);
        const pz = Math.floor(camera.position.z);
        for (let dx = -12; dx <= 12; dx++) {
          for (let dz = -12; dz <= 12; dz++) {
            for (let dy = 0; dy <= 20; dy++) {
              const bx = px + dx, bz = pz + dz;
              const bt = world.getType(bx, dy, bz);
              // Farmland without wheat on top → grow seeds (higher chance in rain)
              const growChance = weatherRef.current !== 'clear' ? 0.2 : 0.1;
              if (bt === 'farmland' && !world.has(bx, dy + 1, bz) && Math.random() < growChance) {
                world.addBlock(bx, dy + 1, bz, 'wheat', true);
                socket.emit('block:place', { x: bx, y: dy + 1, z: bz, type: 'wheat' });
              }
            }
          }
        }
      }

      // ---- Sugar cane growth: grows upward every ~45s (up to 3 blocks tall) ----
      if (Math.floor(elapsed / 45) !== Math.floor((elapsed - dt) / 45)) {
        const px = Math.floor(camera.position.x);
        const pz = Math.floor(camera.position.z);
        for (let dx = -10; dx <= 10; dx++) {
          for (let dz = -10; dz <= 10; dz++) {
            for (let dy = 1; dy <= 30; dy++) {
              const bx = px + dx, bz = pz + dz;
              if (world.getType(bx, dy, bz) === 'sugar_cane') {
                // Check if can grow upward (max 3 tall)
                let height = 1;
                for (let ch = 1; ch <= 2; ch++) {
                  if (world.getType(bx, dy - ch, bz) === 'sugar_cane') height++;
                  else break;
                }
                if (height < 3 && !world.has(bx, dy + 1, bz) && Math.random() < 0.3) {
                  world.addBlock(bx, dy + 1, bz, 'sugar_cane', true);
                  socket.emit('block:place', { x: bx, y: dy + 1, z: bz, type: 'sugar_cane' });
                }
              }
            }
          }
        }
      }

      // ---- Cactus growth: grows upward every ~60s (up to 3 blocks tall) ----
      if (Math.floor(elapsed / 60) !== Math.floor((elapsed - dt) / 60)) {
        const px = Math.floor(camera.position.x);
        const pz = Math.floor(camera.position.z);
        for (let dx = -10; dx <= 10; dx++) {
          for (let dz = -10; dz <= 10; dz++) {
            for (let dy = 1; dy <= 30; dy++) {
              const bx = px + dx, bz = pz + dz;
              if (world.getType(bx, dy, bz) === 'cactus') {
                let height = 1;
                for (let ch = 1; ch <= 2; ch++) {
                  if (world.getType(bx, dy - ch, bz) === 'cactus') height++;
                  else break;
                }
                if (height < 3 && !world.has(bx, dy + 1, bz) && Math.random() < 0.2) {
                  world.addBlock(bx, dy + 1, bz, 'cactus', true);
                  socket.emit('block:place', { x: bx, y: dy + 1, z: bz, type: 'cactus' });
                }
              }
            }
          }
        }
      }

      // ---- Weather cycle: change every ~2 minutes ----
      if (Math.floor(elapsed / 120) !== Math.floor((elapsed - dt) / 120)) {
        const roll = Math.random();
        let wNew: 'clear' | 'rain' | 'thunder' = 'clear';
        if (roll >= 0.5 && roll < 0.8) wNew = 'rain';
        else if (roll >= 0.8) wNew = 'thunder';
        weatherRef.current = wNew;
        setWeatherType(wNew);
        // Announce thunderstorm bonus for wallet holders
        if (wNew === 'thunder' && walletAddress) {
          appendChat({ username: 'system', message: '⛈️ Thunderstorm! Wallet holders get 2x XP during storms!', isSystem: true });
        }
      }
      // ---- Lightning strikes during thunderstorm ----
      if (weatherRef.current === 'thunder' && Math.random() < dt * 0.08) {
        // Random lightning strike near player
        const lx = camera.position.x + (Math.random() - 0.5) * 60;
        const lz = camera.position.z + (Math.random() - 0.5) * 60;
        // Flash effect — brief white overlay
        cameraShakeTimer = 0.15;
        cameraShakeIntensity = 0.05;
        // Lightning bolt visual (temporary bright line)
        const lGeom = new THREE.BoxGeometry(0.15, 30, 0.15);
        const lMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
        const bolt = new THREE.Mesh(lGeom, lMat);
        bolt.position.set(lx, 25, lz);
        bolt.castShadow = false;
        scene.add(bolt);
        // Remove after 0.2 seconds
        setTimeout(() => {
          scene.remove(bolt);
          lMat.dispose();
          lGeom.dispose();
        }, 200);
        audio.playThunder();
      }

      // ---- Compass check: if player has compass in inventory ----
      if (Math.floor(elapsed * 2) !== Math.floor((elapsed - dt) * 2)) {
        const inv = inventoryRef.current;
        const has = inv.some(s => s && s.item === 'compass');
        setHasCompass(has);
      }

      // ---- Ambient sounds ----
      // Cave drips when underground (random, ~every 3-8 seconds)
      if (camera.position.y < 15 && Math.random() < dt * 0.2) {
        audio.playCaveDrip();
      }
      // Bird chirps during daytime in forests/plains (random, ~every 5-10 seconds)
      if (!isNight && camera.position.y > 20 && Math.random() < dt * 0.08) {
        const surfType = world.getType(Math.floor(camera.position.x), Math.floor(camera.position.y) - 2, Math.floor(camera.position.z));
        if (surfType === 'base_blue' || surfType === 'leaves' || surfType === 'birch_leaves' || surfType === 'dark_oak_leaves') {
          audio.playBirdChirp();
        }
      }
      // Wind gusts on mountain peaks (y > 45, random ~every 15s)
      if (camera.position.y > 45 && Math.random() < dt * 0.04) {
        audio.playWindGust();
      }

      // ---- Campfire cooking: if player near campfire, auto-cook raw food ----
      if (Math.floor(elapsed / CAMPFIRE_COOK_INTERVAL) !== Math.floor((elapsed - dt) / CAMPFIRE_COOK_INTERVAL)) {
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        let nearCampfire = false;
        for (let ddx = -3; ddx <= 3 && !nearCampfire; ddx++) {
          for (let ddy = -2; ddy <= 2 && !nearCampfire; ddy++) {
            for (let ddz = -3; ddz <= 3 && !nearCampfire; ddz++) {
              if (world.getType(px + ddx, py + ddy, pz + ddz) === 'campfire') nearCampfire = true;
            }
          }
        }
        if (nearCampfire) {
          const inv = inventoryRef.current;
          const cookMap: Record<string, ItemType> = {
            'beef': 'cooked_beef',
            'porkchop': 'cooked_porkchop',
            'chicken_meat': 'cooked_chicken',
            'raw_fish': 'cooked_fish',
          };
          for (const [raw, cooked] of Object.entries(cookMap)) {
            const rawIdx = inv.findIndex(s => s && s.item === raw);
            if (rawIdx !== -1) {
              let next = removeFromSlot(inv, rawIdx, 1);
              next = addItem(next, cooked, 1);
              inventoryRef.current = next;
              setInventory(next);
              setToast(`🔥 Campfire cooked ${ITEMS[cooked].label}!`);
              setTimeout(() => setToast(null), 2000);
              break; // cook one at a time
            }
          }
        }
      }

      // ---- Breath sync for HUD ----
      const curBreath = Math.round(player.breathTimer);
      if (curBreath !== breathRef.current) {
        breathRef.current = curBreath;
        setBreath(curBreath);
      }

      // ---- Drowning panic bubbles when low breath ----
      if (curBreath <= 3 && curBreath > 0 && Math.random() < dt * 3) {
        const bubbleCount = 4 - curBreath; // more bubbles as breath decreases
        for (let bi = 0; bi < bubbleCount; bi++) {
          const bubMat = new THREE.MeshBasicMaterial({
            color: 0x88ccff, transparent: true, opacity: 0.5,
          });
          const bm = new THREE.Mesh(particleGeom, bubMat);
          bm.position.set(
            camera.position.x + (Math.random() - 0.5) * 0.5,
            camera.position.y + (Math.random() - 0.5) * 0.3,
            camera.position.z + (Math.random() - 0.5) * 0.5,
          );
          bm.castShadow = false;
          scene.add(bm);
          particles.push({
            mesh: bm,
            velocity: new THREE.Vector3(
              (Math.random() - 0.5) * 0.5,
              1.5 + Math.random(),
              (Math.random() - 0.5) * 0.5,
            ),
            age: 0,
            life: 0.8 + Math.random() * 0.4,
          });
        }
      }

      // ---- Hunger drain ----
      const hVel = Math.abs(player.velocity.x) + Math.abs(player.velocity.z);
      const sprinting = hVel > 5;
      const walking = hVel > 0.5;
      const baseDrain = sprinting ? HUNGER_DRAIN_SPRINT : walking ? HUNGER_DRAIN_WALK : HUNGER_DRAIN_IDLE;
      // Gold+ tier: 25% slower hunger drain
      const hungerTierMult = (balanceTier === 'gold' || balanceTier === 'diamond') ? 0.75 : balanceTier === 'silver' ? 0.9 : 1.0;
      const drainRate = baseDrain * hungerTierMult;
      hungerFloat = Math.max(0, hungerFloat - drainRate * dt);
      // Sync hunger to player for sprint gating
      player.hungerLevel = hungerFloat;
      const hungerInt = Math.round(hungerFloat);
      if (hungerInt !== hungerRef.current) {
        hungerRef.current = hungerInt;
        setHunger(hungerInt);
      }

      // ---- Hunger warnings ----
      if (hungerInt === 4 && hungerRef.current !== 4) {
        setToast('⚠️ You are getting hungry! Find food.');
        setTimeout(() => setToast(null), 3000);
      }
      if (hungerInt === 1 && hungerRef.current !== 1) {
        setToast('🚨 STARVING! Eat something now!');
        setTimeout(() => setToast(null), 3000);
      }

      // ---- Sprint particles (dust at feet) ----
      if (sprinting && Math.abs(player.velocity.y) < 0.5 && Math.floor(elapsed * 8) !== Math.floor((elapsed - dt) * 8)) {
        const px = camera.position.x + (Math.random() - 0.5) * 0.4;
        const py = camera.position.y - 1.5;
        const pz = camera.position.z + (Math.random() - 0.5) * 0.4;
        // Check block type below for particle color
        const groundType = world.getType(Math.floor(px), Math.floor(py), Math.floor(pz));
        const dustColor = groundType === 'sand_blue' ? 0xe6d9a1 : groundType === 'ice_stone' ? 0xdfe6ea : groundType === 'snow_block' ? 0xf0f0ff : 0x8b5a2b;
        const dustMat = new THREE.MeshBasicMaterial({ color: dustColor, transparent: true, opacity: 0.5 });
        const dust = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), dustMat);
        dust.position.set(px, py + 0.1, pz);
        dust.castShadow = false;
        scene.add(dust);
        particles.push({
          mesh: dust,
          velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5),
          age: 0,
          life: 0.4 + Math.random() * 0.3,
        });
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
      // Sync UP on respawn: if handleRespawn set healthRef higher than healthFloat,
      // (e.g. healthFloat=0 from death, healthRef=20 from respawn click), match it.
      if (healthRef.current > healthFloat && healthRef.current >= MAX_HEALTH - 0.5) {
        healthFloat = healthRef.current;
        hungerFloat = hungerRef.current; // also sync hunger in case respawn restored it
      }
      const healthInt = Math.round(healthFloat);
      if (healthInt !== healthRef.current) {
        healthRef.current = healthInt;
        setHealth(healthInt);
      }

      // Death → show death screen (only once per death, guarded by justDied flag)
      if (healthFloat <= 0 && !justDied) {
        justDied = true; // prevent re-firing every frame until respawn
        statsRef.current.deaths++;
        statsRef.current.currentLifeSeconds = 0; // reset life timer
        // Set death cause from last damage source
        if (lastDamageSource !== 'Died') {
          setDeathCause(lastDamageSource);
        }
        // Check for starvation death
        if (hungerFloat <= 0) setDeathCause('Starved to death');
        setIsDead(true);
        player.inventoryOpen = true; // freeze movement
        // Death explosion particles
        for (let dp = 0; dp < 15; dp++) {
          const mat = new THREE.MeshStandardMaterial({
            color: 0xff2222, emissive: 0xff0000, emissiveIntensity: 0.3,
            transparent: true, opacity: 0.9,
          });
          const m = new THREE.Mesh(particleGeom, mat);
          m.position.set(
            camera.position.x + (Math.random() - 0.5) * 0.5,
            camera.position.y + (Math.random() - 0.5) * 0.5,
            camera.position.z + (Math.random() - 0.5) * 0.5,
          );
          m.castShadow = false;
          scene.add(m);
          particles.push({
            mesh: m,
            velocity: new THREE.Vector3(
              (Math.random() - 0.5) * 4,
              Math.random() * 4,
              (Math.random() - 0.5) * 4,
            ),
            age: 0,
            life: 0.6 + Math.random() * 0.4,
          });
        }
        audio.playMobHurt();
        lastDamageSource = 'Died'; // reset for next death
      }
      // Clear justDied flag once player has been revived (health > 0)
      if (healthFloat > 0 && justDied) {
        justDied = false;
      }

      // Track play time & exploration stats
      statsRef.current.playTimeSeconds += dt;
      statsRef.current.currentLifeSeconds += dt;
      if (statsRef.current.currentLifeSeconds > statsRef.current.longestLifeSeconds) {
        statsRef.current.longestLifeSeconds = statsRef.current.currentLifeSeconds;
      }
      // Track distance walked (approximate from position change)
      const py = camera.position.y;
      if (py > statsRef.current.highestY) statsRef.current.highestY = py;
      if (py < statsRef.current.lowestY) statsRef.current.lowestY = py;
      // Distance tracking
      const dx = camera.position.x - lastPosX;
      const dz = camera.position.z - lastPosZ;
      const distMoved = Math.sqrt(dx * dx + dz * dz);
      if (distMoved < 10) { // Ignore teleports
        statsRef.current.distanceWalked += distMoved;
      }
      lastPosX = camera.position.x;
      lastPosZ = camera.position.z;
      // Wallet & tier tracking
      statsRef.current.walletConnected = !!walletAddress;
      statsRef.current.currentTier = balanceTier;
      statsRef.current.currentLevel = xpInfo.level;

      // Hurt flash timer → damage overlay
      if (hurtFlashTimer > 0) {
        hurtFlashTimer -= dt;
        const flashAlpha = Math.min(1, hurtFlashTimer / 0.15);
        if (Math.abs(flashAlpha - damageFlashRef.current) > 0.05) {
          damageFlashRef.current = flashAlpha;
          setDamageFlash(flashAlpha);
        }
      } else if (damageFlashRef.current > 0) {
        damageFlashRef.current = 0;
        setDamageFlash(0);
      }

      // Underwater detection: check if camera is inside a water block
      const camPos = camera.position;
      const headBlock = world.getType(Math.floor(camPos.x), Math.floor(camPos.y), Math.floor(camPos.z));
      const nowUnderwater = headBlock === 'water';
      if (nowUnderwater !== (isUnderwater)) {
        setIsUnderwater(nowUnderwater);
        // Water splash particles when entering water
        if (nowUnderwater && Math.abs(player.velocity.y) > 1) {
          const splashCount = 6 + Math.floor(Math.abs(player.velocity.y) * 2);
          for (let i = 0; i < splashCount; i++) {
            const mat = new THREE.MeshStandardMaterial({ color: 0x3399ff, transparent: true, opacity: 0.7 });
            const m = new THREE.Mesh(particleGeom, mat);
            m.position.set(
              camPos.x + (Math.random() - 0.5) * 1.5,
              camPos.y + 0.5,
              camPos.z + (Math.random() - 0.5) * 1.5
            );
            m.castShadow = false;
            scene.add(m);
            particles.push({
              mesh: m,
              velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 3,
                2 + Math.random() * 3,
                (Math.random() - 0.5) * 3
              ),
              age: 0,
              life: 0.4 + Math.random() * 0.3,
            });
          }
          audio.playSplash();
        }
      }
      // Underwater fog: drastically reduce visibility
      if (nowUnderwater && scene.fog instanceof THREE.Fog) {
        scene.fog.near = 2;
        scene.fog.far = 20;
        scene.fog.color.set(0x1a3a6a);
      } else if (!nowUnderwater && scene.fog instanceof THREE.Fog && scene.fog.far < 30) {
        scene.fog.near = 20;
        scene.fog.far = 90;
      }

      // Deep underground fog: darker and closer as player goes deeper
      if (!nowUnderwater && camPos.y < 8 && scene.fog instanceof THREE.Fog) {
        const depthFactor = Math.max(0, 1 - camPos.y / 8); // 0 at y=8, 1 at y=0
        scene.fog.near = Math.max(3, 20 - depthFactor * 15);
        scene.fog.far = Math.max(15, 90 - depthFactor * 60);
        scene.fog.color.lerp(new THREE.Color(0x111111), depthFactor * 0.6);
      }

      // Biome detection: infer biome from surface block type
      {
        const bx = Math.floor(camPos.x), bz = Math.floor(camPos.z);
        // Scan downward from player to find surface
        let surfaceType: string | null = null;
        for (let by = Math.floor(camPos.y); by >= 0; by--) {
          const t = world.getType(bx, by, bz);
          if (t && t !== 'water' && t !== 'sugar_cane' && t !== 'vine' && t !== 'lily_pad') {
            surfaceType = t;
            break;
          }
        }
        let biome = 'Plains';
        if (surfaceType === 'sand_blue') biome = 'Desert';
        else if (surfaceType === 'ice_stone' || surfaceType === 'packed_ice' || surfaceType === 'snow_block') biome = 'Snowy Tundra';
        else if (surfaceType === 'mud' || surfaceType === 'clay') biome = 'Swamp';
        else if (surfaceType === 'royal_brick' || surfaceType === 'deepslate') biome = 'Mountains';
        else if (surfaceType === 'moss_block') biome = 'Lush Forest';
        else if (surfaceType === 'cobblestone' || surfaceType === 'planks' || surfaceType === 'base_block') biome = 'City';
        if (biome !== currentBiomeRef.current) {
          currentBiomeRef.current = biome;
          setCurrentBiome(biome);
        }
      }

      // ---- Freezing in snowy biomes ----
      if (currentBiomeRef.current === 'Snowy Tundra') {
        // Gradually freeze if in snowy biome without fire resistance
        if (potionTypeRef.current !== 'potion_fire_resist') {
          freezingRef.current = Math.min(1, freezingRef.current + dt * 0.02);
        } else {
          freezingRef.current = Math.max(0, freezingRef.current - dt * 0.1);
        }
        // Apply cold damage at high freeze (every 3 seconds at full frost)
        if (freezingRef.current > 0.8 && Math.random() < dt * 0.33) {
          const coldDmg = applyArmorReduction(1, armorRef.current);
          healthFloat = Math.max(0, healthFloat - coldDmg);
          setToast('🥶 Freezing! Find warmth or use fire resistance');
        }
      } else {
        // Thaw quickly when not in snowy biome
        freezingRef.current = Math.max(0, freezingRef.current - dt * 0.15);
      }
      // Near campfire/torch/furnace → thaw faster
      if (freezingRef.current > 0) {
        const px = Math.floor(camera.position.x);
        const pyy = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        for (let ddx = -2; ddx <= 2; ddx++) {
          for (let ddy = -1; ddy <= 1; ddy++) {
            for (let ddz = -2; ddz <= 2; ddz++) {
              const wt = world.getType(px + ddx, pyy + ddy, pz + ddz);
              if (wt === 'torch' || wt === 'campfire' || wt === 'furnace') {
                freezingRef.current = Math.max(0, freezingRef.current - dt * 0.5);
              }
            }
          }
        }
      }
      // Update frost overlay state (throttled)
      const frzRounded = Math.round(freezingRef.current * 20) / 20;
      if (Math.abs(frzRounded - freezing) > 0.04) {
        setFreezing(frzRounded);
      }

      // ---- Low health heartbeat ----
      if (healthFloat > 0 && healthFloat <= 4) {
        const hbInterval = healthFloat <= 2 ? 0.6 : 1.0;
        if (elapsed - lastHeartbeatRef.current > hbInterval) {
          lastHeartbeatRef.current = elapsed;
          audio.playHeartbeat();
        }
      }

      // ---- Day/night visuals ----
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

      // BASECRAFT sky logo follows camera (always visible in sky)
      logoSprite.position.set(camera.position.x, camera.position.y + 120, camera.position.z - 180);
      subSprite.position.set(camera.position.x, camera.position.y + 95, camera.position.z - 180);
      // Fade logo at night (less visible)
      const nightFade = Math.max(0.3, dayMix);
      logoMat.opacity = 0.85 * nightFade;
      subMat.opacity = 0.7 * nightFade;
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
      // Night vision potion: brighten everything at night
      if (potionTypeRef.current === 'potion_night_vision' && dayMix < 0.5) {
        sunLight.intensity = Math.max(sunLight.intensity, 0.8);
        hemi.intensity = Math.max(hemi.intensity, 0.6);
        scene.fog = null;
      } else if (scene.fog === null && renderer.toneMappingExposure > 0) {
        // Restore fog when night vision ends (fog re-created each frame anyway)
      }
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

      // ---- Weather particles ----
      {
        const wt = weatherRef.current;
        if (wt !== currentWeather) currentWeather = wt;
        const isSnowy = currentBiomeRef.current === 'Snowy Tundra';
        // Show rain or snow based on biome
        rainMesh.visible = wt !== 'clear' && !isSnowy;
        snowMesh.visible = wt !== 'clear' && isSnowy;
        if (wt !== 'clear') {
          if (isSnowy) {
            // Snow falls slowly with gentle drift
            const spos = snowGeom.attributes.position as THREE.BufferAttribute;
            for (let i = 0; i < snowCount; i++) {
              spos.array[i * 3 + 0] += Math.sin(elapsed + i) * dt * 0.5; // horizontal drift
              spos.array[i * 3 + 1] -= dt * 3; // slow fall
              spos.array[i * 3 + 2] += Math.cos(elapsed + i * 1.3) * dt * 0.3;
              if (spos.array[i * 3 + 1] < 0) {
                spos.array[i * 3 + 0] = camera.position.x + (Math.random() - 0.5) * 60;
                spos.array[i * 3 + 1] = camera.position.y + 15 + Math.random() * 15;
                spos.array[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 60;
              }
            }
            spos.needsUpdate = true;
          } else {
            // Rain falls fast
            const pos = rainGeom.attributes.position as THREE.BufferAttribute;
            for (let i = 0; i < rainCount; i++) {
              pos.array[i * 3 + 1] -= dt * 18;
              if (pos.array[i * 3 + 1] < 0) {
                pos.array[i * 3 + 0] = camera.position.x + (Math.random() - 0.5) * 80;
                pos.array[i * 3 + 1] = camera.position.y + 20 + Math.random() * 20;
                pos.array[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 80;
              }
            }
            pos.needsUpdate = true;
          }

          // Rain/storm ambient sound
          rainSoundTimer -= dt;
          if (rainSoundTimer <= 0) {
            audio.playCaveDrip(); // reuse drip for rain ambiance
            rainSoundTimer = isSnowy ? 1.5 : 0.3 + Math.random() * 0.4;
          }

          // Thunder: random lightning flash + bolt visual
          if (wt === 'thunder') {
            if (lightningFlashTimer <= 0 && Math.random() < 0.002) {
              lightningFlashTimer = 0.15;
              // Generate lightning bolt visual
              const lx = camera.position.x + (Math.random() - 0.5) * 40;
              const lz = camera.position.z + (Math.random() - 0.5) * 40;
              const boltPts: number[] = [];
              let bx = lx, by = camera.position.y + 30, bz = lz;
              const segments = 6 + Math.floor(Math.random() * 4);
              for (let s = 0; s <= segments; s++) {
                boltPts.push(bx, by, bz);
                bx += (Math.random() - 0.5) * 3;
                by -= (30 / segments);
                bz += (Math.random() - 0.5) * 3;
              }
              boltGeom.setAttribute('position', new THREE.Float32BufferAttribute(boltPts, 3));
              boltLine.visible = true;
              boltTimer = 0.12;

              // Lightning damage at random nearby spot
              const ldist = Math.sqrt(
                (lx - camera.position.x) ** 2 + (lz - camera.position.z) ** 2
              );
              if (ldist < 5) {
                applyMobDamage(5, 'Struck by lightning');
              }
            }
          }
          // Bolt fade
          if (boltTimer > 0) {
            boltTimer -= dt;
            (boltMat as THREE.LineBasicMaterial).opacity = boltTimer / 0.12;
          } else {
            boltLine.visible = false;
          }
          if (lightningFlashTimer > 0) {
            lightningFlashTimer -= dt;
            ambient.intensity = 2.0; // flash
          } else {
            ambient.intensity = wt === 'rain' ? 0.2 : 0.15;
          }
        } else {
          ambient.intensity = 0.3;
          lightningFlashTimer = 0;
          snowMesh.visible = false;
          boltLine.visible = false;
        }
      }

      // ---- Torch/lantern holding light boost ----
      const lightSlot = inventoryRef.current[selectedRef.current];
      if (lightSlot) {
        const lightItem = lightSlot.item;
        if (lightItem === 'torch' || lightItem === 'lantern' || lightItem === 'jack_o_lantern' || lightItem === 'glowstone' || lightItem === 'sea_lantern') {
          // Boost ambient light when holding a light source
          ambient.intensity = Math.max(ambient.intensity, 0.6);
          // Point light follows player
          holdLight.position.set(player.position.x, player.position.y + 1.5, player.position.z);
          holdLight.visible = true;
          holdLight.color.setHex(
            lightItem === 'sea_lantern' ? 0x66ccff : lightItem === 'lantern' ? 0xffcc66 : 0xffaa44
          );
        } else {
          holdLight.visible = false;
        }
      } else {
        holdLight.visible = false;
      }

      // ---- Hand ----
      const heldSlot = inventoryRef.current[selectedRef.current];
      if (heldSlot) {
        const heldDef = ITEMS[heldSlot.item];
        const heldColor = BLOCKS[heldSlot.item as BlockType]?.color ?? parseInt(heldDef.color.replace('#', ''), 16);
        handMat.color.setHex(heldColor);
        hand.visible = true;
        if (heldDef.isTool) {
          hand.scale.set(0.2, 0.8, 0.2);
        } else {
          hand.scale.set(1, 1, 1);
        }
        // Enchanted item glow
        if (enchantedItemsRef.current.has(selectedRef.current)) {
          handMat.emissive.setHex(0x6622aa);
          handMat.emissiveIntensity = 0.3 + Math.sin(elapsed * 4) * 0.15;
        } else {
          handMat.emissive.setHex(0x000000);
          handMat.emissiveIntensity = 0;
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

      // ---- Tier cosmetic particles (Gold/Diamond holders) ----
      {
        const cosmetics = TIER_COSMETICS[balanceTier];
        if (cosmetics.hasParticles && Math.random() < dt * 3) {
          const pColor = cosmetics.particleColor;
          const mat = new THREE.MeshStandardMaterial({
            color: pColor, emissive: pColor, emissiveIntensity: 0.5,
            transparent: true, opacity: 0.8,
          });
          const m = new THREE.Mesh(particleGeom, mat);
          m.position.set(
            player.position.x + (Math.random() - 0.5) * 1.5,
            player.position.y + Math.random() * 2,
            player.position.z + (Math.random() - 0.5) * 1.5,
          );
          m.castShadow = false;
          scene.add(m);
          particles.push({
            mesh: m,
            velocity: new THREE.Vector3(
              (Math.random() - 0.5) * 0.3,
              0.5 + Math.random() * 0.5,
              (Math.random() - 0.5) * 0.3,
            ),
            age: 0,
            life: 0.8 + Math.random() * 0.5,
          });
        }
      }

      // ---- Dynamic torch lighting ----
      if (elapsed - lastTorchLightUpdate > 0.5) {
        lastTorchLightUpdate = elapsed;
        const nearTorches: { x: number; y: number; z: number; dist: number }[] = [];
        const plx = Math.floor(camera.position.x);
        const ply = Math.floor(camera.position.y);
        const plz = Math.floor(camera.position.z);
        for (let ddx = -6; ddx <= 6; ddx++) {
          for (let ddz = -6; ddz <= 6; ddz++) {
            for (let ddy = -3; ddy <= 6; ddy++) {
              const tx = plx + ddx, ty = ply + ddy, tz = plz + ddz;
              const bt = world.getType(tx, ty, tz);
              if (bt === 'torch' || bt === 'lantern' || bt === 'jack_o_lantern' || bt === 'campfire' || bt === 'glowstone' || bt === 'sea_lantern' || bt === 'redstone_lamp') {
                const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);
                nearTorches.push({ x: tx, y: ty, z: tz, dist });
              }
            }
          }
        }
        nearTorches.sort((a, b) => a.dist - b.dist);
        for (let i = 0; i < MAX_TORCH_LIGHTS; i++) {
          if (i < nearTorches.length) {
            const t = nearTorches[i];
            torchLights[i].position.set(t.x + 0.5, t.y + 0.8, t.z + 0.5);
            torchLights[i].intensity = 0.6;
          } else {
            torchLights[i].intensity = 0;
          }
        }
      }
      // Torch light flicker
      for (const tl of torchLights) {
        if (tl.intensity > 0) {
          tl.intensity = 0.5 + Math.sin(elapsed * 8 + tl.position.x * 3) * 0.15 + Math.random() * 0.05;
        }
      }

      // ---- Torch smoke particles ----
      if (elapsed - lastTorchParticleSpawn > 0.3) {
        lastTorchParticleSpawn = elapsed;
        const px = Math.floor(camera.position.x);
        const py = Math.floor(camera.position.y);
        const pz = Math.floor(camera.position.z);
        for (let dx = -6; dx <= 6; dx++) {
          for (let dz = -6; dz <= 6; dz++) {
            for (let dy = -3; dy <= 6; dy++) {
              const tx = px + dx, ty = py + dy, tz = pz + dz;
              // Campfire smoke particles
              if (world.getType(tx, ty, tz) === 'campfire' && torchParticles.length < 50 && Math.random() < 0.4) {
                const smokeMat = new THREE.MeshStandardMaterial({
                  color: 0x888888, transparent: true, opacity: 0.3,
                });
                const smokeMesh = new THREE.Mesh(torchParticleGeom, smokeMat);
                smokeMesh.position.set(tx + 0.5 + (Math.random() - 0.5) * 0.3, ty + 1.0, tz + 0.5 + (Math.random() - 0.5) * 0.3);
                smokeMesh.castShadow = false;
                scene.add(smokeMesh);
                torchParticles.push({ mesh: smokeMesh, age: 0, life: 2.0 + Math.random(), baseY: ty + 1.0 });
              }
              // Nether portal swirl particles
              if (world.getType(tx, ty, tz) === 'nether_portal' && torchParticles.length < 50 && Math.random() < 0.4) {
                const portalMat = new THREE.MeshStandardMaterial({
                  color: Math.random() > 0.5 ? 0x8844cc : 0xaa22ff,
                  emissive: 0x6622aa, emissiveIntensity: 1.0,
                  transparent: true, opacity: 0.7,
                });
                const portalMesh = new THREE.Mesh(torchParticleGeom, portalMat);
                portalMesh.position.set(
                  tx + 0.5 + (Math.random() - 0.5) * 0.8,
                  ty + Math.random(),
                  tz + 0.5 + (Math.random() - 0.5) * 0.8,
                );
                portalMesh.castShadow = false;
                scene.add(portalMesh);
                torchParticles.push({ mesh: portalMesh, age: 0, life: 1.2 + Math.random() * 0.8, baseY: ty + 0.5 });
              }
              // Enchanting table rune particles (magical purple sparkles orbiting)
              if (world.getType(tx, ty, tz) === 'enchanting_table' && torchParticles.length < 50 && Math.random() < 0.5) {
                const runeColors = [0xaa44ff, 0x8822dd, 0xcc66ff, 0x6611bb];
                const runeMat = new THREE.MeshStandardMaterial({
                  color: runeColors[Math.floor(Math.random() * runeColors.length)],
                  emissive: 0xaa44ff, emissiveIntensity: 0.8,
                  transparent: true, opacity: 0.8,
                });
                const runeMesh = new THREE.Mesh(torchParticleGeom, runeMat);
                const angle = Math.random() * Math.PI * 2;
                const radius = 0.8 + Math.random() * 0.5;
                runeMesh.position.set(
                  tx + 0.5 + Math.cos(angle) * radius,
                  ty + 0.8 + Math.random() * 0.5,
                  tz + 0.5 + Math.sin(angle) * radius,
                );
                runeMesh.castShadow = false;
                scene.add(runeMesh);
                torchParticles.push({ mesh: runeMesh, age: 0, life: 1.5 + Math.random(), baseY: ty + 1.0 });
              }
              if (world.getType(tx, ty, tz) === 'torch' && torchParticles.length < 40) {
                const tMat = new THREE.MeshStandardMaterial({
                  color: 0xffcc44, emissive: 0xff8800, emissiveIntensity: 0.6,
                  transparent: true, opacity: 0.7,
                });
                const tMesh = new THREE.Mesh(torchParticleGeom, tMat);
                tMesh.position.set(tx + 0.5 + (Math.random() - 0.5) * 0.2, ty + 0.8, tz + 0.5 + (Math.random() - 0.5) * 0.2);
                tMesh.castShadow = false;
                scene.add(tMesh);
                torchParticles.push({ mesh: tMesh, age: 0, life: 0.8 + Math.random() * 0.6, baseY: ty + 0.8 });
              }
            }
          }
        }
      }
      // Update torch particles
      for (let i = torchParticles.length - 1; i >= 0; i--) {
        const tp = torchParticles[i];
        tp.age += dt;
        if (tp.age >= tp.life) {
          scene.remove(tp.mesh);
          (tp.mesh.material as THREE.Material).dispose();
          torchParticles.splice(i, 1);
          continue;
        }
        tp.mesh.position.y += dt * 0.5; // float upward
        tp.mesh.position.x += (Math.random() - 0.5) * dt * 0.3;
        tp.mesh.position.z += (Math.random() - 0.5) * dt * 0.3;
        const tpMat = tp.mesh.material as THREE.MeshStandardMaterial;
        tpMat.opacity = 0.7 * (1 - tp.age / tp.life);
        tp.mesh.scale.setScalar(1 - tp.age / tp.life * 0.5);
      }

      // ---- XP orbs update ----
      for (let i = xpOrbs.length - 1; i >= 0; i--) {
        const orb = xpOrbs[i];
        orb.age += dt;
        if (orb.age >= orb.life) {
          scene.remove(orb.mesh);
          (orb.mesh.material as THREE.Material).dispose();
          xpOrbs.splice(i, 1);
          continue;
        }
        // Float toward player
        const toPlayer = new THREE.Vector3().subVectors(camera.position, orb.mesh.position);
        const dist = toPlayer.length();
        if (dist < 3 && orb.age > 0.3) {
          toPlayer.normalize().multiplyScalar(dt * 6);
          orb.mesh.position.add(toPlayer);
        } else {
          orb.velocity.y -= 6 * dt;
          orb.mesh.position.addScaledVector(orb.velocity, dt);
        }
        // Bob and pulse
        orb.mesh.position.y += Math.sin(orb.age * 8) * 0.01;
        const scale = 0.8 + Math.sin(orb.age * 6) * 0.2;
        orb.mesh.scale.setScalar(scale);
        const orbMat = orb.mesh.material as THREE.MeshStandardMaterial;
        orbMat.opacity = Math.max(0, 1 - (orb.age / orb.life) * 0.5);
      }

      // ---- Base coins update (rotate + check pickup) ----
      for (let i = baseCoins.length - 1; i >= 0; i--) {
        const coin = baseCoins[i];
        if (coin.collected) continue;
        coin.spinPhase += dt * 2;
        // Spin and bob
        coin.group.rotation.y = coin.spinPhase;
        coin.group.position.y = coin.baseY + Math.sin(coin.spinPhase * 1.5) * 0.15;
        // Check pickup (within 1.5 blocks)
        const dx = camera.position.x - coin.group.position.x;
        const dy = camera.position.y - coin.group.position.y;
        const dz = camera.position.z - coin.group.position.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 2.25) {
          // Collect!
          coin.collected = true;
          scene.remove(coin.group);
          // Reward: emeralds + XP + toast
          const rewardXp = 25;
          const newXp = totalXpRef.current + rewardXp;
          totalXpRef.current = newXp;
          setTotalXp(newXp);
          let inv = inventoryRef.current;
          inv = addItem(inv, 'emerald', 1);
          inventoryRef.current = inv;
          setInventory(inv);
          statsRef.current.emeraldsEarned += 1;
          statsRef.current.baseCoinsCollected = (statsRef.current.baseCoinsCollected ?? 0) + 1;
          setToast(`⬢ Base Coin Collected! (#${statsRef.current.baseCoinsCollected}) +${rewardXp} XP, +1 Emerald`);
          setTimeout(() => setToast(null), 2000);
          audio.playLevelUp();
          // Sparkle particles
          for (let sp = 0; sp < 10; sp++) {
            const sparkMat = new THREE.MeshBasicMaterial({
              color: 0x3478f6, transparent: true, opacity: 0.9,
            });
            const sm = new THREE.Mesh(particleGeom, sparkMat);
            sm.position.copy(coin.group.position);
            sm.castShadow = false;
            scene.add(sm);
            particles.push({
              mesh: sm,
              velocity: new THREE.Vector3(
                (Math.random() - 0.5) * 4,
                1 + Math.random() * 3,
                (Math.random() - 0.5) * 4,
              ),
              age: 0, life: 0.6 + Math.random() * 0.3,
            });
          }
        }
      }

      // ---- Arrow projectiles update ----
      for (let i = arrowProjectiles.length - 1; i >= 0; i--) {
        const arrow = arrowProjectiles[i];
        arrow.age += dt;
        // Gravity
        arrow.velocity.y -= 15 * dt;
        arrow.mesh.position.addScaledVector(arrow.velocity, dt);
        // Orient arrow along velocity
        const lookTarget = arrow.mesh.position.clone().add(arrow.velocity);
        arrow.mesh.lookAt(lookTarget);
        // Remove if too old or hit ground
        const ax = Math.floor(arrow.mesh.position.x);
        const ay = Math.floor(arrow.mesh.position.y);
        const az = Math.floor(arrow.mesh.position.z);
        const hitBlock = world.getType(ax, ay, az);
        if (arrow.age > 3 || arrow.mesh.position.y < 0 || hitBlock) {
          scene.remove(arrow.mesh);
          (arrow.mesh.material as THREE.Material).dispose();
          arrowProjectiles.splice(i, 1);
        }
      }

      // ---- Tier aura particles ----
      if (balanceTier !== 'none' && walletAddress) {
        // Spawn aura particles around player
        if (elapsed - lastAuraSpawn > 0.15) {
          lastAuraSpawn = elapsed;
          const color = TIER_AURA_COLORS[balanceTier] || 0x0052ff;
          const mat = new THREE.MeshStandardMaterial({
            color, emissive: color, emissiveIntensity: 0.6,
            transparent: true, opacity: 0.7,
          });
          const m = new THREE.Mesh(auraGeom, mat);
          const angle = Math.random() * Math.PI * 2;
          const radius = 0.4 + Math.random() * 0.3;
          const offsetVec = new THREE.Vector3(Math.cos(angle) * radius, -0.5 + Math.random() * 1.5, Math.sin(angle) * radius);
          m.position.copy(camera.position).add(offsetVec);
          m.position.y -= 1.2; // Below camera (at body level)
          m.castShadow = false;
          scene.add(m);
          auraParticles.push({ mesh: m, age: 0, life: 1.0 + Math.random() * 0.5, offset: offsetVec, speed: 0.5 + Math.random() * 0.5 });
        }
        // Update existing aura particles
        for (let i = auraParticles.length - 1; i >= 0; i--) {
          const ap = auraParticles[i];
          ap.age += dt;
          if (ap.age >= ap.life) {
            scene.remove(ap.mesh);
            (ap.mesh.material as THREE.Material).dispose();
            auraParticles.splice(i, 1);
            continue;
          }
          // Spiral upward
          ap.mesh.position.y += dt * ap.speed;
          const progress = ap.age / ap.life;
          const mat = ap.mesh.material as THREE.MeshStandardMaterial;
          mat.opacity = 0.7 * (1 - progress);
          ap.mesh.scale.setScalar(1 - progress * 0.5);
          ap.mesh.rotation.y += dt * 3;
        }
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

      // ---- Block selection outline update ----
      {
        const hit = world.raycast(camera, 5);
        if (hit && !inventoryOpenRef.current) {
          selectionLine.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
          selectionLine.visible = true;
        } else {
          selectionLine.visible = false;
        }
      }

      // Camera shake
      if (cameraShakeTimer > 0) {
        cameraShakeTimer -= dt;
        const shakeAmount = cameraShakeIntensity * (cameraShakeTimer / 0.5);
        camera.position.x += (Math.random() - 0.5) * shakeAmount;
        camera.position.y += (Math.random() - 0.5) * shakeAmount * 0.5;
        camera.position.z += (Math.random() - 0.5) * shakeAmount;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onReenableShadows = (e: KeyboardEvent) => {
      if (chatOpenRef.current || inventoryOpenRef.current) return;
      if (e.key.toLowerCase() === 'g' && shadowsDisabled) {
        shadowsDisabled = false;
        renderer.shadowMap.enabled = true;
      }
      // On-chain panel keybinds
      if (e.key.toLowerCase() === 'l') {
        socket.emit('leaderboard:get');
        setLeaderboardOpen(v => !v);
      }
      if (e.key.toLowerCase() === 'p' && !e.ctrlKey) {
        setProfileOpen(v => !v);
      }
      if (e.key.toLowerCase() === 'j') {
        setAchievementsOpen(v => !v);
      }
      if (e.key.toLowerCase() === 'n') {
        setLandClaimOpen(v => !v);
      }
      if (e.key.toLowerCase() === 'k') {
        setTierPerksOpen(v => !v);
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setControlsOpen(v => !v);
      }
      if (e.key.toLowerCase() === 'o') {
        setSettingsOpen(v => !v);
      }
      if (e.key.toLowerCase() === 'b') {
        setBountyBoardOpen(v => !v);
      }
      if (e.key.toLowerCase() === 'm') {
        setShowMinimap(v => !v);
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
      clearInterval(statsFlushInterval);
      clearInterval(achievementCheckInterval);
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
      socket.off('leaderboard:data', onLeaderboardData);
      socket.off('achievement:data', onAchievementData);
      socket.off('land:data', onLandData);
      socket.off('land:claimed', onLandClaimed);
      socket.off('land:unclaimed', onLandUnclaimed);
      socket.off('profile:open', onProfileOpen);
      socket.off('leaderboard:open', onLeaderboardOpen);
      socket.off('achievements:open', onAchievementsOpen);
      socket.off('land:do_claim', onLandDoClaim);
      socket.off('land:do_unclaim', onLandDoUnclaim);
      player.dispose();
      playerRef.current = null;
      worldRef.current = null;
      others.clear();
      cows.clear();
      pigs.clear();
      chickens.clear();
      zombies.clear();
      skeletons.clear();
      creepers.clear();
      spiders.clear();
      wolves.clear();
      endermen.clear();
      ironGolems.clear();
      slimes.clear();
      bats.clear();
      villagers.clear();
      witches.clear();
      flowers.clear();
      world.dispose();
      for (const p of particles) {
        scene.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
      }
      particles.length = 0;
      particleGeom.dispose();
      for (const tp of torchParticles) {
        scene.remove(tp.mesh);
        (tp.mesh.material as THREE.Material).dispose();
      }
      torchParticles.length = 0;
      torchParticleGeom.dispose();
      for (const orb of xpOrbs) {
        scene.remove(orb.mesh);
        (orb.mesh.material as THREE.Material).dispose();
      }
      xpOrbs.length = 0;
      xpOrbGeom.dispose();
      xpOrbMat.dispose();
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
      rainGeom.dispose();
      rainMat.dispose();
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

  const handleRespawn = () => {
    setIsDead(false);
    setHealth(MAX_HEALTH);
    setHunger(MAX_HUNGER);
    healthRef.current = MAX_HEALTH;
    hungerRef.current = MAX_HUNGER;
    setIsBlocking(false);
    isBlockingRef.current = false;
    setBreath(10);
    breathRef.current = 10;
    // Drop armor on death (MC behavior)
    setArmor(createArmorSlots());
    armorRef.current = createArmorSlots();

    // Tier-based inventory keep on death
    const keepSlots = TIER_KEEP_INVENTORY[balanceTier];
    if (keepSlots >= 36) {
      // Diamond tier: keep everything
    } else {
      const newInv = [...inventoryRef.current];
      // Keep first N slots, clear the rest
      for (let i = keepSlots; i < newInv.length; i++) {
        newInv[i] = null;
      }
      inventoryRef.current = newInv;
      setInventory(newInv);
      if (keepSlots > 0) {
        setToast(`💀 Kept ${keepSlots} slots (${tierInfo.label} tier perk)`);
      } else {
        setToast('💀 All items lost on death!');
      }
    }

    if (playerRef.current) {
      const world = worldRef.current;
      // Default: the force-cleared safe spawn platform
      const SAFE_SPAWN = { x: 20.5, y: 20, z: 20.5 };
      let sp = spawnPointRef.current || SAFE_SPAWN;
      // VALIDATE spawn point: if inside a block or in city bounds (x=40..88, z=40..88),
      // fall back to safe spawn
      if (world) {
        const sx = Math.floor(sp.x);
        const sz = Math.floor(sp.z);
        const inCity = sx >= 40 && sx <= 88 && sz >= 40 && sz <= 88;
        // Scan up from sp.y for a clear 3-block column
        let clearY = Math.floor(sp.y);
        let foundClear = false;
        for (let tries = 0; tries < 80; tries++) {
          if (!world.has(sx, clearY, sz) && !world.has(sx, clearY + 1, sz)) {
            foundClear = true;
            break;
          }
          clearY++;
        }
        if (inCity || !foundClear) {
          // Use the guaranteed safe platform
          sp = { ...SAFE_SPAWN };
          spawnPointRef.current = sp;
        } else {
          sp = { x: sp.x, y: clearY, z: sp.z };
        }
        // Final safety: force-clear blocks at spawn + ensure ground
        const fsx = Math.floor(sp.x);
        const fsz = Math.floor(sp.z);
        for (let cy = Math.floor(sp.y); cy <= Math.floor(sp.y) + 2; cy++) {
          if (world.has(fsx, cy, fsz)) world.removeBlock(fsx, cy, fsz, true);
        }
        if (!world.has(fsx, Math.floor(sp.y) - 1, fsz)) {
          world.addBlock(fsx, Math.floor(sp.y) - 1, fsz, 'royal_brick');
        }
      }
      playerRef.current.setPosition(sp.x, sp.y, sp.z);
      playerRef.current.velocity.set(0, 0, 0);
      playerRef.current.inventoryOpen = false;
      playerRef.current.breathTimer = 10;
      playerRef.current.chatOpen = false;
      // Give starter pickaxe if player has no tools (so walls CAN be broken)
      const hasPickaxe = inventoryRef.current.some(s => s && ITEMS[s.item]?.toolKind === 'pickaxe');
      if (!hasPickaxe) {
        const starterInv = addItem(inventoryRef.current, 'wooden_pickaxe', 1);
        inventoryRef.current = starterInv;
        setInventory(starterInv);
      }
    }
    // Tier-based respawn invulnerability
    const protDuration = TIER_RESPAWN_PROTECTION[balanceTier] * 1000;
    setInvulnerable(true);
    invulnerableRef.current = true;
    setTimeout(() => { setInvulnerable(false); invulnerableRef.current = false; }, protDuration);
    setDeathCause('Died'); // reset death cause
  };

  // Label for selected item
  const heldSlot = inventory[selectedSlot];
  const heldLabel = heldSlot ? ITEMS[heldSlot.item].label : '';
  const heldDef = heldSlot ? ITEMS[heldSlot.item] : null;

  // Persist inventory to localStorage
  useEffect(() => {
    try {
      window.localStorage.setItem('bc_inventory', JSON.stringify(inventory));
    } catch {}
  }, [inventory]);

  // XP calculation
  const xpInfo = computeLevel(totalXp);

  // Level-up detection and notification
  const prevLevelRef = useRef(xpInfo.level);
  useEffect(() => {
    if (xpInfo.level > prevLevelRef.current && prevLevelRef.current > 0) {
      setToast(`⬆️ Level Up! You are now level ${xpInfo.level}!`);
      setTimeout(() => setToast(null), 3000);
      getAudio().playLevelUp();
      // Bonus: heal 4 hearts on level up
      const newHp = Math.min(20, healthRef.current + 8);
      healthRef.current = newHp;
      setHealth(newHp);
      // Level-up celebration particles (green + gold fireworks from camera)
      const cam = cameraRef.current;
      const sc = sceneRef.current;
      if (cam && sc) {
        const pGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        for (let i = 0; i < 20; i++) {
          const color = i % 2 === 0 ? 0x55ff55 : 0xffdd00;
          const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
          const m = new THREE.Mesh(pGeom, mat);
          m.position.copy(cam.position);
          m.castShadow = false;
          sc.add(m);
          const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 6,
            2 + Math.random() * 4,
            (Math.random() - 0.5) * 6,
          );
          // Auto-cleanup after 1.5 seconds
          const startTime = Date.now();
          const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 1.5) {
              sc.remove(m);
              mat.dispose();
              pGeom.dispose();
              return;
            }
            m.position.add(vel.clone().multiplyScalar(0.016));
            vel.y -= 0.15;
            mat.opacity = Math.max(0, 1 - elapsed / 1.5);
            requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      }
      // Milestone level rewards (every 10 levels)
      if (xpInfo.level % 10 === 0 && walletAddress) {
        const milestoneRewards: ItemType[] = ['diamond', 'emerald', 'golden_apple', 'ender_pearl'];
        const reward = milestoneRewards[Math.floor(Math.random() * milestoneRewards.length)];
        const inv = addItem(inventoryRef.current, reward, 3);
        inventoryRef.current = inv;
        setInventory(inv);
        setTimeout(() => setToast(`🎉 Level ${xpInfo.level} Milestone! +3 ${ITEMS[reward].label}!`), 3500);
        setTimeout(() => setToast(null), 6500);
      }
    }
    prevLevelRef.current = xpInfo.level;
  }, [xpInfo.level]);

  // ---- Settings reactivity ----
  useEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.fov = gameFov;
      cameraRef.current.updateProjectionMatrix();
    }
  }, [gameFov]);

  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.shadowMap.enabled = shadowsOn;
      rendererRef.current.shadowMap.needsUpdate = true;
    }
  }, [shadowsOn]);

  useEffect(() => {
    if (sceneRef.current && sceneRef.current.fog instanceof THREE.Fog) {
      sceneRef.current.fog.far = renderDist;
      sceneRef.current.fog.near = Math.max(10, renderDist - 30);
    }
  }, [renderDist]);

  useEffect(() => {
    const audio = getAudio();
    audio.setVolume(gameVolume);
  }, [gameVolume]);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #1a3ea8 0%, #6a95e6 100%)' }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Underwater blue tint overlay */}
      {breath < 10 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(10,40,80,0.35) 0%, rgba(5,20,60,0.55) 100%)',
            zIndex: 1,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Frost overlay in snowy biomes */}
      {freezing > 0.05 && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse at center, rgba(180,220,255,${freezing * 0.15}) 0%, rgba(140,180,230,${freezing * 0.35}) 60%, rgba(100,150,210,${freezing * 0.5}) 100%)`,
            zIndex: 1,
            transition: 'opacity 0.5s ease',
            boxShadow: `inset 0 0 ${40 + freezing * 60}px rgba(180,220,255,${freezing * 0.3})`,
          }}
        />
      )}

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
        tierLabel={tierInfo.label}
        tierColor={tierInfo.color}
        xpMultiplier={TIER_XP_MULTIPLIER[balanceTier]}
        weather={weatherType}
        biome={currentBiome}
        playerRotY={playerRef.current?.rotY ?? 0}
        activePotion={activePotion}
        potionTimer={potionTimerRef.current}
        beaconActive={beaconActive}
        miningCombo={miningComboDisplay}
        armorDefense={getArmorDefense(armor)}
      />

      {/* On-chain wallet indicator with tier */}
      {walletAddress && (
        <div
          className="pointer-events-auto absolute right-4 top-4 cursor-pointer"
          onClick={() => setProfileOpen(true)}
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '14px',
            color: tierInfo.color,
            textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            background: 'rgba(0,0,0,0.5)',
            padding: '6px 10px',
            border: `1px solid ${tierInfo.color}`,
            borderRadius: '2px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px' }}>{TIER_COSMETICS[balanceTier].namePrefix || '⛓'}</span>
            <span>{tierInfo.label} Tier</span>
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
            {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
          </div>
          {ethBalance !== undefined && (
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>
              Ξ {(Number(ethBalance) / 1e18).toFixed(4)}
            </div>
          )}
        </div>
      )}

      <HealthHunger
        health={health}
        maxHealth={MAX_HEALTH}
        hunger={hunger}
        maxHunger={MAX_HUNGER}
      />

      {/* Armor indicator */}
      {(armor.helmet || armor.chestplate || armor.leggings || armor.boots) && (
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: '118px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'VT323', monospace",
            fontSize: '14px',
            color: '#aaddff',
            textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            display: 'flex',
            gap: '2px',
          }}
        >
          {[armor.helmet, armor.chestplate, armor.leggings, armor.boots].map((piece, i) => (
            <span key={i} style={{ opacity: piece ? 1 : 0.3 }}>🛡</span>
          ))}
        </div>
      )}

      {/* Breath bar (shown when underwater) */}
      {breath < 10 && (
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: '130px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'VT323', monospace",
            fontSize: '14px',
            display: 'flex',
            gap: '1px',
          }}
        >
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{ opacity: i < breath ? 1 : 0.2, filter: i < breath ? 'none' : 'grayscale(1)' }}>🫧</span>
          ))}
        </div>
      )}

      {/* Shield blocking indicator */}
      {isBlocking && (
        <div
          className="pointer-events-none absolute"
          style={{
            bottom: '145px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'VT323', monospace",
            fontSize: '16px',
            color: '#80ff20',
            textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            background: 'rgba(0,0,0,0.4)',
            padding: '2px 8px',
          }}
        >
          🛡 BLOCKING
        </div>
      )}

      {/* Damage flash overlay — red vignette when hurt */}
      {damageFlash > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-40"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(180,0,0,${damageFlash * 0.5}) 100%)`,
            mixBlendMode: 'multiply',
          }}
        />
      )}

      {/* Underwater tint overlay — blue haze when head is in water */}
      {isUnderwater && (
        <div
          className="pointer-events-none absolute inset-0 z-30"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(20,60,140,0.3) 0%, rgba(10,30,80,0.6) 100%)',
          }}
        >
          {/* Animated bubble particles */}
          <div className="absolute inset-0 overflow-hidden" style={{ opacity: 0.4 }}>
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${3 + (i % 4) * 2}px`,
                  height: `${3 + (i % 4) * 2}px`,
                  background: 'rgba(180,220,255,0.6)',
                  left: `${8 + (i * 7.3) % 84}%`,
                  bottom: `${-10 + (i * 13) % 20}%`,
                  animation: `bubbleRise ${3 + (i % 3)}s ease-in infinite`,
                  animationDelay: `${(i * 0.4) % 3}s`,
                }}
              />
            ))}
          </div>
          <style>{`
            @keyframes bubbleRise {
              0% { transform: translateY(0) translateX(0); opacity: 0.6; }
              50% { transform: translateY(-40vh) translateX(${Math.random() > 0.5 ? '' : '-'}10px); opacity: 0.4; }
              100% { transform: translateY(-100vh) translateX(${Math.random() > 0.5 ? '' : '-'}20px); opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {/* Low health vignette — permanent red edges when health <= 4 */}
      {health <= 4 && health > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-30 animate-pulse"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(120,0,0,0.3) 100%)',
            animationDuration: '1.5s',
          }}
        />
      )}

      {/* Creeper proximity warning — pulsing green vignette */}
      {creeperNear && (
        <div
          className="pointer-events-none absolute inset-0 z-30 animate-pulse"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,180,0,0.2) 100%)',
            animationDuration: '0.5s',
          }}
        />
      )}

      {/* Night vision potion — green tinted bright overlay */}
      {activePotion === 'potion_night_vision' && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(0,255,0,0.05) 0%, rgba(0,180,0,0.12) 100%)',
            mixBlendMode: 'screen',
          }}
        />
      )}

      {/* Speed potion — subtle blue motion lines */}
      {activePotion === 'potion_speed' && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background: 'linear-gradient(90deg, rgba(100,150,255,0.08) 0%, transparent 20%, transparent 80%, rgba(100,150,255,0.08) 100%)',
          }}
        />
      )}

      {/* Strength potion — red power aura */}
      {activePotion === 'potion_strength' && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(200,0,0,0.04) 0%, rgba(150,0,0,0.1) 100%)',
          }}
        />
      )}

      {/* Fire resistance — warm orange shimmer */}
      {activePotion === 'potion_fire_resist' && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background: 'radial-gradient(ellipse at center, rgba(255,150,0,0.04) 0%, rgba(200,80,0,0.1) 100%)',
          }}
        />
      )}

      {/* Low hunger — desaturated edges when hunger <= 3 */}
      {hunger <= 3 && hunger > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 50%, rgba(80,60,0,0.25) 100%)',
            filter: 'saturate(0.7)',
          }}
        />
      )}

      {/* Cave darkening — subtle dark vignette when deep underground (Y < 12) */}
      {coords.y < 12 && !isUnderwater && (
        <div
          className="pointer-events-none absolute inset-0 z-20"
          style={{
            background: `radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,${Math.min(0.5, (12 - coords.y) * 0.04)}) 100%)`,
          }}
        />
      )}

      <XPBar
        xp={xpInfo.xpInLevel}
        level={xpInfo.level}
        xpToNext={xpInfo.xpToNext}
      />

      {/* Minimap */}
      <Minimap
        world={worldRef.current}
        playerX={coords.x}
        playerZ={coords.z}
        playerRotY={playerRef.current?.rotY ?? 0}
        visible={showMinimap}
        otherPlayers={minimapPlayers}
      />

      {/* Kill feed */}
      {killFeed.length > 0 && (
        <div className="pointer-events-none absolute right-4 z-20" style={{ top: showMinimap ? '190px' : '56px' }}>
          <div className="flex flex-col gap-1">
            {killFeed.filter(k => Date.now() - k.ts < 5000).map(k => (
              <div
                key={k.id}
                style={{
                  fontFamily: "'VT323', monospace",
                  fontSize: '14px',
                  color: '#ff6644',
                  textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '2px 8px',
                  borderRadius: '2px',
                  opacity: Math.max(0, 1 - (Date.now() - k.ts) / 5000),
                  textAlign: 'right',
                }}
              >
                {k.text}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Daily challenge (wallet-exclusive) */}
      {dailyChallenge && walletAddress && !dailyChallenge.completed && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            bottom: '85px',
            right: '12px',
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,200,0,0.4)',
            padding: '6px 10px',
          }}
        >
          <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: '7px', color: '#ffd700', marginBottom: '3px' }}>
            DAILY CHALLENGE
          </div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: '14px', color: '#fff' }}>
            {dailyChallenge.type}
          </div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: '12px', color: '#aaa' }}>
            Progress: {Math.min(dailyChallenge.current, dailyChallenge.target)}/{dailyChallenge.target}
          </div>
          <div style={{ width: '100%', height: '3px', background: '#333', marginTop: '2px' }}>
            <div style={{
              width: `${Math.min(100, (dailyChallenge.current / dailyChallenge.target) * 100)}%`,
              height: '100%',
              background: '#ffd700',
            }} />
          </div>
          <div style={{ fontFamily: "'VT323', monospace", fontSize: '11px', color: '#88ff44', marginTop: '2px' }}>
            Reward: {dailyChallenge.reward}
          </div>
        </div>
      )}

      {/* Weather indicator */}
      {weatherType !== 'clear' && (
        <div
          className="pointer-events-none absolute"
          style={{
            top: '4px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'VT323', monospace",
            fontSize: '14px',
            color: weatherType === 'thunder' ? '#ffaa44' : '#aaccff',
            textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            background: 'rgba(0,0,0,0.4)',
            padding: '2px 8px',
            borderRadius: '2px',
          }}
        >
          {weatherType === 'rain' ? '🌧️ Rain' : '⛈️ Thunderstorm'}
        </div>
      )}

      {/* Compass direction indicator */}
      {hasCompass && (
        <div
          className="pointer-events-none absolute"
          style={{
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '8px',
            color: 'rgba(255,255,255,0.7)',
            textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            background: 'rgba(0,0,0,0.35)',
            padding: '3px 12px',
            display: 'flex',
            gap: '8px',
          }}
        >
          {(() => {
            const rot = playerRef.current?.rotY ?? 0;
            const deg = (((-rot * 180 / Math.PI) % 360) + 360) % 360;
            let dir = 'N';
            if (deg >= 337.5 || deg < 22.5) dir = 'S';
            else if (deg >= 22.5 && deg < 67.5) dir = 'SW';
            else if (deg >= 67.5 && deg < 112.5) dir = 'W';
            else if (deg >= 112.5 && deg < 157.5) dir = 'NW';
            else if (deg >= 157.5 && deg < 202.5) dir = 'N';
            else if (deg >= 202.5 && deg < 247.5) dir = 'NE';
            else if (deg >= 247.5 && deg < 292.5) dir = 'E';
            else dir = 'SE';
            return <span>🧭 {dir} {Math.round(deg)}°</span>;
          })()}
        </div>
      )}

      {/* Active potion effect indicator */}
      {activePotion && (
        <div
          className="pointer-events-none absolute"
          style={{
            top: '44px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: "'VT323', monospace",
            fontSize: '12px',
            color: activePotion === 'potion_speed' ? '#44ccff'
              : activePotion === 'potion_strength' ? '#cc2222'
              : activePotion === 'potion_fire_resist' ? '#ff8800'
              : activePotion === 'potion_night_vision' ? '#aaaaff'
              : activePotion === 'potion_jump' ? '#44ff44'
              : '#ffffff',
            textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
            background: 'rgba(0,0,0,0.4)',
            padding: '2px 10px',
            borderRadius: '2px',
          }}
        >
          🧪 {ITEMS[activePotion as ItemType]?.label ?? 'Potion'} ({Math.ceil(potionTimerRef.current)}s)
        </div>
      )}

      {/* Spyglass zoom vignette */}
      {spyglassActive && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.85) 70%)',
            borderRadius: '50%',
          }}
        />
      )}

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
          // Chat commands
          if (msg.startsWith('/')) {
            const parts = msg.slice(1).split(' ');
            const cmd = parts[0].toLowerCase();

            if (cmd === 'tp' || cmd === 'teleport') {
              // /tp x y z — requires bronze tier or higher
              if (!walletAddress) {
                appendChat({ username: 'system', message: '⛓️ Connect wallet to use /tp command', isSystem: true });
                return;
              }
              if (balanceTier === 'none') {
                appendChat({ username: 'system', message: '💰 Need at least Base tier to use /tp', isSystem: true });
                return;
              }
              const tx = parseFloat(parts[1]);
              const ty = parseFloat(parts[2]);
              const tz = parseFloat(parts[3]);
              if (isNaN(tx) || isNaN(ty) || isNaN(tz)) {
                appendChat({ username: 'system', message: '❌ Usage: /tp x y z', isSystem: true });
                return;
              }
              playerRef.current?.setPosition(tx, ty, tz);
              appendChat({ username: 'system', message: `✨ Teleported to ${tx.toFixed(0)}, ${ty.toFixed(0)}, ${tz.toFixed(0)}`, isSystem: true });
              return;
            }

            if (cmd === 'time') {
              const phase = dayPhase;
              const hour = Math.floor(phase * 24);
              const minute = Math.floor((phase * 24 - hour) * 60);
              appendChat({ username: 'system', message: `🕐 Time: ${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} (${phase < 0.5 ? 'Day' : 'Night'})`, isSystem: true });
              return;
            }

            if (cmd === 'seed') {
              appendChat({ username: 'system', message: `🌱 World Seed: BaseCraft-${Math.floor(Date.now() / 86400000)}`, isSystem: true });
              return;
            }

            if (cmd === 'stats') {
              const s = statsRef.current;
              appendChat({ username: 'system', message: `📊 Blocks: ${s.blocksPlaced}P/${s.blocksBroken}B | Mobs: ${s.mobsKilled} | Deaths: ${s.deaths}`, isSystem: true });
              return;
            }

            if (cmd === 'tier') {
              appendChat({ username: 'system', message: `⛓️ Tier: ${tierInfo.label} | Balance: ${ethBalance !== undefined ? (Number(ethBalance) / 1e18).toFixed(4) : '—'} ETH`, isSystem: true });
              return;
            }

            if (cmd === 'give') {
              // /give <item> [count] — diamond tier only
              if (balanceTier !== 'diamond') {
                appendChat({ username: 'system', message: '💎 /give requires Diamond tier', isSystem: true });
                return;
              }
              const itemName = parts[1]?.toLowerCase() as ItemType;
              const count = parseInt(parts[2]) || 1;
              if (!itemName || !ITEMS[itemName]) {
                appendChat({ username: 'system', message: '❌ Usage: /give <item_id> [count]', isSystem: true });
                return;
              }
              const giveInv = addItem(inventoryRef.current, itemName, Math.min(count, 64));
              inventoryRef.current = giveInv;
              setInventory(giveInv);
              appendChat({ username: 'system', message: `✨ Gave ${count}x ${ITEMS[itemName].label}`, isSystem: true });
              return;
            }

            if (cmd === 'weather') {
              // /weather <clear|rain|thunder> — gold tier+
              if (balanceTier !== 'gold' && balanceTier !== 'diamond') {
                appendChat({ username: 'system', message: '💰 /weather requires Gold+ tier', isSystem: true });
                return;
              }
              const w = parts[1]?.toLowerCase();
              if (w === 'clear' || w === 'rain' || w === 'thunder') {
                weatherRef.current = w;
                setWeatherType(w);
                appendChat({ username: 'system', message: `🌤️ Weather set to ${w}`, isSystem: true });
              } else {
                appendChat({ username: 'system', message: '❌ Usage: /weather <clear|rain|thunder>', isSystem: true });
              }
              return;
            }

            if (cmd === 'kill') {
              // /kill — suicide command
              if (playerRef.current) {
                setHealth(0);
                healthRef.current = 0;
                setIsDead(true);
                statsRef.current.deaths++;
                appendChat({ username: 'system', message: '💀 You killed yourself', isSystem: true });
              }
              return;
            }

            if (cmd === 'clear') {
              // /clear — clear inventory (silver tier+)
              if (balanceTier === 'none' || balanceTier === 'base' || balanceTier === 'bronze') {
                appendChat({ username: 'system', message: '💰 /clear requires Silver+ tier', isSystem: true });
                return;
              }
              const emptyInv = new Array(INVENTORY_SIZE).fill(null);
              inventoryRef.current = emptyInv;
              setInventory(emptyInv);
              appendChat({ username: 'system', message: '🗑️ Inventory cleared', isSystem: true });
              return;
            }

            if (cmd === 'xp') {
              // /xp <amount> — add XP (diamond tier only)
              if (balanceTier !== 'diamond') {
                appendChat({ username: 'system', message: '💎 /xp requires Diamond tier', isSystem: true });
                return;
              }
              const amount = parseInt(parts[1]);
              if (isNaN(amount) || amount <= 0) {
                appendChat({ username: 'system', message: '❌ Usage: /xp <amount>', isSystem: true });
                return;
              }
              const newXp = totalXpRef.current + Math.min(amount, 10000);
              totalXpRef.current = newXp;
              setTotalXp(newXp);
              appendChat({ username: 'system', message: `✨ Added ${Math.min(amount, 10000)} XP (total: ${newXp})`, isSystem: true });
              return;
            }

            if (cmd === 'home' || cmd === 'spawn') {
              // /home — teleport to spawn point
              if (!walletAddress) {
                appendChat({ username: 'system', message: '⛓️ Connect wallet to use /home', isSystem: true });
                return;
              }
              const sp = spawnPointRef.current;
              if (sp) {
                playerRef.current?.setPosition(sp.x, sp.y + 1, sp.z);
                appendChat({ username: 'system', message: `🏠 Teleported home (${sp.x}, ${sp.y}, ${sp.z})`, isSystem: true });
              } else {
                playerRef.current?.setPosition(0, 80, 0);
                appendChat({ username: 'system', message: '🏠 Teleported to world spawn', isSystem: true });
              }
              return;
            }

            if (cmd === 'pos' || cmd === 'position') {
              const p = playerRef.current;
              if (p) {
                appendChat({ username: 'system', message: `📍 Position: ${p.position.x.toFixed(1)}, ${p.position.y.toFixed(1)}, ${p.position.z.toFixed(1)}`, isSystem: true });
              }
              return;
            }

            if (cmd === 'heal') {
              // /heal — full heal (gold tier+)
              if (balanceTier !== 'gold' && balanceTier !== 'diamond') {
                appendChat({ username: 'system', message: '💰 /heal requires Gold+ tier', isSystem: true });
                return;
              }
              setHealth(20);
              healthRef.current = 20;
              appendChat({ username: 'system', message: '❤️ Fully healed!', isSystem: true });
              return;
            }

            if (cmd === 'fly') {
              // /fly — toggle creative flight (Diamond tier only)
              if (balanceTier !== 'diamond') {
                appendChat({ username: 'system', message: '💎 /fly requires Diamond tier', isSystem: true });
                return;
              }
              const p = playerRef.current;
              if (p) {
                p.flying = !p.flying;
                appendChat({ username: 'system', message: p.flying ? '🕊️ Flight enabled! Space=Up, Shift=Down' : '🚶 Flight disabled', isSystem: true });
              }
              return;
            }

            if (cmd === 'gamemode' || cmd === 'gm') {
              // /gamemode <0|1|s|c> — toggle survival/creative (Diamond tier only)
              if (balanceTier !== 'diamond') {
                appendChat({ username: 'system', message: '💎 /gamemode requires Diamond tier', isSystem: true });
                return;
              }
              const mode = parts[1]?.toLowerCase();
              const p = playerRef.current;
              if (mode === '1' || mode === 'c' || mode === 'creative') {
                if (p) p.flying = true;
                invulnerableRef.current = true;
                setInvulnerable(true);
                appendChat({ username: 'system', message: '🎮 Creative mode: Flight ON, Invulnerable', isSystem: true });
              } else if (mode === '0' || mode === 's' || mode === 'survival') {
                if (p) p.flying = false;
                invulnerableRef.current = false;
                setInvulnerable(false);
                appendChat({ username: 'system', message: '🎮 Survival mode: Flight OFF, Vulnerable', isSystem: true });
              } else {
                appendChat({ username: 'system', message: '❌ Usage: /gamemode <0|1|s|c>', isSystem: true });
              }
              return;
            }

            if (cmd === 'balance' || cmd === 'bal') {
              if (!walletAddress) {
                appendChat({ username: 'system', message: '⛓️ Connect your wallet to see balance', isSystem: true });
                return;
              }
              const ethAmt = ethBalance !== undefined ? (Number(ethBalance) / 1e18).toFixed(4) : '—';
              appendChat({ username: 'system', message: `💰 Wallet: ${walletAddress.slice(0,6)}...${walletAddress.slice(-4)} | ${ethAmt} ETH on Base (chain 8453) | Tier: ${tierInfo.label}`, isSystem: true });
              return;
            }

            if (cmd === 'biome') {
              appendChat({ username: 'system', message: `🌍 Current biome: ${currentBiome} | Weather: ${weatherType}`, isSystem: true });
              return;
            }

            if (cmd === 'nft' || cmd === 'onchain') {
              if (!walletAddress) {
                appendChat({ username: 'system', message: '⛓️ Connect wallet to view on-chain status', isSystem: true });
                return;
              }
              const ethAmt = ethBalance !== undefined ? (Number(ethBalance) / 1e18).toFixed(4) : '—';
              const s = statsRef.current;
              appendChat({ username: 'system', message: `⛓️ On-Chain Status:`, isSystem: true });
              appendChat({ username: 'system', message: `  Network: Base (8453) | Balance: ${ethAmt} ETH`, isSystem: true });
              appendChat({ username: 'system', message: `  Tier: ${tierInfo.label} | XP Multi: ${TIER_XP_MULTIPLIER[balanceTier]}x`, isSystem: true });
              appendChat({ username: 'system', message: `  Emeralds Earned: ${s.emeraldsEarned} | Achievements: ${earnedRef.current.size}/${ACHIEVEMENT_DEFS.length}`, isSystem: true });
              appendChat({ username: 'system', message: `  Land Claims: ${landClaimsRef.current.size} | Lucky Drops: ${s.luckyDrops}`, isSystem: true });
              return;
            }

            if (cmd === 'recipe' || cmd === 'recipes') {
              appendChat({ username: 'system', message: `📖 Total recipes available: ${RECIPES.length}. Open crafting table (E key near crafting_table) to see all recipes.`, isSystem: true });
              return;
            }

            if (cmd === 'sethome') {
              // /sethome [name] — set custom home point (wallet required)
              if (!walletAddress) {
                appendChat({ username: 'system', message: '⛓️ Connect wallet to use /sethome', isSystem: true });
                return;
              }
              const homeName = parts[1]?.toLowerCase() || 'default';
              const p = playerRef.current;
              if (p) {
                const maxHomes = balanceTier === 'diamond' ? 5 : balanceTier === 'gold' ? 3 : balanceTier === 'silver' ? 2 : 1;
                if (customHomesRef.current.size >= maxHomes && !customHomesRef.current.has(homeName)) {
                  appendChat({ username: 'system', message: `❌ Max ${maxHomes} homes for ${tierInfo.label} tier`, isSystem: true });
                  return;
                }
                customHomesRef.current.set(homeName, {
                  x: Math.floor(p.position.x),
                  y: Math.floor(p.position.y),
                  z: Math.floor(p.position.z),
                });
                appendChat({ username: 'system', message: `🏠 Home "${homeName}" set at ${Math.floor(p.position.x)}, ${Math.floor(p.position.y)}, ${Math.floor(p.position.z)}`, isSystem: true });
              }
              return;
            }

            if (cmd === 'delhome') {
              const homeName = parts[1]?.toLowerCase() || 'default';
              if (customHomesRef.current.has(homeName)) {
                customHomesRef.current.delete(homeName);
                appendChat({ username: 'system', message: `🗑️ Home "${homeName}" deleted`, isSystem: true });
              } else {
                appendChat({ username: 'system', message: `❌ No home named "${homeName}"`, isSystem: true });
              }
              return;
            }

            if (cmd === 'homes') {
              if (customHomesRef.current.size === 0) {
                appendChat({ username: 'system', message: '🏠 No custom homes set. Use /sethome [name]', isSystem: true });
              } else {
                const homeList = Array.from(customHomesRef.current.entries())
                  .map(([name, pos]) => `${name} (${pos.x}, ${pos.y}, ${pos.z})`)
                  .join(', ');
                appendChat({ username: 'system', message: `🏠 Homes: ${homeList}`, isSystem: true });
              }
              return;
            }

            if (cmd === 'gohome') {
              // /gohome [name] — teleport to custom home (wallet required)
              if (!walletAddress) {
                appendChat({ username: 'system', message: '⛓️ Connect wallet to use /gohome', isSystem: true });
                return;
              }
              const homeName = parts[1]?.toLowerCase() || 'default';
              const homePos = customHomesRef.current.get(homeName);
              if (homePos) {
                playerRef.current?.setPosition(homePos.x, homePos.y + 1, homePos.z);
                appendChat({ username: 'system', message: `🏠 Teleported to home "${homeName}"`, isSystem: true });
              } else {
                appendChat({ username: 'system', message: `❌ No home named "${homeName}". Use /homes to list`, isSystem: true });
              }
              return;
            }

            if (cmd === 'playtime') {
              const s = statsRef.current;
              const mins = Math.floor(s.playTimeSeconds / 60);
              const hrs = Math.floor(mins / 60);
              const remMins = mins % 60;
              appendChat({ username: 'system', message: `⏱️ Play time: ${hrs}h ${remMins}m | Current life: ${Math.floor(s.currentLifeSeconds / 60)}m | Longest life: ${Math.floor(s.longestLifeSeconds / 60)}m`, isSystem: true });
              return;
            }

            if (cmd === 'level' || cmd === 'lvl') {
              appendChat({ username: 'system', message: `⭐ Level ${xpInfo.level} | XP: ${xpInfo.xpInLevel}/${xpInfo.xpToNext} (${Math.floor((xpInfo.xpInLevel / Math.max(1, xpInfo.xpToNext)) * 100)}%) | Tier bonus: ${TIER_XP_MULTIPLIER[balanceTier]}x`, isSystem: true });
              return;
            }

            if (cmd === 'coins' || cmd === 'basecoins') {
              const c = statsRef.current.baseCoinsCollected ?? 0;
              appendChat({ username: 'system', message: `⬢ Base Coins collected: ${c} | Mine cobblestone/bricks for a chance at hidden coins`, isSystem: true });
              return;
            }

            if (cmd === 'unstuck' || cmd === 'stuck') {
              // Emergency unstuck — teleport player upward to find clear space
              const p = playerRef.current;
              const world = worldRef.current;
              if (p && world) {
                const sx = Math.floor(p.position.x);
                const sz = Math.floor(p.position.z);
                let safeY = 80;
                for (let ty = 80; ty >= 1; ty--) {
                  const bt = world.getType(sx, ty, sz);
                  if (bt && bt !== 'water' && bt !== 'lava') {
                    safeY = ty + 2;
                    break;
                  }
                }
                p.setPosition(sx + 0.5, safeY, sz + 0.5);
                p.velocity.set(0, 0, 0);
                appendChat({ username: 'system', message: `🆘 Unstuck! Teleported to (${sx}, ${safeY}, ${sz})`, isSystem: true });
              }
              return;
            }

            if (cmd === 'coords') {
              // /coords — share your coordinates in chat
              const p = playerRef.current;
              if (p) {
                const socket = getSocket();
                socket.emit('chat:send', { message: `📍 I'm at ${Math.floor(p.position.x)}, ${Math.floor(p.position.y)}, ${Math.floor(p.position.z)} in ${currentBiomeRef.current}` });
              }
              return;
            }

            if (cmd === 'help') {
              appendChat({ username: 'system', message: '📖 Commands: /tp, /time, /seed, /stats, /tier, /bal, /pos, /home, /kill, /heal, /give, /weather, /xp, /clear, /fly, /gm, /online, /me, /streak, /dist, /ach, /biome, /recipe, /sethome, /delhome, /homes, /gohome, /playtime, /level, /coords, /help', isSystem: true });
              return;
            }

            if (cmd === 'online' || cmd === 'who' || cmd === 'list') {
              const playerNames = onlinePlayers.map(p => p.username).join(', ');
              appendChat({ username: 'system', message: `👥 Online (${onlinePlayers.length + 1}): ${username}${playerNames ? ', ' + playerNames : ''}`, isSystem: true });
              return;
            }

            if (cmd === 'me') {
              // /me <action> — roleplay action message
              const action = parts.slice(1).join(' ');
              if (!action) {
                appendChat({ username: 'system', message: '❌ Usage: /me <action>', isSystem: true });
                return;
              }
              const socket = getSocket();
              socket.emit('chat:send', { message: `* ${username} ${action}` });
              return;
            }

            if (cmd === 'streak') {
              const s = statsRef.current;
              appendChat({ username: 'system', message: `🔥 Current max kill streak: ${s.maxKillStreak} | Fish caught: ${s.fishCaught} | Food eaten: ${s.foodEaten}`, isSystem: true });
              return;
            }

            if (cmd === 'distance' || cmd === 'dist') {
              const s = statsRef.current;
              appendChat({ username: 'system', message: `📏 Distance walked: ${Math.round(s.distanceWalked)} blocks | Highest: Y=${Math.round(s.highestY)} | Deepest: Y=${Math.round(s.lowestY)}`, isSystem: true });
              return;
            }

            if (cmd === 'achievements' || cmd === 'ach') {
              appendChat({ username: 'system', message: `🏆 Achievements: ${earnedRef.current.size}/${ACHIEVEMENT_DEFS.length} (${Math.round((earnedRef.current.size / ACHIEVEMENT_DEFS.length) * 100)}%)`, isSystem: true });
              return;
            }

            appendChat({ username: 'system', message: `❌ Unknown command: /${cmd}. Type /help for commands.`, isSystem: true });
            return;
          }

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
          {heldSlot && heldSlot.count > 1 && <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: '6px' }}>x{heldSlot.count}</span>}
          {heldSlot?.durability !== undefined && heldDef?.durability && (
            <span style={{
              color: heldSlot.durability / heldDef.durability > 0.5 ? '#80ff20' : heldSlot.durability / heldDef.durability > 0.2 ? '#ffcc00' : '#ff4444',
              marginLeft: '6px',
              fontSize: '13px',
            }}>
              [{heldSlot.durability}/{heldDef.durability}]
            </span>
          )}
          {enchantedItemsRef.current.has(selectedSlot) && (
            <span style={{ color: '#aa44ff', marginLeft: '6px' }}>✨ {enchantedItemsRef.current.get(selectedSlot)}</span>
          )}
          {heldDef?.isFood && <span style={{ color: '#80ff20', marginLeft: '6px' }}>🍖 Right-click to eat</span>}
          {heldDef?.walletExclusive && <span style={{ color: '#0052ff', marginLeft: '6px' }}>⛓</span>}
        </div>
      )}

      {/* Inventory screen */}
      {inventoryOpen && !isDead && (
        <InventoryScreen
          inventory={inventory}
          onInventoryChange={(inv) => {
            inventoryRef.current = inv;
            setInventory(inv);
          }}
          onCraft={handleCraft}
          nearCraftingTable={nearCraftingTable()}
          nearFurnace={nearFurnace()}
          onClose={() => {
            setInventoryOpen(false);
            if (playerRef.current) playerRef.current.inventoryOpen = false;
          }}
          armor={armor}
          enchantments={enchantedItemsRef.current}
        />
      )}

      {/* Death screen */}
      <DeathScreen
        visible={isDead}
        onRespawn={handleRespawn}
        score={xpInfo.level}
        keepSlots={TIER_KEEP_INVENTORY[balanceTier]}
        tierLabel={tierInfo.label}
        tierColor={tierInfo.color}
        deathCause={deathCause}
        deaths={statsRef.current.deaths}
      />

      {/* Achievement toast */}
      <AchievementToast achievement={achievementToast} />

      {/* On-chain panels */}
      <ProfilePanel
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
        username={username}
        walletAddress={walletAddress}
        balanceTier={tierInfo.label}
        tierColor={tierInfo.color}
        ethBalance={ethBalance !== undefined ? (Number(ethBalance) / 1e18).toFixed(4) : '—'}
        stats={{
          blocksPlaced: statsRef.current.blocksPlaced,
          blocksBroken: statsRef.current.blocksBroken,
          mobsKilled: statsRef.current.mobsKilled,
          deaths: statsRef.current.deaths,
          playTimeSeconds: Math.floor(statsRef.current.playTimeSeconds),
          itemsCrafted: statsRef.current.itemsCrafted,
          itemsEnchanted: statsRef.current.itemsEnchanted,
          villagerTrades: statsRef.current.villagerTrades,
          emeraldsEarned: statsRef.current.emeraldsEarned,
          distanceWalked: statsRef.current.distanceWalked,
          highestY: statsRef.current.highestY,
          longestLifeSeconds: statsRef.current.longestLifeSeconds,
        }}
        xpMultiplier={`${TIER_XP_MULTIPLIER[balanceTier]}x`}
        achievementCount={earnedAchievements.size}
        totalAchievements={ACHIEVEMENT_DEFS.length}
        landClaimCount={Array.from(landClaims.values()).filter(c => c.wallet_address === walletAddress).length}
      />

      <LeaderboardPanel
        visible={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        entries={leaderboardData}
        currentUsername={username}
      />

      <AchievementPanel
        visible={achievementsOpen}
        onClose={() => setAchievementsOpen(false)}
        achievements={ACHIEVEMENT_DEFS}
        earned={earnedAchievements}
        stats={statsRef.current}
      />

      <LandClaimPanel
        visible={landClaimOpen}
        onClose={() => setLandClaimOpen(false)}
        currentChunk={getChunkCoords(coords.x, coords.z)}
        claimStatus={
          (() => {
            const { cx, cz } = getChunkCoords(coords.x, coords.z);
            const claim = landClaims.get(chunkKey(cx, cz));
            if (!claim) return 'unclaimed' as const;
            if (walletAddress && claim.wallet_address.toLowerCase() === walletAddress.toLowerCase()) return 'yours' as const;
            return 'other' as const;
          })()
        }
        claimOwner={
          (() => {
            const { cx, cz } = getChunkCoords(coords.x, coords.z);
            const claim = landClaims.get(chunkKey(cx, cz));
            return claim?.username;
          })()
        }
        onClaim={() => {
          const { cx, cz } = getChunkCoords(coords.x, coords.z);
          getSocket().emit('land:claim', { chunkX: cx, chunkZ: cz });
        }}
        onUnclaim={() => {
          const { cx, cz } = getChunkCoords(coords.x, coords.z);
          getSocket().emit('land:unclaim', { chunkX: cx, chunkZ: cz });
        }}
        yourClaims={Array.from(landClaims.values())
          .filter(c => walletAddress && c.wallet_address.toLowerCase() === walletAddress.toLowerCase())
          .map(c => ({ cx: c.chunk_x, cz: c.chunk_z }))}
        walletConnected={!!walletAddress}
      />

      <TierPerksPanel
        visible={tierPerksOpen}
        onClose={() => setTierPerksOpen(false)}
        currentTier={tierInfo.label}
      />

      <ControlsPanel
        visible={controlsOpen}
        onClose={() => setControlsOpen(false)}
      />

      <SettingsPanel
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        muted={muted}
        onToggleMute={() => {
          const audio = getAudio();
          const now = audio.toggleMute();
          setMuted(now);
        }}
        volume={gameVolume}
        onVolumeChange={setGameVolume}
        fov={gameFov}
        onFovChange={setGameFov}
        renderDist={renderDist}
        onRenderDistChange={setRenderDist}
        showCoords={showCoords}
        onToggleCoords={() => setShowCoords(v => !v)}
        shadows={shadowsOn}
        onToggleShadows={() => setShadowsOn(v => !v)}
      />

      <BountyBoard
        visible={bountyBoardOpen}
        onClose={() => setBountyBoardOpen(false)}
        mobsKilled={statsRef.current.mobsKilled}
        walletConnected={!!walletAddress}
        currentTier={balanceTier}
      />

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
      {!pointerLocked && !chatOpen && !inventoryOpen && !isDead && worldLoaded && (
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
              <div><span style={{ color: '#ffff55' }}>HOLD LEFT CLICK</span> — Mine / Attack · <span style={{ color: '#ffff55' }}>RIGHT CLICK</span> — Place / Eat</div>
              <div><span style={{ color: '#ffff55' }}>1-9</span> — Select slot · <span style={{ color: '#ffff55' }}>E</span> — Inventory/Craft</div>
              <div><span style={{ color: '#ffff55' }}>F</span> — Fly · <span style={{ color: '#ffff55' }}>T</span> — Chat</div>
              <div><span style={{ color: '#ffff55' }}>L</span> — Leaderboard · <span style={{ color: '#ffff55' }}>P</span> — Profile · <span style={{ color: '#ffff55' }}>J</span> — Achievements · <span style={{ color: '#ffff55' }}>N</span> — Land</div>
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
