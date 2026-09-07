export async function runStorefrontAssistant({ ctx, origin, cart }) {
  await ctx.test(
    'storefront-ai-link-origin',
    'Recorded model-output replay keeps commerce links on the current storefront',
    async ({ page, expect, save }) => {
      // Replay the live demo's actual prose. This tests the renderer without a model call.
      const markdown =
        '**Perceuse à percussion Milwaukee FUEL** — **40 450 DZD**, disponible.\n[Voir le produit](https://bricomaitre.dz/fr/products/catalog-esci-b079nbc7jn)';
      const stream =
        [
          { type: 'status', status: 'thinking' },
          { type: 'text-delta', delta: markdown },
          { type: 'result', products: [], cartMutations: [] },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n';
      await page.route('**/api/ai/chat', (route) =>
        route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: stream }),
      );
      await page.goto(`${origin()}/fr/products`);
      await page.getByRole('button', { name: 'Trouver le bon outil', exact: true }).click();
      const advisor = page.getByRole('dialog', { name: 'Conseiller produits' });
      await advisor
        .getByLabel('Votre question sur les produits')
        .fill(
          'Je cherche une perceuse. Donne une seule option disponible avec son prix exact et un lien.',
        );
      await advisor.getByRole('button', { name: 'Envoyer la question', exact: true }).click();
      const link = advisor.getByRole('link', { name: 'Voir le produit', exact: true });
      await expect(link).toBeVisible();
      const href = await link.getAttribute('href');
      await save('link-replay.json', {
        mode: 'recorded-model-output-replay',
        observedAt: '2026-09-05T19:00:21.758Z',
        observedOrigin: 'http://127.0.0.1:3402',
        currentOrigin: origin(),
        href,
        liveModelCalled: false,
        productionLinkFollowed: false,
      });
      expect(
        new URL(href, origin()).origin,
        'The local demo must not send a shopping customer to production',
      ).toBe(origin());
    },
  );
  await ctx.test(
    'storefront-ai-cart-stream-retry',
    'Injected transport loss after a cart result cannot make retry add the same unit twice',
    async ({ page, context, expect, save }) => {
      const response = await context.request.get(`${origin()}/api/catalog?q=vérification`);
      expect(response.ok()).toBeTruthy();
      const catalog = await response.json();
      const found = catalog.items.find((item) => item.slug === 'qa-drill');
      expect(found, 'The real product supplies the injected model result').toBeTruthy();
      const product = {
        id: found.id,
        token: found.slug,
        title: found.title,
        titleAr: found.titleAr ?? null,
        description: found.description ?? null,
        descriptionAr: found.descriptionAr ?? null,
        price: found.price,
        oldPrice: found.oldPrice ?? null,
        inStock: found.inStock,
        availabilityStatus: found.availabilityStatus,
        imageUrl: found.images?.[0] ?? null,
        brand: 'Bric QA',
        category: null,
      };
      const stream =
        [
          { type: 'text-delta', delta: 'Une perceuse ajoutée au panier.' },
          {
            type: 'result',
            products: [product],
            cartMutations: [{ action: 'add', quantity: 1, product }],
          },
        ]
          .map((event) => JSON.stringify(event))
          .join('\n') + '\n';
      await page.addInitScript(
        ({ body }) => {
          const nativeFetch = window.fetch.bind(window);
          window.__bricGauntletAiCalls = 0;
          window.fetch = async (input, options) => {
            const target =
              typeof input === 'string' || input instanceof URL ? String(input) : input.url;
            if (new URL(target, location.href).pathname !== '/api/ai/chat')
              return nativeFetch(input, options);
            window.__bricGauntletAiCalls += 1;
            if (window.__bricGauntletAiCalls > 1)
              return new Response(body, { headers: { 'content-type': 'application/x-ndjson' } });
            const broken = new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(body));
                setTimeout(
                  () =>
                    controller.error(
                      new TypeError('Injected connection loss after final cart result'),
                    ),
                  200,
                );
              },
            });
            return new Response(broken, { headers: { 'content-type': 'application/x-ndjson' } });
          };
        },
        { body: stream },
      );
      await page.goto(`${origin()}/fr/products/qa-drill`);
      await page.getByRole('button', { name: 'Trouver le bon outil', exact: true }).click();
      const advisor = page.getByRole('dialog', { name: 'Conseiller produits' });
      await advisor
        .getByLabel('Votre question sur les produits')
        .fill('Ajoute une seule perceuse à mon panier.');
      await advisor.getByRole('button', { name: 'Envoyer la question', exact: true }).click();
      await expect.poll(async () => (await cart(page))[0]?.quantity).toBe(1);
      const retry = advisor.getByRole('button', { name: 'Réessayer', exact: true });
      await expect(advisor.locator('.shopping-assistant-conversation')).toHaveAttribute(
        'aria-busy',
        'false',
      );
      await save('after-interruption.json', {
        mode: 'injected-post-result-transport-failure',
        liveModelCalled: false,
        cart: await cart(page),
      });
      if (await retry.count()) {
        await retry.click();
        await expect.poll(() => page.evaluate(() => window.__bricGauntletAiCalls)).toBe(2);
        await expect(advisor.locator('.shopping-assistant-conversation')).toHaveAttribute(
          'aria-busy',
          'false',
        );
      }
      await expect(advisor.locator('.shopping-assistant-cart-updated')).toBeVisible();
      await expect(advisor.locator('.shopping-assistant-error')).toHaveCount(0);
      const finalCart = await cart(page);
      await save('after-retry.json', { cart: finalCart });
      expect(
        finalCart.find((item) => item.productId === found.id)?.quantity,
        'Retry must not duplicate an already applied cart action',
      ).toBe(1);
    },
  );
}
