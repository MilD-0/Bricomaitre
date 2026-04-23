type CheckoutCoreInput = {
  phoneNumber1: string;
  selectedWilayaId: number | null;
  city: string;
};

type CheckoutItemCountInput = {
  cart: boolean;
  cartProducts: string[];
  quantity: number;
};

export function isCheckoutCoreComplete({
  phoneNumber1,
  selectedWilayaId,
  city,
}: CheckoutCoreInput) {
  return (
    phoneNumber1.trim().length > 0 &&
    selectedWilayaId != null &&
    city.trim().length > 0
  );
}

export function getDefaultOptionalDetailsExpanded() {
  return false;
}

export function getAddressHelperKey(delivery: "home" | "office") {
  return delivery === "home" ? "homeAddressHelp" : "officeAddressHelp";
}

export function getCheckoutCartMode(cart: boolean) {
  return cart ? "cart" : "single";
}

export function getCheckoutItemCount({
  cart,
  cartProducts,
  quantity,
}: CheckoutItemCountInput) {
  return cart ? cartProducts.length : quantity;
}
