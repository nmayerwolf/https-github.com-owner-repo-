import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from '../i18n/useTranslation';

const links = [
  { to: '/news', key: 'nav_news', icon: '📰' },
  { to: '/ideas', key: 'nav_ideas', icon: '💡' },
  { to: '/portfolio', key: 'nav_portfolio', icon: '💼' },
  { to: '/agent', key: 'nav_agent', icon: '⚙️' }
];

const Navigation = () => {
  const { t } = useTranslation();

  return (
    <nav className="bottom-nav">
      {links.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{t(item.key)}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export default Navigation;
