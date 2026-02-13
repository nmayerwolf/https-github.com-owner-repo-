import { NavLink } from 'react-router-dom';

const links = [
  ['/', 'Dashboard'],
  ['/markets', 'Mercados'],
  ['/alerts', 'Alertas'],
  ['/portfolio', 'Portfolio'],
  ['/screener', 'Screener'],
  ['/groups', 'Grupos'],
  ['/settings', 'Config']
];

const Navigation = () => (
  <nav className="nav">
    {links.map(([to, label]) => (
      <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
        {label}
      </NavLink>
    ))}
  </nav>
);

export default Navigation;
