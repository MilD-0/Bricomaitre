import { asSchema, zodSchema } from 'ai';
import { describe, expect, it } from 'vitest';

import { adminAiInventoryAdjustmentSchema } from './admin-ai-inventory';
import { buildAdminAiTools } from './admin-ai-tools';
import { permissionCatalog } from './permissions';

describe('Admin AI production tool schemas', () => {
  it('serializes the registered live tool inputs to provider-compatible JSON Schema', async () => {
    const tools = buildAdminAiTools({
      permissions: permissionCatalog,
      locale: 'en',
      runtime: {
        kind: 'live',
        exportOwnerKey: 'authenticated-user-id',
        actorId: 'schema-test',
        actor: {},
        conversationId: 1,
        autoAcceptProposals: false,
      },
    });
    for (const [name, tool] of Object.entries(tools)) {
      const serialized = JSON.stringify(await asSchema(tool.inputSchema).jsonSchema);
      expect(serialized, name).not.toMatch(/\(\?[=!<]/u);
    }
  });

  it('tells the model that inventory quantity is a delta rather than a final level', () => {
    const jsonSchema = zodSchema(adminAiInventoryAdjustmentSchema).jsonSchema as {
      properties: {
        items: { items: { properties: { quantity: { description?: string } } } };
      };
    };

    expect(jsonSchema.properties.items.items.properties.quantity.description).toContain('delta');
    expect(jsonSchema.properties.items.items.properties.quantity.description).toContain('never');
  });
});
