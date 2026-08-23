import { jsonSchema, type Schema } from 'ai';
import { z } from 'zod';

type JsonSchemaNode = Record<string, unknown>;
const openAiStructuredOutputFormats = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'ipv4',
  'ipv6',
  'uuid',
]);

function isJsonSchemaNode(value: unknown): value is JsonSchemaNode {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function requireEveryObjectProperty(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(requireEveryObjectProperty);
    return;
  }
  if (!isJsonSchemaNode(value)) return;

  const properties = value.properties;
  if (value.type === 'object' && isJsonSchemaNode(properties)) {
    value.required = Object.keys(properties);
    value.additionalProperties = false;
  }
  if (typeof value.format === 'string' && !openAiStructuredOutputFormats.has(value.format)) {
    delete value.format;
  }
  if (Array.isArray(value.oneOf)) {
    value.anyOf = value.oneOf;
    delete value.oneOf;
  }
  Object.values(value).forEach(requireEveryObjectProperty);
}

/**
 * Converts a Zod schema into the strict JSON Schema shape required by OpenAI.
 * Zod defaults remain useful to application callers, but OpenAI strict output
 * requires every declared property—even one with a default—to appear in the
 * generated object. It also emits only supported string formats and converts
 * Zod's nested `oneOf` discriminated unions to the supported `anyOf` form.
 * Validation still runs through the original Zod schema, so omitted provider
 * annotations such as `format: uri` remain enforced before generated content
 * reaches the application.
 */
export function strictStructuredOutputSchema<Output>(schema: z.ZodType<Output>): Schema<Output> {
  const converted = z.toJSONSchema(schema, { target: 'draft-7' }) as JsonSchemaNode;
  requireEveryObjectProperty(converted);
  return jsonSchema<Output>(converted, {
    validate(value) {
      const parsed = schema.safeParse(value);
      return parsed.success
        ? { success: true, value: parsed.data }
        : { success: false, error: parsed.error };
    },
  });
}
