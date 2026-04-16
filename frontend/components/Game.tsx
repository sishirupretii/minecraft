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

    // ---- Three.js scene ----
    const scene = new THREE.Scene();
    // Blue sky backdrop + blue fog for distance atmosphere
    scene.background = new THREE.Color(0x1a3ea8);
    scene.fog = new THREE.Fog(0x1a3ea8, 24, 72);

    // Add a sky sphere with a vertical gradient so it doesn't look flat
    const skyGeom = new THREE.SphereGeometry(250, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x030614) },
        horizonColor: { value: new THREE.Color(0x1a3ea8) },
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

    // Lights
    const ambient = new THREE.AmbientLight(0x8aa8ff, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(40, 80, 20);
    scene.add(dir);
    const hemi = new THREE.HemisphereLight(0x88bbff, 0x0a1030, 0.25);
    scene.add(hemi);

    // World + players
    const world = new WorldRenderer(scene);
    const others = new OtherPlayersManager(scene);

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

    // ---- Socket wiring ----
    const socket = getSocket();

    const onConnect = () => {
      console.log('[socket] connected', socket.id);
      socket.emit('join', { username, walletAddress });
    };

    const onDisconnect = (reason: string) => {
      console.log('[socket] disconnected', reason);
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
    let raf = 0;
    const tick = () => {
      const dt = clock.getDelta();
      player.update(dt);
      others.update(dt);
      world.update();
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
    <div className="relative h-screen w-screen overflow-hidden bg-black">
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

