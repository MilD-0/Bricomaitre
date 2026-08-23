import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { strictStructuredOutputSchema } from './structured-output';

describe('strict structured-output schemas', () => {
  it('requires defaulted and nullable fields at every object depth for OpenAI strict mode', async () => {
    const schema = strictStructuredOutputSchema(
      z.object({
        title: z.string(),
        subtitle: z.string().default(''),
        cards: z.array(
          z.object({
            imageUrl: z.string().url().nullable().default(null),
            generatedAt: z.string().datetime(),
            label: z.string(),
          }),
        ),
        slots: z.array(
          z.discriminatedUnion('mode', [
            z.object({ mode: z.literal('keep'), blockId: z.string() }),
            z.object({ mode: z.literal('generate'), blockId: z.string().nullable() }),
          ]),
        ),
      }),
    );

    expect(await schema.jsonSchema).toMatchObject({
      type: 'object',
      required: ['title', 'subtitle', 'cards', 'slots'],
      additionalProperties: false,
      properties: {
        cards: {
          items: {
            type: 'object',
            required: ['imageUrl', 'generatedAt', 'label'],
            additionalProperties: false,
            properties: {
              imageUrl: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              generatedAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        slots: {
          items: {
            anyOf: expect.any(Array),
          },
        },
      },
    });
    expect(JSON.stringify(await schema.jsonSchema)).not.toContain('"oneOf"');
  });

  it('retains Zod parsing, defaults, and validation at the application boundary', async () => {
    const schema = strictStructuredOutputSchema(
      z.object({ title: z.string().min(3), subtitle: z.string().default('') }),
    );

    expect(await schema.validate?.({ title: 'Drill' })).toEqual({
      success: true,
      value: { title: 'Drill', subtitle: '' },
    });
    expect(await schema.validate?.({ title: 'x' })).toMatchObject({ success: false });
  });
});
