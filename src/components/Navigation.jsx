import React from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  {
    to: '/news',
    label: 'News',
    icon: '📰'
  },
  {
    to: '/ideas',
    label: 'Ideas',
    icon: '💡'
  },
  {
    to: '/portfolio',
    label: 'Portfolio',
    icon: '💼'
  },
  {
    to: '/agent',
    label: 'Agent',
    icon: '⚙️'
  }
];

const Navigation = () => (
  <nav className="bottom-nav">
    {links.map((item) => (
      <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
        <span className="nav-icon" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </NavLink>
    ))}
  </nav>
);

export default Navigation;
