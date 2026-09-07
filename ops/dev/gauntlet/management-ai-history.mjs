export async function runManagementAiHistory({ ctx, createProduct, api, ok, publicProduct, name }) {
  await ctx.test(
    'management-ai-approve',
    'AI proposal approval enforces catalog permissions, applies once and reaches the public catalog',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'ai approval');
      const description = `Approved content ${ctx.runId}`;
      const proposalId = ctx.seedContentProposal(product.id, description);
      for (const user of ['demo-viewer', 'demo-amine']) {
        await ctx.loginAs(context, user);
        const denied = await api(context.request, `/api/ai/proposals/${proposalId}`, {
          method: 'PATCH',
          data: { action: 'approve' },
        });
        expect(denied.status).toBe(403);
      }
      await context.clearCookies();
      await ctx.loginAdmin(page);
      const applied = ok(
        await api(context.request, `/api/ai/proposals/${proposalId}`, {
          method: 'PATCH',
          data: { action: 'approve' },
        }),
        expect,
      );
      expect(applied.proposal.status).toBe('applied');
      expect(applied.proposal.verified).toBe(true);
      const replay = await api(context.request, `/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        data: { action: 'approve' },
      });
      expect(replay.status).toBe(409);
      expect(replay.body.code).toBe('proposal_already_reviewed');
      await expect
        .poll(
          async () =>
            (await (await publicProduct(context.request, product)).json()).item.description,
        )
        .toBe(description);
      const rows = ctx.query(
        `SELECT json_build_object('status',status,'reviewedBy',reviewed_by,'appliedAt',applied_at)::text FROM ai_proposals WHERE id=${proposalId}`,
      );
      expect(rows).toContain('operator@demo.bricomaitre.invalid');
      save('ai-approval', { proposalId, productId: product.id, applied, replay, rows });
    },
  );
  await ctx.test(
    'management-ai-stale',
    'A stale AI proposal cannot overwrite newer operator edits',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'ai stale');
      const proposalId = ctx.seedContentProposal(product.id, 'Obsolete generated description');
      const description = `Operator correction ${ctx.runId}`;
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PUT',
          data: { ...product.payload, description },
        }),
        expect,
      );
      const stale = await api(context.request, `/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        data: { action: 'approve' },
      });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('proposal_stale');
      expect(
        ok(await api(context.request, `/api/products/${product.id}`), expect).item.description,
      ).toBe(description);
      save('ai-stale', { proposalId, productId: product.id, stale });
    },
  );
  await ctx.test(
    'management-ai-reject',
    'Rejecting an AI proposal records the decision and prevents later approval',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'ai rejection');
      const proposalId = ctx.seedContentProposal(
        product.id,
        'This content must never reach customers',
      );
      const rejected = ok(
        await api(context.request, `/api/ai/proposals/${proposalId}`, {
          method: 'PATCH',
          data: { action: 'reject' },
        }),
        expect,
      );
      expect(rejected.proposal.status).toBe('rejected');
      const laterApproval = await api(context.request, `/api/ai/proposals/${proposalId}`, {
        method: 'PATCH',
        data: { action: 'approve' },
      });
      expect(laterApproval.status).toBe(409);
      const productAfter = ok(
        await api(context.request, `/api/products/${product.id}`),
        expect,
      ).item;
      expect(productAfter.description).toBe(product.payload.description);
      save('ai-rejection', { proposalId, productId: product.id, rejected, laterApproval });
    },
  );
  await ctx.test(
    'management-history-undo',
    'Catalog audit history undoes and redoes an edit with public values restored',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const product = await createProduct(context.request, expect, 'undo');
      ok(
        await api(context.request, `/api/products/${product.id}`, {
          method: 'PUT',
          data: { ...product.payload, price: 8350 },
        }),
        expect,
      );
      const history = ok(
        await api(
          context.request,
          `/api/action-history?resource=products&operation=update&search=${encodeURIComponent(product.title)}&limit=50`,
        ),
        expect,
      );
      const entry = history.items.find((item) => Number(item.entityId) === product.id);
      expect(entry, 'Product price edit must have a reversible history record').toBeTruthy();
      expect(entry.isReversible).toBe(true);
      const undo = ok(
        await api(context.request, `/api/action-history/${entry.id}/undo`, { method: 'POST' }),
        expect,
      );
      expect(
        Number(ok(await api(context.request, `/api/products/${product.id}`), expect).item.price),
      ).toBe(product.payload.price);
      await expect
        .poll(async () =>
          Number((await (await publicProduct(context.request, product)).json()).item.price),
        )
        .toBe(product.payload.price);
      const redo = ok(
        await api(context.request, `/api/action-history/${entry.id}/redo`, { method: 'POST' }),
        expect,
      );
      expect(
        Number(ok(await api(context.request, `/api/products/${product.id}`), expect).item.price),
      ).toBe(8350);
      await expect
        .poll(async () =>
          Number((await (await publicProduct(context.request, product)).json()).item.price),
        )
        .toBe(8350);
      save('history-undo-redo', { productId: product.id, entry, undo, redo });
    },
  );
  await ctx.test(
    'management-operating-cost',
    'Manual operating cost creation, edit and deletion change the reporting total exactly once',
    async ({ page, context, expect, save }) => {
      await ctx.loginAdmin(page);
      const date = new Date().toISOString().slice(0, 10);
      const reportPath = `/api/stats/profit-tracker?range=custom&startDate=${date}&endDate=${date}`;
      const report = async () => ok(await api(context.request, reportPath), expect).data;
      const before = await report();
      const data = {
        name: name('cost'),
        amountDzd: 1375,
        period: 'once',
        startDate: date,
        endDate: null,
      };
      const created = ok(
        await api(context.request, '/api/stats/profit-tracker/costs', { method: 'POST', data }),
        expect,
      ).data;
      let removed = false;
      try {
        const afterCreate = await report();
        ok(
          await api(context.request, `/api/stats/profit-tracker/costs/${created.id}`, {
            method: 'PUT',
            data: { ...data, amountDzd: 2125 },
          }),
          expect,
        );
        const afterEdit = await report();
        ok(
          await api(context.request, `/api/stats/profit-tracker/costs/${created.id}`, {
            method: 'DELETE',
          }),
          expect,
        );
        removed = true;
        const afterDelete = await report();
        save('cost-lifecycle', {
          id: created.id,
          date,
          before: before.summary,
          afterCreate: afterCreate.summary,
          afterEdit: afterEdit.summary,
          afterDelete: afterDelete.summary,
        });
        expect(afterCreate.summary.operatingCostDzd - before.summary.operatingCostDzd).toBe(1375);
        expect(afterEdit.summary.operatingCostDzd - before.summary.operatingCostDzd).toBe(2125);
        expect(afterDelete.summary.operatingCostDzd).toBe(before.summary.operatingCostDzd);
        expect(afterDelete.costs.some((item) => item.id === created.id)).toBe(false);
      } finally {
        if (!removed)
          await api(context.request, `/api/stats/profit-tracker/costs/${created.id}`, {
            method: 'DELETE',
          });
      }
    },
  );
}
