export type CheckoutLabels = {
  title: string;
  description: string;
  phone: string;
  phonePlaceholder: string;
  phoneError: string;
  lastName: string;
  firstName: string;
  wilaya: string;
  commune: string;
  address: string;
  email: string;
  optional: string;
  deliveryMode: string;
  homeDelivery: string;
  officeDelivery: string;
  officeUnavailable: string;
  orderSummary: string;
  subtotal: string;
  delivery: string;
  total: string;
  quantity: string;
  submit: string;
  submitting: string;
  emptyTitle: string;
  emptyBody: string;
  browseProducts: string;
  requiredError: string;
  emailError: string;
  submitError: string;
  retry: string;
  savedAttempt: string;
  trustPhone: string;
  trustPayment: string;
  trustDelivery: string;
};

export function buildCheckoutLabels(
  translate: (key: keyof CheckoutLabels) => string,
): CheckoutLabels {
  return {
    title: translate('title'),
    description: translate('description'),
    phone: translate('phone'),
    phonePlaceholder: translate('phonePlaceholder'),
    phoneError: translate('phoneError'),
    lastName: translate('lastName'),
    firstName: translate('firstName'),
    wilaya: translate('wilaya'),
    commune: translate('commune'),
    address: translate('address'),
    email: translate('email'),
    optional: translate('optional'),
    deliveryMode: translate('deliveryMode'),
    homeDelivery: translate('homeDelivery'),
    officeDelivery: translate('officeDelivery'),
    officeUnavailable: translate('officeUnavailable'),
    orderSummary: translate('orderSummary'),
    subtotal: translate('subtotal'),
    delivery: translate('delivery'),
    total: translate('total'),
    quantity: translate('quantity'),
    submit: translate('submit'),
    submitting: translate('submitting'),
    emptyTitle: translate('emptyTitle'),
    emptyBody: translate('emptyBody'),
    browseProducts: translate('browseProducts'),
    requiredError: translate('requiredError'),
    emailError: translate('emailError'),
    submitError: translate('submitError'),
    retry: translate('retry'),
    savedAttempt: translate('savedAttempt'),
    trustPhone: translate('trustPhone'),
    trustPayment: translate('trustPayment'),
    trustDelivery: translate('trustDelivery'),
  };
}
