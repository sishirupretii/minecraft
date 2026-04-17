'use client';

import { useEffect, useRef, useState } from 'react';

export interface ChatMsg {
  id: number;
  username: string;
  message: string;
  isSystem?: boolean;
  ts: number;
  nameColor?: string; // tier-based name color
  tierBadge?: string; // tier label prefix e.g. 'DIAMOND'
  tierBadgeColor?: string; // badge color
}

interface Props {
  messages: ChatMsg[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSend: (msg: string) => void;
}

export default function Chat({ messages, open, onOpen, onClose, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        onClose();
        setDraft('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function submit() {
    const text = draft.trim();
    if (text) onSend(text);
    setDraft('');
    onClose();
  }

  // Show last 8, fade after 10s if chat closed
  const visible = messages.slice(-8).filter((m) => open || now - m.ts < 10_000);

  return (
    <div className="pointer-events-none absolute bottom-20 left-4 z-20 flex w-[28rem] max-w-[60vw] flex-col gap-1">
      <div className="flex flex-col gap-1">
        {visible.map((m) => {
          const age = now - m.ts;
          const fading = !open && age > 7000;
          return (
            <div
              key={m.id}
              className="rounded-md bg-black/60 px-3 py-1.5 text-sm backdrop-blur-sm transition-opacity"
              style={{ opacity: fading ? Math.max(0, 1 - (age - 7000) / 3000) : 1 }}
            >
              {m.isSystem ? (
                <span className="text-cyan-300/90">{m.message}</span>
              ) : (
                <>
                  {m.tierBadge && (
                    <span
                      style={{
                        fontSize: '8px',
                        fontFamily: "'Press Start 2P', monospace",
                        color: m.tierBadgeColor || '#888',
                        background: 'rgba(0,0,0,0.4)',
                        border: `1px solid ${m.tierBadgeColor || '#888'}`,
                        padding: '1px 4px',
                        marginRight: '4px',
                        verticalAlign: 'middle',
                        borderRadius: '2px',
                      }}
                    >
                      {m.tierBadge}
                    </span>
                  )}
                  <span className="font-semibold" style={{ color: m.nameColor || '#59a5ff' }}>{m.username}</span>
                  <span className="text-white/90">: {m.message}</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {open ? (
        <div className="pointer-events-auto mt-2 flex items-center gap-2 rounded-md bg-black/70 px-3 py-2 backdrop-blur-sm">
          <span className="text-xs text-white/50">T</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
            placeholder="Say something… (/help for commands)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            maxLength={300}
          />
        </div>
      ) : (
        <button
          className="pointer-events-auto mt-2 self-start rounded-md bg-black/50 px-2 py-1 text-[11px] text-white/40 backdrop-blur-sm hover:text-white/80"
          onClick={onOpen}
        >
          Press T to chat
        </button>
      )}
    </div>
  );
}
