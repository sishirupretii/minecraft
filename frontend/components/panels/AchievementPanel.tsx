'use client';

import { useEffect, useState, useMemo } from 'react';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  achievements: Achievement[];
  earned: Set<string>;
  stats?: {
    blocksBroken: number;
    blocksPlaced: number;
    mobsKilled: number;
    deaths: number;
    playTimeSeconds: number;
    distanceWalked: number;
    itemsCrafted: number;
    fishCaught: number;
    foodEaten: number;
    maxKillStreak: number;
    currentLevel: number;
  };
}

// Progress tracking for achievements that have numeric thresholds
function getProgress(id: string, stats?: Props['stats']): { current: number; target: number } | null {
  if (!stats) return null;
  const map: Record<string, [number, number]> = {
    first_break: [stats.blocksBroken, 1],
    miner_100: [stats.blocksBroken, 100],
    miner_1000: [stats.blocksBroken, 1000],
    miner_5000: [stats.blocksBroken, 5000],
    miner_10000: [stats.blocksBroken, 10000],
    first_place: [stats.blocksPlaced, 1],
    builder_100: [stats.blocksPlaced, 100],
    builder_1000: [stats.blocksPlaced, 1000],
    builder_5000: [stats.blocksPlaced, 5000],
    builder_10000: [stats.blocksPlaced, 10000],
    first_kill: [stats.mobsKilled, 1],
    slayer_50: [stats.mobsKilled, 50],
    slayer_200: [stats.mobsKilled, 200],
    slayer_500: [stats.mobsKilled, 500],
    slayer_1000: [stats.mobsKilled, 1000],
    first_death: [stats.deaths, 1],
    deaths_10: [stats.deaths, 10],
    survivor_30: [stats.playTimeSeconds, 1800],
    survivor_60: [stats.playTimeSeconds, 3600],
    survivor_300: [stats.playTimeSeconds, 18000],
    survivor_600: [stats.playTimeSeconds, 36000],
    first_craft: [stats.itemsCrafted, 1],
    crafter_50: [stats.itemsCrafted, 50],
    crafter_200: [stats.itemsCrafted, 200],
    explorer: [stats.distanceWalked, 1000],
    traveler_5000: [stats.distanceWalked, 5000],
    first_fish: [stats.fishCaught, 1],
    fisher_50: [stats.fishCaught, 50],
    iron_stomach: [stats.foodEaten, 100],
    triple_kill: [stats.maxKillStreak, 3],
    killing_spree: [stats.maxKillStreak, 5],
    level_10: [stats.currentLevel, 10],
    level_25: [stats.currentLevel, 25],
    level_50: [stats.currentLevel, 50],
  };
  const entry = map[id];
  if (!entry) return null;
  return { current: Math.min(entry[0], entry[1]), target: entry[1] };
}

// Rarity based on how hard an achievement is
function getRarity(id: string): { label: string; color: string } {
  const legendary = ['slayer_1000', 'builder_10000', 'miner_10000', 'survivor_600', 'level_50', 'tier_diamond'];
  const epic = ['slayer_500', 'builder_5000', 'miner_5000', 'survivor_300', 'level_25', 'crafter_200', 'tier_gold'];
  const rare = ['slayer_200', 'builder_1000', 'miner_1000', 'survivor_60', 'level_10', 'crafter_50', 'traveler_5000', 'killing_spree', 'tier_bronze'];
  if (legendary.includes(id)) return { label: 'LEGENDARY', color: '#ff8800' };
  if (epic.includes(id)) return { label: 'EPIC', color: '#aa44ff' };
  if (rare.includes(id)) return { label: 'RARE', color: '#4488ff' };
  return { label: 'COMMON', color: '#888888' };
}

