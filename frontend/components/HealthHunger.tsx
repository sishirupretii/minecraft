'use client';

// Minecraft-style health (hearts) and hunger (drumsticks) bars.
// Both max at 10 units, each unit drawn as a half-icon pair so the
// display goes from 0 to 20 halves (matching Minecraft's half-heart
// resolution). For simplicity we use full-unit granularity here.

interface Props {
  health: number;      // 0..20
  maxHealth: number;   // 20
  hunger: number;      // 0..20
  maxHunger: number;   // 20
}

const HEART_FULL = '#cc2222';
const HEART_EMPTY = '#3a1111';
const HUNGER_FULL = '#b8860b';
const HUNGER_EMPTY = '#3a2a0a';

function Bar({ value, max, fullColor, emptyColor, icon }: {
  value: number; max: number; fullColor: string; emptyColor: string; icon: string;
}) {
  const units = Math.ceil(max / 2); // 10 icons for 20 HP
  const filledUnits = Math.ceil(value / 2);
  const halfUnit = value % 2 === 1; // last filled icon is a half

  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: units }).map((_, i) => {
        const isFull = i < filledUnits && !(halfUnit && i === filledUnits - 1);
        const isHalf = halfUnit && i === filledUnits - 1;
        const isEmpty = i >= filledUnits;
        return (
          <div
            key={i}
            className="relative flex items-center justify-center"
            style={{
              width: '14px',
              height: '14px',
              fontSize: '11px',
              lineHeight: 1,
              textShadow: '1px 1px 0 rgba(0,0,0,0.8)',
              fontFamily: "'Press Start 2P', monospace",
            }}
          >
            {/* Empty background */}
            <span style={{ color: emptyColor, position: 'absolute' }}>{icon}</span>
            {/* Filled foreground */}
            {(isFull || isHalf) && (
              <span
                style={{
                  color: fullColor,
                  position: 'absolute',
                  opacity: isHalf ? 0.5 : 1,
                }}
              >
                {icon}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function HealthHunger({ health, maxHealth, hunger, maxHunger }: Props) {
  return (
    <div className="pointer-events-none absolute bottom-[78px] left-1/2 -translate-x-1/2 flex gap-6">
      {/* Hearts — left side */}
      <Bar value={health} max={maxHealth} fullColor={HEART_FULL} emptyColor={HEART_EMPTY} icon="♥" />
      {/* Hunger — right side */}
      <Bar value={hunger} max={maxHunger} fullColor={HUNGER_FULL} emptyColor={HUNGER_EMPTY} icon="♦" />
    </div>
  );
}
