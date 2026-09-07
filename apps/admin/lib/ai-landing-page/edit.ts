import {
  createAiLanguageModel,
  getAiConfig,
  resolveAiModel,
  strictStructuredOutputSchema,
  type AiConfig,
} from '@bric/ai-core';
import {
  landingPageBlockIdSchema,
  landingPageBlockSchema,
  type LandingPageBlock,
  type LandingPageDocument,
} from '@bric/storefront-core/landing-pages';
import { generateText, Output } from 'ai';
import { blockSchemaFor, normalizeGeneratedLandingPage } from './blocks';
import {
  LANDING_PAGE_GENERATION_INSTRUCTIONS,
  landingPageEditInputSchema,
  landingPageEditPlanSchema,
  type LandingPageEditInput,
  type LandingPageEditPlan,
  type LandingPageEditResult,
  type LandingPageEditSlot,
  type LandingPageEditStageRunner,
  type ParsedLandingPageEditInput,
  type TokenUsage,
} from './contract';
import {
  addUsage,
  attemptLandingPageStage,
  landingPageFailureReason,
  type LandingPageStageAttempt,
} from './stages';

function completeLandingPageEditPlan(plan: LandingPageEditPlan, input: ParsedLandingPageEditInput) {
  const currentDocument = input.currentDocument;
  const currentById = new Map(currentDocument.blocks.map((block) => [block.id, block]));
  const currentIndexById = new Map(
    currentDocument.blocks.map((block, index) => [block.id, index] as const),
  );
  const targetIds = new Set(input.targetBlockIds);
  const deletedIds = new Set(input.deleteBlockIds);
  if (targetIds.size !== input.targetBlockIds.length) {
    throw new Error('Landing-page edit scope contains duplicate target block IDs.');
  }
  if (deletedIds.size !== input.deleteBlockIds.length) {
    throw new Error('Landing-page edit scope contains duplicate deletion block IDs.');
  }
  for (const blockId of [...targetIds, ...deletedIds]) {
    if (!currentById.has(blockId)) {
      throw new Error(`Landing-page edit scope references unknown block "${blockId}".`);
    }
  }
  for (const blockId of targetIds) {
    if (deletedIds.has(blockId))
      throw new Error(`Landing-page edit scope both targets and deletes block "${blockId}".`);
  }
  for (const slot of plan.blocks) {
    if (slot.blockId != null && !currentById.has(slot.blockId)) {
      throw new Error(`Landing-page edit plan references unknown block "${slot.blockId}".`);
    }
    if (!input.allowStructuralChanges && slot.blockId == null) {
      throw new Error('Landing-page edit plan cannot add blocks in a scoped content edit.');
    }
  }

  let blocks = plan.blocks.filter((slot) => slot.blockId == null || !deletedIds.has(slot.blockId));
  if (targetIds.size > 0) {
    blocks = blocks.filter(
      (slot) => slot.mode === 'preserve' || (slot.blockId != null && targetIds.has(slot.blockId)),
    );
  }
  if (!input.allowStructuralChanges) {
    const plannedById = new Map(
      blocks.flatMap((slot) => (slot.blockId == null ? [] : [[slot.blockId, slot] as const])),
    );
    const scopedBlocks: LandingPageEditSlot[] = [];
    for (const block of currentDocument.blocks) {
      if (deletedIds.has(block.id)) continue;
      const planned = plannedById.get(block.id);
      if (!planned || planned.mode === 'preserve') {
        scopedBlocks.push({ mode: 'preserve', blockId: block.id });
        continue;
      }
      if (planned.type !== block.type)
        throw new Error(`Landing-page block "${block.id}" cannot change type in a scoped edit.`);
      scopedBlocks.push(planned);
    }
    blocks = scopedBlocks;
  }

  const referencedIds = new Set(
    blocks.flatMap((slot) => (slot.blockId == null ? [] : [slot.blockId])),
  );
  for (const block of currentDocument.blocks) {
    if (referencedIds.has(block.id) || deletedIds.has(block.id)) continue;
    const currentIndex = currentIndexById.get(block.id)!;
    const nextReferencedIndex = blocks.findIndex((slot) => {
      if (slot.blockId == null) return false;
      const candidateIndex = currentIndexById.get(slot.blockId);
      return candidateIndex !== undefined && candidateIndex > currentIndex;
    });
    blocks.splice(nextReferencedIndex < 0 ? blocks.length : nextReferencedIndex, 0, {
      mode: 'preserve',
      blockId: block.id,
    });
    referencedIds.add(block.id);
  }
  if (blocks.length > 20) {
    throw new Error('Landing-page edit plan exceeds the maximum of 20 retained and new blocks.');
  }

  return {
    ...plan,
    theme: targetIds.size > 0 ? currentDocument.theme : plan.theme,
    seo: targetIds.size > 0 ? currentDocument.seo : plan.seo,
    blocks,
    deletedBlockIds: [...deletedIds],
  };
}

