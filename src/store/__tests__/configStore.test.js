/* @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, saveConfig } from '../configStore';
import { DEFAULT_CONFIG } from '../../utils/constants';

describe('configStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('loads defaults when localStorage is empty', () => {
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('saves and reloads merged config', () => {
    saveConfig({ riskProfile: 'agresivo', minConfluence: 4 });
    const out = loadConfig();
    expect(out.riskProfile).toBe('agresivo');
    expect(out.minConfluence).toBe(4);
    expect(out.rsiOS).toBe(DEFAULT_CONFIG.rsiOS);
  });

  it('falls back to defaults on malformed json', () => {
    localStorage.setItem('nexusfin_config', '{bad-json');
    expect(loadConfig()).toEqual(DEFAULT_CONFIG);
  });

  it('does not throw when save fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => saveConfig({ riskProfile: 'moderado' })).not.toThrow();
  });
});
