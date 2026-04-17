'use client';

interface Props {
  achievement: {
    id: string;
    name: string;
    description: string;
    icon: string;
  } | null;
}

export default function AchievementToast({ achievement }: Props) {
  if (!achievement) return null;

  return (
    <div
      className="absolute left-1/2 z-50"
      style={{
        top: '24px',
        transform: 'translateX(-50%)',
        animation: 'slideDown 0.4s ease-out',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'rgba(20, 18, 12, 0.92)',
          border: '2px solid #ffd700',
          boxShadow:
            'inset 2px 2px 0 rgba(255,215,0,0.15), inset -2px -2px 0 rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.6)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minWidth: '280px',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: '36px',
            height: '36px',
            background: 'rgba(255,215,0,0.15)',
            border: '1px solid #b8960c',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}
        >
          {achievement.icon}
        </div>

        {/* Text */}
        <div className="flex flex-col gap-1">
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '8px',
              color: '#ffd700',
              textShadow: '1px 1px 0 #000',
            }}
          >
            Achievement Get!
          </span>
          <span
            style={{
              fontFamily: "'Press Start 2P', monospace",
              fontSize: '9px',
              color: '#fff',
              textShadow: '1px 1px 0 #000',
            }}
          >
            {achievement.name}
          </span>
          <span
            style={{
              fontFamily: "'VT323', monospace",
              fontSize: '15px',
              color: 'rgba(255,255,255,0.6)',
            }}
          >
            {achievement.description}
          </span>
        </div>
      </div>

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-100%);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
