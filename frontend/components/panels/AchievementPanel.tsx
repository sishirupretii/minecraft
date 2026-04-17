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
}

export default function AchievementPanel({
  visible,
  onClose,
  achievements,
  earned,
}: Props) {
  const categories = useMemo(() => {
    const cats = Array.from(new Set(achievements.map((a) => a.category)));
    return cats.sort();
  }, [achievements]);

  const [activeCategory, setActiveCategory] = useState<string>('');

  // Set default category on open
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

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bc-panel flex flex-col gap-3 p-6 relative"
        style={{ maxWidth: '580px', width: '100%', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '8px',
            right: '10px',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            color: '#aaa',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textShadow: '1px 1px 0 #000',
          }}
        >
          X
        </button>

        {/* Header */}
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '12px',
            color: 'rgba(255,255,255,0.85)',
            textShadow: '2px 2px 0 rgba(0,0,0,0.7)',
          }}
        >
          ACHIEVEMENTS
        </div>

        {/* Progress summary */}
        <div
          style={{
            fontFamily: "'VT323', monospace",
            fontSize: '18px',
            color: 'rgba(255,255,255,0.6)',
          }}
        >
          {earned.size} / {achievements.length} unlocked
        </div>

        {/* Category tabs */}
        {categories.length > 1 && (
          <div className="flex gap-1 flex-wrap">
            {categories.map((cat) => {
              const isActive = cat === activeCategory;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  style={{
                    fontFamily: "'Press Start 2P', monospace",
                    fontSize: '7px',
                    color: isActive ? '#fff' : 'rgba(255,255,255,0.45)',
                    background: isActive ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.3)',
                    border: isActive ? '1px solid #777' : '1px solid #444',
                    padding: '5px 10px',
                    cursor: 'pointer',
                    textShadow: '1px 1px 0 #000',
                    textTransform: 'uppercase',
                  }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        )}

        {/* Achievement grid */}
        <div
          className="grid gap-2 overflow-y-auto"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            maxHeight: '400px',
            paddingRight: '4px',
          }}
        >
          {filtered.map((ach) => {
            const isEarned = earned.has(ach.id);
            return (
              <div
                key={ach.id}
                style={{
                  background: isEarned
                    ? 'rgba(34, 90, 34, 0.25)'
                    : 'rgba(0,0,0,0.4)',
                  border: isEarned
                    ? '2px solid #5cb85c'
                    : '2px solid #333',
                  padding: '8px',
                  boxShadow: isEarned
                    ? 'inset 1px 1px 0 rgba(92,184,92,0.2), inset -1px -1px 0 rgba(0,0,0,0.3)'
                    : 'inset 1px 1px 0 #222, inset -1px -1px 0 #111',
                  opacity: isEarned ? 1 : 0.55,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                {/* Icon row */}
                <div className="flex items-center gap-2">
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      background: isEarned
                        ? 'rgba(255,255,255,0.08)'
                        : 'rgba(0,0,0,0.3)',
                      border: '1px solid #555',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: isEarned ? '16px' : '14px',
                      flexShrink: 0,
                    }}
                  >
                    {isEarned ? ach.icon : '\u{1F512}'}
                  </div>
                  <span
                    style={{
                      fontFamily: "'Press Start 2P', monospace",
                      fontSize: '7px',
                      color: isEarned ? '#fff' : 'rgba(255,255,255,0.4)',
                      textShadow: '1px 1px 0 #000',
                      lineHeight: '1.4',
                    }}
                  >
                    {ach.name}
                  </span>
                </div>

                {/* Description */}
                <span
                  style={{
                    fontFamily: "'VT323', monospace",
                    fontSize: '14px',
                    color: isEarned
                      ? 'rgba(255,255,255,0.6)'
                      : 'rgba(255,255,255,0.3)',
                    lineHeight: '1.2',
                  }}
                >
                  {ach.description}
                </span>
              </div>
            );
          })}
        </div>

        {/* Close hint */}
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '7px',
            color: 'rgba(255,255,255,0.3)',
            textShadow: '1px 1px 0 rgba(0,0,0,0.6)',
            textAlign: 'center',
            marginTop: '4px',
          }}
        >
          ESC TO CLOSE
        </div>
      </div>
    </div>
  );
}
