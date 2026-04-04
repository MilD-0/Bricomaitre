const FREE_SHIPPING_PRODUCT_ID = "f00000000000000000000005";

const DELIVERY_PRICES_BY_CODE = {
  1: { office: 850, home: 1500 },
  2: { office: 400, home: 700 },
  3: { office: 500, home: 900 },
  4: { office: 400, home: 720 },
  5: { office: 400, home: 750 },
  6: { office: 450, home: 750 },
  7: { office: 500, home: 900 },
  8: { office: 700, home: 1100 },
  9: { office: 400, home: 580 },
  10: { office: 400, home: 680 },
  11: { office: 1200, home: 1900 },
  12: { office: 450, home: 750 },
  13: { office: 400, home: 750 },
  14: { office: 450, home: 800 },
  15: { office: 400, home: 680 },
  16: { office: 350, home: 400 },
  17: { office: 500, home: 900 },
  18: { office: 400, home: 720 },
  19: { office: 400, home: 720 },
  20: { office: 550, home: 850 },
  21: { office: 400, home: 720 },
  22: { office: 400, home: 720 },
  23: { office: 400, home: 750 },
  24: { office: 450, home: 800 },
  25: { office: 400, home: 720 },
  26: { office: 400, home: 680 },
  27: { office: 400, home: 700 },
  28: { office: 400, home: 780 },
  29: { office: 400, home: 720 },
  30: { office: 600, home: 1000 },
  31: { office: 400, home: 720 },
  32: { office: 700, home: 1100 },
  33: { office: 1400, home: 2000 },
  34: { office: 400, home: 750 },
  35: { office: 400, home: 580 },
  36: { office: 450, home: 800 },
  37: { office: 950, home: 1600 },
  38: { office: 450, home: 720 },
  39: { office: 600, home: 1000 },
  40: { office: 450, home: 800 },
  41: { office: 450, home: 800 },
  42: { office: 400, home: 580 },
  43: { office: 400, home: 720 },
  44: { office: 400, home: 750 },
  45: { office: 700, home: 1100 },
  46: { office: 450, home: 750 },
  47: { office: 600, home: 1000 },
  48: { office: 450, home: 720 },
  49: { office: 850, home: 1500 },
  51: { office: 650, home: 900 },
  52: { office: 0, home: 1200 },
  53: { office: 1500, home: 2000 },
  55: { office: 600, home: 1000 },
  56: { office: 0, home: 2500 },
  57: { office: 0, home: 1000 },
  58: { office: 650, home: 1100 },
};

const STATE_TO_CODE = {
  Adrar: 1,
  Chlef: 2,
  Laghouat: 3,
  "Oum El Bouaghi": 4,
  Batna: 5,
  "Béjaïa": 6,
  Bejaia: 6,
  Biskra: 7,
  "Béchar": 8,
  Bechar: 8,
  Blida: 9,
  "Bouïra": 10,
  Bouira: 10,
  Tamanrasset: 11,
  "Tébessa": 12,
  Tebessa: 12,
  Tlemcen: 13,
  Tiaret: 14,
  "Tizi Ouzou": 15,
  Alger: 16,
  Djelfa: 17,
  Jijel: 18,
  "Sétif": 19,
  Setif: 19,
  "Saïda": 20,
  Saida: 20,
  Skikda: 21,
  "Sidi Bel Abbès": 22,
  "Sidi Bel Abbes": 22,
  Annaba: 23,
  Guelma: 24,
  Constantine: 25,
  "Médéa": 26,
  Medea: 26,
  Mostaganem: 27,
  Msila: 28,
  "M'Sila": 28,
  Mascara: 29,
  Ouargla: 30,
  Oran: 31,
  "El Bayadh": 32,
  Illizi: 33,
  "Bordj Bou Arreridj": 34,
  "Bordj Bou Arréridj": 34,
  "Boumerdès": 35,
  Boumerdes: 35,
  "El Tarf": 36,
  Tindouf: 37,
  Tissemsilt: 38,
  "El Oued": 39,
  Khenchela: 40,
  "Souk Ahras": 41,
  Tipaza: 42,
  Mila: 43,
  "Aïn Defla": 44,
  "Ain Defla": 44,
  "Naâma": 45,
  Naama: 45,
  "Aïn Témouchent": 46,
  "Ain Temouchent": 46,
  "Ghardaïa": 47,
  Ghardaia: 47,
  Relizane: 48,
  Timimoun: 49,
  "Bordj Badji Mokhtar": 50,
  "Ouled Djellal": 51,
  "Béni Abbès": 52,
  "Beni Abbes": 52,
  "In Salah": 53,
  "In Guezzam": 54,
  Touggourt: 55,
  Djanet: 56,
  "El Mghair": 57,
  "El M'Ghair": 57,
  "El Meniaa": 58,
};

function qualifiesForFreeShipping(order) {
  if (
    order.cartProducts &&
    order.cartProducts.length > 0 &&
    order.cartProducts.every((productId) => productId === FREE_SHIPPING_PRODUCT_ID)
  ) {
    return true;
  }

  return false;
}

function normalizeStateCode(state) {
  if (typeof state === "number" && Number.isInteger(state)) {
    return state;
  }

  if (typeof state === "string") {
    const trimmed = state.trim();

    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }

    return STATE_TO_CODE[trimmed] ?? null;
  }

  return null;
}

function calculatePriceFromCode(order) {
  if (qualifiesForFreeShipping(order)) {
    order.del_pr = 0;
    return 0;
  }

  const stateCode = normalizeStateCode(order.state);
  const delivery = order.delivery;

  if (stateCode === null || !DELIVERY_PRICES_BY_CODE[stateCode]) {
    console.error(`State "${order.state}" not found in delivery prices`);
    return null;
  }

  const pricing = DELIVERY_PRICES_BY_CODE[stateCode];

  if (pricing[delivery] === undefined) {
    console.error(
      `Delivery type "${delivery}" not available for state "${order.state}"`
    );
    return null;
  }

  const price = pricing[delivery];
  order.del_pr = price;

  return price;
}

export function calculateDeliveryPrice(order) {
  return calculatePriceFromCode(order);
}

export function calculateDeliveryPrice2(order) {
  return calculatePriceFromCode(order);
}

export function getCodeFromState(state) {
  return normalizeStateCode(state);
}
