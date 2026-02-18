import React, { useId } from 'react';

const HorsaiHorseIcon = ({ className = '', title = 'Horsai' }) => {
  const id = useId().replace(/:/g, '');
  const hg = `hg-${id}`;
  const mg = `mg-${id}`;

  return (
    <svg className={className} viewBox="0 0 200 220" fill="none" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={hg} x1="50" y1="20" x2="150" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4A853" />
          <stop offset="40%" stopColor="#C49A47" />
          <stop offset="100%" stopColor="#8B6914" />
        </linearGradient>
        <linearGradient id={mg} x1="80" y1="30" x2="60" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8C56A" />
          <stop offset="100%" stopColor="#A68430" />
        </linearGradient>
      </defs>

      <path d="M95 85 C95 85 75 95 70 120 C65 145 68 160 72 175 L78 175 C78 175 80 160 82 150 C84 140 90 130 95 125 C100 120 105 130 108 140 C111 150 112 160 112 175 L118 175 C118 175 120 155 118 140 C116 125 112 115 115 105 C118 95 130 90 135 95 C140 100 142 115 144 130 C146 145 148 160 148 175 L154 175 C154 175 155 150 152 130 C149 110 145 95 140 85 C135 75 125 70 115 72 C105 74 100 80 95 85Z" fill={`url(#${hg})`} />
      <path d="M95 85 C90 75 85 60 82 50 C79 40 78 35 80 30 C82 25 88 22 92 25 C96 28 98 35 97 45 L95 85Z" fill={`url(#${hg})`} />
      <path d="M80 30 C78 25 72 20 68 22 C64 24 60 28 58 32 C56 36 58 40 62 42 C66 44 72 42 76 38 C80 34 82 32 80 30Z" fill={`url(#${hg})`} />
      <path d="M76 24 L72 14 L80 22Z" fill={`url(#${hg})`} />
      <path d="M82 22 L80 12 L86 20Z" fill={`url(#${hg})`} />
      <circle cx="68" cy="30" r="2.5" fill="#050811" />
      <circle cx="68.8" cy="29.3" r="0.7" fill="#D4A853" />
      <ellipse cx="60" cy="36" rx="1.2" ry="0.8" fill="#050811" opacity="0.4" />
      <path d="M85 28 C82 35 78 45 80 55 C82 65 86 70 88 80 C84 75 78 68 76 58 C74 48 76 38 80 28 L85 28Z" fill={`url(#${mg})`} opacity="0.5" />
      <path d="M90 25 C88 32 85 42 87 52 C89 62 92 68 94 78 C90 72 86 64 84 54 C82 44 84 34 88 25 L90 25Z" fill={`url(#${mg})`} opacity="0.35" />
      <path d="M82 120 C78 115 70 105 62 98 C54 91 48 88 44 90 L46 94 C48 92 54 94 60 100 C66 106 74 116 78 122 L82 120Z" fill={`url(#${hg})`} />
      <path d="M44 90 L40 86 L42 84 L46 88Z" fill={`url(#${hg})`} />
      <path d="M90 118 C86 112 80 102 74 96 C68 90 62 86 58 86 L60 90 C62 88 68 92 74 98 C80 104 86 114 88 120 L90 118Z" fill={`url(#${hg})`} />
      <path d="M58 86 L54 82 L56 80 L60 84Z" fill={`url(#${hg})`} />
      <rect x="38" y="84" width="5" height="3.5" rx="1" fill="#D4A853" opacity="0.7" />
      <rect x="52" y="80" width="5" height="3.5" rx="1" fill="#D4A853" opacity="0.7" />
      <rect x="74" y="173" width="7" height="4.5" rx="1.5" fill="#D4A853" opacity="0.7" />
      <rect x="111" y="173" width="7" height="4.5" rx="1.5" fill="#D4A853" opacity="0.7" />
      <rect x="147" y="173" width="7" height="4.5" rx="1.5" fill="#D4A853" opacity="0.7" />
      <path d="M148 90 C155 85 162 82 168 85 C174 88 172 95 168 100 C164 105 158 108 155 115 C152 122 150 130 150 140 C148 132 146 122 148 112 C150 102 154 95 152 90 L148 90Z" fill={`url(#${mg})`} opacity="0.45" />
    </svg>
  );
};

export default HorsaiHorseIcon;
