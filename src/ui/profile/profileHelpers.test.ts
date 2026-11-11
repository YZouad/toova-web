import { describe, expect, it } from 'vitest';
import {
  parseProfileTab,
  parseSettingsSection,
  visibilityLabel,
} from './profileHelpers';

describe('profileHelpers', () => {
  it('parses profile tabs with owner gate', () => {
    expect(parseProfileTab('models', false)).toBe('models');
    expect(parseProfileTab('settings', true)).toBe('settings');
    expect(parseProfileTab('settings', false)).toBe('rooms');
    expect(parseProfileTab(null, true)).toBe('rooms');
    expect(parseProfileTab('nope', true)).toBe('rooms');
  });

  it('parses settings sections', () => {
    expect(parseSettingsSection('notifications')).toBe('notifications');
    expect(parseSettingsSection('integrations')).toBe('integrations');
    expect(parseSettingsSection('privacy')).toBe('privacy');
    expect(parseSettingsSection(null)).toBe('profile');
    expect(parseSettingsSection('other')).toBe('profile');
  });

  it('labels visibility', () => {
    expect(visibilityLabel('public')).toBe('Public');
    expect(visibilityLabel('unlisted')).toBe('Unlisted');
    expect(visibilityLabel('private')).toBe('Private');
  });
});
