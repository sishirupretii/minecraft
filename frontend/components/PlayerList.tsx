'use client';

interface Props {
  visible: boolean;
  players: Array<{ id: string; username: string; color: string }>;
  self?: { username: string; color: string };
}

export default function PlayerList({ visible, players, self }: Props) {
  if (!visible) return null;

  const all = self ? [{ id: 'self', username: self.username, color: self.color }, ...players] : players;

  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2">
      <div className="bc-panel min-w-64 p-4">
        <div className="mb-2 text-center text-xs uppercase tracking-wider text-white/50">
          Online ({all.length})
        </div>
        <ul className="flex flex-col gap-1">
          {all.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-md bg-white/5 px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: p.color }}
                />
                <span>{p.username}</span>
              </span>
              {self && p.username === self.username && (
                <span className="text-[10px] uppercase text-white/40">you</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
