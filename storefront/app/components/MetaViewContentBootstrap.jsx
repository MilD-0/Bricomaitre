function getMetaContentId(product) {
  if (!product || typeof product !== "object") {
    return null;
  }

  const candidates = [product.id, product._id, product.slug];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" && typeof candidate !== "number") {
      continue;
    }

    const value = String(candidate).trim();
    if (value && value !== "undefined" && value !== "null") {
      return value;
    }
  }

  return null;
}

function buildMetaCommerceData(product) {
  const id = getMetaContentId(product);
  if (!id) {
    return null;
  }

  const price =
    typeof product?.price === "number" && Number.isFinite(product.price)
      ? product.price
      : Number(product?.price ?? 0);

  return {
    productKey: id,
    pixelData: {
      content_ids: [id],
      contents: [
        {
          id,
          quantity: 1,
          item_price: price,
        },
      ],
      content_type: "product",
      value: price,
      currency: "DZD",
    },
  };
}

export default function MetaViewContentBootstrap({ product }) {
  const payload = buildMetaCommerceData(product);

  if (!payload) {
    return null;
  }

  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          (function() {
            var eventId =
              window.crypto && typeof window.crypto.randomUUID === 'function'
                ? window.crypto.randomUUID()
                : String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12);
            window.__bricInitialViewContent = {
              eventId: eventId,
              productKey: ${JSON.stringify(payload.productKey)}
            };
            if (typeof window.fbq === 'function') {
              window.fbq('track', 'ViewContent', ${JSON.stringify(payload.pixelData)}, { eventID: eventId });
            }
          })();
        `,
      }}
    />
  );
}
