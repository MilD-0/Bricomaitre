import { describe, expect, it } from 'vitest';
import {
  checkoutFieldsSchema,
  DEFAULT_CHECKOUT_FIELDS,
  missingCheckoutFields,
  sanitizeCheckoutFields,
  setCheckoutField,
} from './checkout-fields';

describe('checkout field policy', () => {
  it('locks phone and rejects inconsistent direct settings writes', () => {
    expect(
      checkoutFieldsSchema.safeParse({
        ...DEFAULT_CHECKOUT_FIELDS,
        phoneNumber1: { active: false, required: false },
      }).success,
    ).toBe(false);
    expect(
      checkoutFieldsSchema.safeParse({
        ...DEFAULT_CHECKOUT_FIELDS,
        state: { active: false, required: false },
      }).success,
    ).toBe(false);
    expect(
      checkoutFieldsSchema.safeParse({
        ...DEFAULT_CHECKOUT_FIELDS,
        email: { active: false, required: true },
      }).success,
    ).toBe(false);
  });
  it('keeps commune and wilaya dependencies reversible', () => {
    const disabled = setCheckoutField(DEFAULT_CHECKOUT_FIELDS, 'state', 'active', false);
    expect(disabled.city).toEqual({ active: false, required: false });
    const enabled = setCheckoutField(disabled, 'city', 'required', true);
    expect(enabled.city).toEqual({ active: true, required: true });
    expect(enabled.state).toEqual({ active: true, required: true });
    expect(checkoutFieldsSchema.parse(enabled)).toEqual(enabled);
  });
  it('drops hidden draft values and requires configured fields for every delivery method', () => {
    let fields = setCheckoutField(DEFAULT_CHECKOUT_FIELDS, 'state', 'active', false);
    fields = setCheckoutField(fields, 'email', 'active', false);
    fields = setCheckoutField(fields, 'homeAddress', 'required', true);
    const form = {
      phoneNumber1: '0550111111',
      firstName: '',
      lastName: '',
      state: 16,
      city: 'Alger',
      homeAddress: '',
      email: 'invalid',
      delivery: 'office',
    };
    expect(missingCheckoutFields(form, fields)).toEqual(['homeAddress']);
    const sanitized = sanitizeCheckoutFields(form, fields);
    expect(sanitized).toMatchObject({ state: null, city: '', email: '', delivery: 'home' });
    expect(missingCheckoutFields(sanitized, fields)).toEqual(['homeAddress']);
  });
});
