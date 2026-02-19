import React from 'react';
import { NavLink } from 'react-router-dom';
import { MARKET_VISIBLE } from '../config/features';

const links = [
  {
    to: '/alerts',
    label: 'Agente IA',
    special: true,
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
        <path d="M12 3v18" />
      </svg>
    )
  },
  ...(MARKET_VISIBLE
    ? [
        {
          to: '/markets',
          label: 'Mercados',
          icon: (
            <svg viewBox="0 0 24 24">
              <path d="M4 18V6" />
              <path d="M10 18v-8" />
              <path d="M16 18V9" />
              <path d="M22 18v-5" />
            </svg>
          )
        }
      ]
    : []),
  {
    to: '/portfolio',
    label: 'Cartera',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M8 20h8" />
      </svg>
    )
  },
  {
    to: '/news',
    label: 'Noticias',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 8h10" />
        <path d="M7 12h10" />
        <path d="M7 16h6" />
      </svg>
    )
  },
  {
    to: '/settings',
    label: 'Ajustes',
    icon: (
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.02.02a2 2 0 0 1-2.83 2.83l-.02-.02A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.34 1V21a2 2 0 0 1-4 0v-.03a1.7 1.7 0 0 0-.34-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.02.02a2 2 0 1 1-2.83-2.83l.02-.02A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.34H3a2 2 0 0 1 0-4h.03a1.7 1.7 0 0 0 1-.34 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.02-.02a2 2 0 1 1 2.83-2.83l.02.02A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .34-1V3a2 2 0 0 1 4 0v.03a1.7 1.7 0 0 0 .34 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.02-.02a2 2 0 1 1 2.83 2.83l-.02.02A1.7 1.7 0 0 0 19.4 9c.2.32.31.69.32 1.06V10a2 2 0 0 1 0 4h-.03a1.7 1.7 0 0 0-1 .34c-.32.2-.57.46-.6.66z" />
      </svg>
    )
  }
];

const Navigation = () => (
  <nav className="bottom-nav">
    {links.map((item) => (
      <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${item.special ? 'special' : ''} ${isActive ? 'active' : ''}`}>
        {item.icon}
        <span>{item.label}</span>
      </NavLink>
    ))}
  </nav>
);

export default Navigation;