function validateLandingPageEditPlan(
  plan: LandingPageEditPlan & { deletedBlockIds: string[] },
  currentDocument: LandingPageDocument,
) {
  const currentById = new Map(currentDocument.blocks.map((block) => [block.id, block]));
  const deletedIds = new Set(plan.deletedBlockIds);
  const referencedIds = new Set<string>();
  const resolvedTypes: LandingPageBlock['type'][] = [];

  for (const [index, slot] of plan.blocks.entries()) {
    const blockId = slot.blockId;
    if (blockId != null) {
      const existing = currentById.get(blockId);
      if (!existing)
        throw new Error(`Landing-page edit plan references unknown block "${blockId}".`);
      if (deletedIds.has(blockId))
        throw new Error(`Landing-page edit plan both keeps and deletes block "${blockId}".`);
      if (referencedIds.has(blockId))
        throw new Error(`Landing-page edit plan references block "${blockId}" more than once.`);
      referencedIds.add(blockId);
      resolvedTypes.push(slot.mode === 'preserve' ? existing.type : slot.type);
      continue;
    }
    if (slot.mode === 'preserve')
      throw new Error(`Landing-page edit slot ${index + 1} must reference an existing block.`);
    resolvedTypes.push(slot.type);
  }

  if (resolvedTypes.filter((type) => type === 'product-hero').length !== 1)
    throw new Error('Landing-page edit plan must contain exactly one product hero.');
  if (resolvedTypes.filter((type) => type === 'final-cta').length !== 1)
    throw new Error('Landing-page edit plan must contain exactly one final CTA.');
}

function generatedLandingPageBlockId(
  slot: Extract<LandingPageEditSlot, { mode: 'generate' }>,
  index: number,
  usedIds: Set<string>,
) {
  if (slot.blockId) return slot.blockId;
  const base = `ai-${index + 1}-${slot.type}`.slice(0, 76).replace(/-+$/, '');
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base.slice(0, 76 - String(suffix).length)}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return landingPageBlockIdSchema.parse(candidate);
}

function createModelEditStageRunner(config: AiConfig): LandingPageEditStageRunner {
  const model = createAiLanguageModel(config, 'content');
  return {
    async generatePlan(input) {
      const result = await generateText({
        model,
        instructions: `${LANDING_PAGE_GENERATION_INSTRUCTIONS} Return a compact edit plan, not the rewritten document. Preserve unaffected blocks. Use mode preserve with an existing blockId, or mode generate to rewrite or add a block. Keep exactly one product-hero and one final-cta. The supplied edit scope is authoritative; deletion is handled outside the model.`,
        prompt: JSON.stringify({
          product: input.product,
          locale: input.locale,
          instruction: input.instruction,
          editScope: {
            targetBlockIds: input.targetBlockIds,
            allowStructuralChanges: input.allowStructuralChanges,
          },
          currentDocument: input.currentDocument,
        }),
        output: Output.object({
          schema: strictStructuredOutputSchema(landingPageEditPlanSchema),
          name: 'storefront_landing_page_edit_plan',
        }),
        maxRetries: config.maxRetries,
        ...(config.landingPageRequestTimeoutMs
          ? { timeout: config.landingPageRequestTimeoutMs }
          : {}),
      });
      return { plan: landingPageEditPlanSchema.parse(await result.output), usage: result.usage };
    },
    async generateBlock({ editInput, slot, existingBlock, index }) {
      const schema = blockSchemaFor(slot.type);
      const result = await generateText({
        model,
        instructions: `${LANDING_PAGE_GENERATION_INSTRUCTIONS} Write exactly one ${slot.type} block for an existing landing-page edit. Apply only the supplied purpose. Return the block only; its type must be ${slot.type}. Preserve useful verified copy from the existing block when it remains relevant.`,
        prompt: JSON.stringify({
          product: editInput.product,
          locale: editInput.locale,
          operatorInstruction: editInput.instruction,
          blockPurpose: slot.purpose,
          existingBlock,
        }),
        output: Output.object({
          schema: strictStructuredOutputSchema(schema),
          name: `storefront_landing_page_edit_${slot.type.replaceAll('-', '_')}`,
        }),
        maxRetries: config.maxRetries,
        ...(config.landingPageRequestTimeoutMs
          ? { timeout: config.landingPageRequestTimeoutMs }
          : {}),
      });
      const rawBlock = schema.parse(await result.output) as Record<string, unknown>;
      return {
        block: landingPageBlockSchema.parse({
          ...rawBlock,
          id: slot.blockId ?? `generated-${index + 1}-${slot.type}`,
          type: slot.type,
          surface: slot.surface,
          width: slot.width,
        }),
        usage: result.usage,
      };
    },
  };
}

