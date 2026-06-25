function getMetaContentId(product) {
  if (!product || typeof product !== "object") {
    return null;
  }
  return typeof product.id === "number"
    && Number.isInteger(product.id)
    && product.id > 0
      ? String(product.id)
      : null;
}

function buildMetaCommerceData(product, effectivePrice) {
  const id = getMetaContentId(product);
  if (!id) {
    return null;
  }

  const rawPrice = effectivePrice ?? product?.price;
  const price =
    typeof rawPrice === "number" && Number.isFinite(rawPrice)
      ? rawPrice
      : Number(rawPrice ?? 0);

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

export default function MetaViewContentBootstrap({ product, effectivePrice }) {
  const payload = buildMetaCommerceData(product, effectivePrice);

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
              productKey: ${JSON.stringify(payload.productKey)},
              browserEventSent: false
            };
            if (typeof window.fbq === 'function') {
              window.fbq('track', 'ViewContent', ${JSON.stringify(payload.pixelData)}, { eventID: eventId });
              window.__bricInitialViewContent.browserEventSent = true;
            }
          })();
        `,
      }}
    />
  );
}