export default function AchievementPanel({
  visible,
  onClose,
  achievements,
  earned,
  stats,
}: Props) {
  const categories = useMemo(() => {
    const cats = Array.from(new Set(achievements.map((a) => a.category)));
    return cats.sort();
  }, [achievements]);

  const [activeCategory, setActiveCategory] = useState<string>('');

  useEffect(() => {
    if (visible && categories.length > 0 && !activeCategory) {
      setActiveCategory(categories[0]);
    }
  }, [visible, categories, activeCategory]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  const filtered = activeCategory
    ? achievements.filter((a) => a.category === activeCategory)
    : achievements;

  const totalProgress = Math.round((earned.size / achievements.length) * 100);
  const catCounts = categories.map(cat => {
    const total = achievements.filter(a => a.category === cat).length;
    const done = achievements.filter(a => a.category === cat && earned.has(a.id)).length;
    return { cat, done, total };
  });

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bc-panel flex flex-col gap-3 p-6 relative"
        style={{ maxWidth: '620px', width: '100%', maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: '8px', right: '10px',
            fontFamily: "'Press Start 2P', monospace", fontSize: '10px',
            color: '#aaa', background: 'none', border: 'none', cursor: 'pointer',
            textShadow: '1px 1px 0 #000',
          }}
        >
          X
        </button>

        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '12px',
          color: 'rgba(255,255,255,0.85)', textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
        }}>
          ACHIEVEMENTS
        </div>

        {/* Overall progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '8px', background: 'rgba(0,0,0,0.4)', border: '1px solid #444' }}>
            <div style={{
              width: `${totalProgress}%`, height: '100%',
              background: 'linear-gradient(90deg, #5cb85c, #8bbf68)',
              transition: 'width 0.3s',
            }} />
          </div>
          <span style={{
            fontFamily: "'VT323', monospace", fontSize: '16px',
            color: totalProgress === 100 ? '#ffd700' : 'rgba(255,255,255,0.6)',
          }}>
            {earned.size}/{achievements.length} ({totalProgress}%)
          </span>
        </div>

        {/* Category tabs with counts */}
        {categories.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {catCounts.map(({ cat, done, total }) => {
              const isActive = cat === activeCategory;
              const allDone = done === total;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    fontFamily: "'Press Start 2P', monospace", fontSize: '7px',
                    color: isActive ? '#fff' : allDone ? '#5cb85c' : 'rgba(255,255,255,0.45)',
                    background: isActive ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.3)',
                    border: isActive ? '1px solid #777' : allDone ? '1px solid #5cb85c44' : '1px solid #444',
                    padding: '5px 8px', cursor: 'pointer',
                    textShadow: '1px 1px 0 #000', textTransform: 'uppercase',
                  }}
                >
                  {cat} {done}/{total}
                </button>
              );
            })}
          </div>
        )}

        {/* Achievement grid */}
        <div
          className="grid gap-2 overflow-y-auto"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
            maxHeight: '420px', paddingRight: '4px',
          }}
        >
          {filtered.map((ach) => {
            const isEarned = earned.has(ach.id);
            const rarity = getRarity(ach.id);
            const progress = !isEarned ? getProgress(ach.id, stats) : null;
            return (
              <div
                key={ach.id}
                style={{
                  background: isEarned ? 'rgba(34, 90, 34, 0.25)' : 'rgba(0,0,0,0.4)',
                  border: isEarned ? '2px solid #5cb85c' : '2px solid #333',
                  padding: '8px',
                  boxShadow: isEarned
                    ? 'inset 1px 1px 0 rgba(92,184,92,0.2), inset -1px -1px 0 rgba(0,0,0,0.3)'
                    : 'inset 1px 1px 0 #222, inset -1px -1px 0 #111',
                  opacity: isEarned ? 1 : 0.65,
                  display: 'flex', flexDirection: 'column', gap: '4px',
                }}
              >
                {/* Icon + name row */}
                <div className="flex items-center gap-2">
                  <div style={{
                    width: '28px', height: '28px',
                    background: isEarned ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)',
                    border: `1px solid ${isEarned ? rarity.color : '#555'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isEarned ? '16px' : '14px', flexShrink: 0,
                  }}>
                    {isEarned ? ach.icon : '\u{1F512}'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    <span style={{
                      fontFamily: "'Press Start 2P', monospace", fontSize: '7px',
                      color: isEarned ? '#fff' : 'rgba(255,255,255,0.4)',
                      textShadow: '1px 1px 0 #000', lineHeight: '1.4',
                    }}>
                      {ach.name}
                    </span>
                    <span style={{
                      fontFamily: "'Press Start 2P', monospace", fontSize: '5px',
                      color: rarity.color, letterSpacing: '0.5px',
                    }}>
                      {rarity.label}
                    </span>
                  </div>
                </div>

                {/* Description */}
                <span style={{
                  fontFamily: "'VT323', monospace", fontSize: '14px',
                  color: isEarned ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)',
                  lineHeight: '1.2',
                }}>
                  {ach.description}
                </span>

                {/* Progress bar for unearned */}
                {progress && (
                  <div style={{ marginTop: '2px' }}>
                    <div style={{
                      height: '4px', background: 'rgba(0,0,0,0.4)',
                      border: '1px solid #333',
                    }}>
                      <div style={{
                        width: `${Math.min(100, (progress.current / progress.target) * 100)}%`,
                        height: '100%',
                        background: rarity.color,
                        opacity: 0.7,
                      }} />
                    </div>
                    <span style={{
                      fontFamily: "'VT323', monospace", fontSize: '12px',
                      color: 'rgba(255,255,255,0.35)',
                    }}>
                      {progress.current}/{progress.target}
                    </span>
                  </div>
                )}

                {/* Earned checkmark */}
                {isEarned && (
                  <span style={{
                    fontFamily: "'Press Start 2P', monospace", fontSize: '6px',
                    color: '#5cb85c', alignSelf: 'flex-end',
                  }}>
                    UNLOCKED
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div style={{
          fontFamily: "'Press Start 2P', monospace", fontSize: '7px',
          color: 'rgba(255,255,255,0.3)', textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
          textAlign: 'center', marginTop: '4px',
        }}>
          ESC TO CLOSE
        </div>
      </div>
    </div>
  );
}
