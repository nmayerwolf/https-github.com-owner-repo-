import React from 'react';
import { NavLink } from 'react-router-dom';
import { useLanguage } from '../store/LanguageContext';

const Navigation = () => {
  const { isSpanish } = useLanguage();
  const links = [
    {
      to: '/brief',
      label: isSpanish ? 'Resumen' : 'Brief',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h10" />
        </svg>
      )
    },
    {
      to: '/ideas',
      label: isSpanish ? 'Ideas' : 'Ideas',
      icon: (
        <svg viewBox="0 0 24 24">
          <path d="M12 3v5" />
          <path d="M8.5 8.5l3.5 3.5 3.5-3.5" />
          <path d="M12 12v9" />
          <path d="M8 21h8" />
        </svg>
      )
    },
    {
      to: '/portfolio',
      label: isSpanish ? 'Portafolio' : 'Portfolio',
      icon: (
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 20h8" />
        </svg>
      )
    }
  ];

  return (
    <nav className="bottom-nav">
      {links.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${item.special ? 'special' : ''} ${isActive ? 'active' : ''}`}>
          {item.icon}
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default Navigation;
