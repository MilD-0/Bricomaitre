import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  construct: vi.fn(),
  trigger: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('web-haptics', () => ({
  WebHaptics: class WebHapticsMock {
    constructor(options: unknown) {
      mocks.construct(options);
    }

    trigger(feedback: unknown) {
      return mocks.trigger(feedback);
    }
  },
}));

describe('haptics', () => {
  function setTouchPoints(value: number) {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      configurable: true,
      value,
    });
  }

  beforeEach(() => {
    vi.resetModules();
    mocks.construct.mockClear();
    mocks.trigger.mockReset().mockResolvedValue(undefined);
  });

  it('does not load the optional client for non-touch devices', async () => {
    setTouchPoints(0);
    const { prepareHaptics, triggerHaptic } = await import('./haptics');

    await prepareHaptics();
    await triggerHaptic('selection');

    expect(mocks.construct).not.toHaveBeenCalled();
    expect(mocks.trigger).not.toHaveBeenCalled();
  });

  it('reuses one private client and forwards semantic feedback on touch devices', async () => {
    setTouchPoints(5);
    const { prepareHaptics, triggerHaptic } = await import('./haptics');

    await prepareHaptics();
    await triggerHaptic('selection');
    await triggerHaptic('success');

    expect(mocks.construct).toHaveBeenCalledOnce();
    expect(mocks.construct).toHaveBeenCalledWith({ debug: false, showSwitch: false });
    expect(mocks.trigger.mock.calls).toEqual([['selection'], ['success']]);
  });

  it('swallows device feedback failures so the customer action remains safe', async () => {
    setTouchPoints(1);
    mocks.trigger.mockRejectedValueOnce(new Error('device rejected vibration'));
    const { triggerHaptic } = await import('./haptics');

    await expect(triggerHaptic('medium')).resolves.toBeUndefined();
  });
});
