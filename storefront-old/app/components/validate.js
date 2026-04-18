export function validateOrderForm(data) {
  const errors = {};

  if (!data.phoneNumber1?.trim()) {
    errors.phoneNumber1 = "Le numéro de téléphone est requis";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}