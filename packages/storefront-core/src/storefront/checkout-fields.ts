import { z } from 'zod';

export const checkoutFieldNames = [
  'phoneNumber1',
  'lastName',
  'firstName',
  'state',
  'city',
  'homeAddress',
  'email',
] as const;
export type CheckoutFieldName = (typeof checkoutFieldNames)[number];
const fieldSchema = z.strictObject({ active: z.boolean(), required: z.boolean() });
export const DEFAULT_CHECKOUT_FIELDS = {
  phoneNumber1: { active: true, required: true },
  lastName: { active: true, required: false },
  firstName: { active: true, required: false },
  state: { active: true, required: true },
  city: { active: true, required: true },
  homeAddress: { active: true, required: false },
  email: { active: true, required: false },
};
export const checkoutFieldsSchema = z
  .strictObject({
    phoneNumber1: fieldSchema,
    lastName: fieldSchema,
    firstName: fieldSchema,
    state: fieldSchema,
    city: fieldSchema,
    homeAddress: fieldSchema,
    email: fieldSchema,
  })
  .superRefine((fields, ctx) => {
    const issue = (field: CheckoutFieldName, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message });
    for (const name of checkoutFieldNames) {
      if (fields[name].required && !fields[name].active)
        issue(name, 'Required fields must be active.');
    }
    if (!fields.phoneNumber1.active || !fields.phoneNumber1.required)
      issue('phoneNumber1', 'Phone is always required for order confirmation.');
    if (fields.city.active && !fields.state.active)
      issue('city', 'Commune requires an active wilaya.');
    if (fields.city.required && !fields.state.required)
      issue('city', 'A required commune requires a required wilaya.');
  });
export type CheckoutFields = z.infer<typeof checkoutFieldsSchema>;

export function setCheckoutField(
  fields: CheckoutFields,
  name: CheckoutFieldName,
  option: 'active' | 'required',
  value: boolean,
): CheckoutFields {
  const next = structuredClone(fields);
  if (name === 'phoneNumber1') return next;
  next[name][option] = value;
  if (option === 'required' && value) next[name].active = true;
  if (option === 'active' && !value) next[name].required = false;
  if (name === 'state') {
    if (!next.state.active) next.city = { active: false, required: false };
    if (!next.state.required) next.city.required = false;
  }
  if (name === 'city') {
    if (next.city.active) next.state.active = true;
    if (next.city.required) next.state.required = true;
  }
  return next;
}

// Also used before validating browser drafts, so hidden stale values cannot block submission.
export function sanitizeCheckoutFields<
  T extends Record<CheckoutFieldName, unknown> & { delivery: unknown },
>(input: T, fields: CheckoutFields): T {
  const result = { ...input };
  for (const name of checkoutFieldNames) {
    if (!fields[name].active) Object.assign(result, { [name]: name === 'state' ? null : '' });
  }
  if (!result.state)
    Object.assign(result, {
      city: '',
      delivery: input.delivery === 'office' ? 'home' : input.delivery === 1 ? 0 : input.delivery,
    });
  return result;
}

export function missingCheckoutFields(
  input: Record<CheckoutFieldName, unknown> & { delivery: unknown },
  fields: CheckoutFields,
) {
  return checkoutFieldNames.filter((name) => {
    if (!fields[name].required) return false;
    const value = input[name];
    return value == null || (typeof value === 'string' && !value.trim());
  });
}
