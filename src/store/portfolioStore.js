const KEY = 'nexusfin_portfolio';
const PORTFOLIOS_KEY = 'nexusfin_portfolios_v1';
const ACTIVE_PORTFOLIO_KEY = 'nexusfin_active_portfolio_v1';

export const loadPortfolio = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const savePortfolio = (positions) => {
  localStorage.setItem(KEY, JSON.stringify(positions));
};

export const loadPortfolios = () => {
  try {
    const raw = localStorage.getItem(PORTFOLIOS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.id && item.id !== 'pf-default');
  } catch {
    return [];
  }
};

export const savePortfolios = (portfolios) => {
  const next = Array.isArray(portfolios) ? portfolios : [];
  localStorage.setItem(PORTFOLIOS_KEY, JSON.stringify(next));
};

export const loadActivePortfolioId = () => {
  try {
    return localStorage.getItem(ACTIVE_PORTFOLIO_KEY) || '';
  } catch {
    return '';
  }
};

export const saveActivePortfolioId = (portfolioId) => {
  if (!portfolioId) {
    localStorage.removeItem(ACTIVE_PORTFOLIO_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_PORTFOLIO_KEY, String(portfolioId));
};
