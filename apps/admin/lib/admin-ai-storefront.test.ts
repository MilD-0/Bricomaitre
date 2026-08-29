import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
  modelOptions: vi.fn(),
  loadContent: vi.fn(),
  saveAnnouncement: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock('./storefront-settings', () => ({
  loadStorefrontSettings: mocks.loadSettings,
  saveStorefrontSettings: mocks.saveSettings,
  getStorefrontAiModelOptions: mocks.modelOptions,
}));
vi.mock('./storefront-content', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./storefront-content')>()),
  loadStorefrontContentAdmin: mocks.loadContent,
  saveStorefrontAnnouncement: mocks.saveAnnouncement,
}));
vi.mock('./storefront-revalidate', () => ({
  revalidateStorefrontSettings: mocks.revalidate,
}));

import {
  inspectAdminStorefrontConfiguration,
  storefrontAnnouncementMutationSchema,
  storefrontSettingsToolSchema,
  updateAdminStorefrontAnnouncement,
  updateAdminStorefrontSettings,
  updateAdminStorefrontSettingsFromTool,
} from './admin-ai-storefront';

const settings = {
  contactPhone: '0550000000',
  phoneEnabled: true,
  contactEmail: 'support@bricomaitre.com',
  address: 'Alger',
  mapUrl: null,
  facebookUrl: null,
  aiAssistantEnabled: true,
  aiModel: 'openai/gpt-5.6-luna',
  aiFallbackModel: 'deepseek/deepseek-v4-flash',
};

describe('admin AI storefront operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadSettings.mockResolvedValue(settings);
    mocks.loadContent.mockResolvedValue({
      messageFr: 'Bienvenue',
      messageAr: 'مرحبا',
      active: true,
    });
    mocks.modelOptions.mockReturnValue(['openai/gpt-5.6-luna', 'deepseek/deepseek-v4-flash']);
    mocks.saveSettings.mockImplementation(async (value) => value);
    mocks.saveAnnouncement.mockImplementation(async (value) => value);
  });

  it('reads the complete configuration, announcement, and configured model choices', async () => {
    await expect(inspectAdminStorefrontConfiguration()).resolves.toEqual({
      settings,
      announcement: { messageFr: 'Bienvenue', messageAr: 'مرحبا', active: true },
      configuredAiModels: ['openai/gpt-5.6-luna', 'deepseek/deepseek-v4-flash'],
    });
  });

  it('merges and persists an explicit partial setting update before revalidating storefronts', async () => {
    await expect(
      updateAdminStorefrontSettings({ contactEmail: 'sales@bricomaitre.com' }),
    ).resolves.toMatchObject({
      ok: true,
      settings: { contactEmail: 'sales@bricomaitre.com', aiModel: 'openai/gpt-5.6-luna' },
    });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      ...settings,
      contactEmail: 'sales@bricomaitre.com',
    });
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it('refuses an unavailable model without persisting a partial configuration', async () => {
    await expect(updateAdminStorefrontSettings({ aiModel: 'unconfigured/model' })).resolves.toEqual(
      {
        error: 'Select storefront AI models configured by the environment.',
        configuredAiModels: ['openai/gpt-5.6-luna', 'deepseek/deepseek-v4-flash'],
      },
    );
    expect(mocks.saveSettings).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('applies only explicit model-facing field operations and supports nullable clears', async () => {
    await expect(
      updateAdminStorefrontSettingsFromTool({
        operations: [
          { field: 'address', value: '12 rue des Outils' },
          { field: 'facebookUrl', value: null },
          { field: 'aiAssistantEnabled', value: false },
        ],
      }),
    ).resolves.toMatchObject({
      ok: true,
      settings: {
        address: '12 rue des Outils',
        facebookUrl: null,
        aiAssistantEnabled: false,
        contactPhone: '0550000000',
      },
    });
    expect(mocks.saveSettings).toHaveBeenCalledWith({
      ...settings,
      address: '12 rue des Outils',
      facebookUrl: null,
      aiAssistantEnabled: false,
    });
    expect(
      storefrontSettingsToolSchema.safeParse({
        operations: [
          { field: 'address', value: 'One' },
          { field: 'address', value: 'Two' },
        ],
      }).success,
    ).toBe(false);
  });

  it('updates both localized announcement messages and revalidates storefront content', async () => {
    await expect(
      updateAdminStorefrontAnnouncement(
        { messageFr: 'Livraison offerte', messageAr: 'توصيل مجاني', active: true },
        'admin@bricomaitre.com',
      ),
    ).resolves.toMatchObject({ ok: true, announcement: { active: true } });
    expect(mocks.saveAnnouncement).toHaveBeenCalledWith(
      { messageFr: 'Livraison offerte', messageAr: 'توصيل مجاني', active: true },
      'admin@bricomaitre.com',
    );
    expect(mocks.revalidate).toHaveBeenCalledOnce();
  });

  it('rejects an active announcement unless both localized messages are present', () => {
    expect(
      storefrontAnnouncementMutationSchema.safeParse({
        messageFr: 'Livraison gratuite',
        messageAr: '',
        active: true,
      }).success,
    ).toBe(false);
    expect(
      storefrontAnnouncementMutationSchema.safeParse({
        messageFr: '',
        messageAr: '',
        active: false,
      }).success,
    ).toBe(true);
  });
});
