const KEY = 'nexusfin_portfolio';

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