export function createLandingPageEditor(
  config: AiConfig = getAiConfig(),
  stageRunner?: LandingPageEditStageRunner,
) {
  const runner = stageRunner ?? createModelEditStageRunner(config);
  return {
    async edit(rawInput: LandingPageEditInput): Promise<LandingPageEditResult> {
      const input = landingPageEditInputSchema.parse(rawInput);
      const planned = await attemptLandingPageStage(async () => {
        const result = await runner.generatePlan(input);
        const plan = completeLandingPageEditPlan(result.plan, input);
        validateLandingPageEditPlan(plan, input.currentDocument);
        return { ...result, plan };
      });
      if (planned.status === 'rejected') throw planned.reason;
      const { plan, usage: planUsage } = planned.value;

      const currentById = new Map(input.currentDocument.blocks.map((block) => [block.id, block]));
      const usedIds = new Set(input.currentDocument.blocks.map((block) => block.id));
      const usage: TokenUsage = {};
      addUsage(usage, planUsage);
      let retryCount = planned.attempts - 1;
      const settledByIndex = new Map<
        number,
        LandingPageStageAttempt<{ block: LandingPageBlock; usage: TokenUsage }>
      >();

      const generatedSlots = plan.blocks.flatMap((slot, index) =>
        slot.mode === 'generate' ? [{ slot, index }] : [],
      );
      for (let offset = 0; offset < generatedSlots.length; offset += 2) {
        const batch = generatedSlots.slice(offset, offset + 2);
        const settled = await Promise.all(
          batch.map(({ slot, index }) =>
            attemptLandingPageStage(() =>
              runner.generateBlock({
                editInput: input,
                slot,
                existingBlock: slot.blockId ? (currentById.get(slot.blockId) ?? null) : null,
                index,
              }),
            ),
          ),
        );
        settled.forEach((result, index) => {
          settledByIndex.set(batch[index]!.index, result);
        });
      }

      const blocks: LandingPageBlock[] = [];
      const failures: LandingPageEditResult['stages']['failures'] = [];
      let generatedSections = 0;
      let preservedSections = 0;
      let fallbackSections = 0;
      let skippedSections = 0;

      for (const [index, slot] of plan.blocks.entries()) {
        if (slot.mode === 'preserve') {
          blocks.push(currentById.get(slot.blockId)!);
          preservedSections += 1;
          continue;
        }
        const result = settledByIndex.get(index);
        retryCount += (result?.attempts ?? 1) - 1;
        if (result?.status === 'fulfilled') {
          const id = generatedLandingPageBlockId(slot, index, usedIds);
          blocks.push(landingPageBlockSchema.parse({ ...result.value.block, id }));
          addUsage(usage, result.value.usage);
          generatedSections += 1;
          continue;
        }
        const existing = slot.blockId ? currentById.get(slot.blockId) : null;
        if (existing) {
          blocks.push(existing);
          fallbackSections += 1;
          failures.push({
            blockId: existing.id,
            type: slot.type,
            action: 'preserved-existing',
            reason: landingPageFailureReason(result?.status === 'rejected' ? result.reason : null),
          });
        } else {
          skippedSections += 1;
          failures.push({
            blockId: null,
            type: slot.type,
            action: 'skipped-new',
            reason: landingPageFailureReason(result?.status === 'rejected' ? result.reason : null),
          });
        }
      }

      const document = normalizeGeneratedLandingPage(
        {
          schemaVersion: 2,
          theme: plan.theme,
          seo: { ...plan.seo, indexable: false },
          blocks,
        },
        input.product.images,
      );

      return {
        document,
        reasoning: plan.reasoning,
        groundingNotes: plan.groundingNotes,
        usage,
        model: resolveAiModel(config, 'content'),
        stages: {
          status: failures.length ? 'partial-fallback' : 'completed',
          plannedSections: plan.blocks.length,
          generatedSections,
          preservedSections,
          deletedSections: plan.deletedBlockIds.length,
          fallbackSections,
          skippedSections,
          retryCount,
          failures,
        },
      };
    },
  };
}
