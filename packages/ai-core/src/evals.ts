export type AiEvalSurface = 'admin' | 'storefront';
export type AiEvalLocale = 'fr' | 'ar';

export type AiEvalScenario<Input = unknown> = {
  id: string;
  description: string;
  surface: AiEvalSurface;
  locale: AiEvalLocale;
  input: Input;
  expectations: {
    requiredTools?: string[];
    forbiddenTools?: string[];
    exactToolCounts?: Record<string, number>;
    groundedEntityIds?: number[];
    requiredRenderedEntityIds?: number[];
    requiredTerms?: string[];
    forbiddenTerms?: string[];
    minimumAnswerCharacters?: number;
    passThreshold?: number;
  };
};

export type AiEvalTranscript = {
  status: 'completed' | 'failed' | 'cancelled';
  answer: string;
  failureReason?: string;
  toolCalls?: Array<{ name: string; status?: 'completed' | 'failed' }>;
  renderedEntityIds?: number[];
};

export type AiEvalCriterion = {
  name: 'completion' | 'language' | 'tools' | 'grounding' | 'content';
  score: number;
  passed: boolean;
  details: string[];
};

export type AiEvalResult = {
  scenarioId: string;
  score: number;
  passed: boolean;
  hardFailures: string[];
  criteria: AiEvalCriterion[];
};

export type AiEvalSuiteReport = {
  total: number;
  passed: number;
  passRate: number;
  averageScore: number;
  results: AiEvalResult[];
  criteria: Record<
    AiEvalCriterion['name'],
    { evaluated: number; passed: number; passRate: number }
  >;
};

function boundedScore(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalized(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function languageScore(answer: string, locale: AiEvalLocale) {
  const letters = answer.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const arabic = answer.match(/[\p{Script=Arabic}]/gu)?.length ?? 0;
  const arabicRatio = arabic / letters.length;
  return locale === 'ar' ? boundedScore(arabicRatio / 0.55) : boundedScore((1 - arabicRatio) / 0.8);
}

function completionCriterion(transcript: AiEvalTranscript): AiEvalCriterion {
  const passed = transcript.status === 'completed';
  const failureReason = transcript.failureReason?.trim();
  return {
    name: 'completion',
    score: passed ? 1 : 0,
    passed,
    details: passed
      ? []
      : [
          failureReason
            ? `Run ended with ${transcript.status}: ${failureReason}`
            : `Run ended with ${transcript.status}.`,
        ],
  };
}

function toolsCriterion(
  scenario: AiEvalScenario,
  transcript: AiEvalTranscript,
  hardFailures: string[],
): AiEvalCriterion | null {
  const expected = scenario.expectations;
  if (
    !expected.requiredTools?.length &&
    !expected.forbiddenTools?.length &&
    !expected.exactToolCounts
  )
    return null;
  const calls = transcript.toolCalls ?? [];
  const completedCalls = calls.filter((call) => call.status !== 'failed').map((call) => call.name);
  const counts = new Map<string, number>();
  completedCalls.forEach((name) => counts.set(name, (counts.get(name) ?? 0) + 1));
  const details: string[] = [];
  const checks: boolean[] = [];

  for (const name of expected.requiredTools ?? []) {
    const passed = (counts.get(name) ?? 0) > 0;
    checks.push(passed);
    if (!passed) details.push(`Required tool ${name} was not completed.`);
  }
  for (const name of expected.forbiddenTools ?? []) {
    const passed = (counts.get(name) ?? 0) === 0;
    checks.push(passed);
    if (!passed) {
      const failure = `Forbidden tool ${name} was called.`;
      details.push(failure);
      hardFailures.push(failure);
    }
  }
  for (const [name, count] of Object.entries(expected.exactToolCounts ?? {})) {
    const actual = counts.get(name) ?? 0;
    const passed = actual === count;
    checks.push(passed);
    if (!passed) details.push(`Tool ${name} ran ${actual} times; expected ${count}.`);
  }

  const score = checks.length ? checks.filter(Boolean).length / checks.length : 1;
  return { name: 'tools', score, passed: score === 1, details };
}

function groundingCriterion(
  scenario: AiEvalScenario,
  transcript: AiEvalTranscript,
  hardFailures: string[],
): AiEvalCriterion | null {
  const grounded = scenario.expectations.groundedEntityIds;
  const required = scenario.expectations.requiredRenderedEntityIds;
  if (!grounded && !required) return null;
  const rendered = [...new Set(transcript.renderedEntityIds ?? [])];
  const groundedSet = new Set(grounded ?? []);
  const details: string[] = [];
  const checks: boolean[] = [];

  if (grounded) {
    const invented = rendered.filter((id) => !groundedSet.has(id));
    const passed = invented.length === 0;
    checks.push(passed);
    if (!passed) {
      const failure = `Rendered ungrounded entities: ${invented.join(', ')}.`;
      details.push(failure);
      hardFailures.push(failure);
    }
  }
  for (const id of required ?? []) {
    const passed = rendered.includes(id);
    checks.push(passed);
    if (!passed) details.push(`Required grounded entity ${id} was not rendered.`);
  }
  const score = checks.length ? checks.filter(Boolean).length / checks.length : 1;
  return { name: 'grounding', score, passed: score === 1, details };
}

function contentCriterion(
  scenario: AiEvalScenario,
  transcript: AiEvalTranscript,
  hardFailures: string[],
): AiEvalCriterion {
  const answer = normalized(transcript.answer);
  const expected = scenario.expectations;
  const details: string[] = [];
  const checks: boolean[] = [];
  const minimum = expected.minimumAnswerCharacters ?? 20;
  const longEnough = transcript.answer.trim().length >= minimum;
  checks.push(longEnough);
  if (!longEnough) details.push(`Answer has fewer than ${minimum} characters.`);

  for (const term of expected.requiredTerms ?? []) {
    const passed = answer.includes(normalized(term));
    checks.push(passed);
    if (!passed) details.push(`Required term was absent: ${term}.`);
  }
  for (const term of expected.forbiddenTerms ?? []) {
    const passed = !answer.includes(normalized(term));
    checks.push(passed);
    if (!passed) {
      const failure = `Forbidden term appeared: ${term}.`;
      details.push(failure);
      hardFailures.push(failure);
    }
  }
  const score = checks.filter(Boolean).length / checks.length;
  return { name: 'content', score, passed: score === 1, details };
}

export function evaluateAiTranscript(
  scenario: AiEvalScenario,
  transcript: AiEvalTranscript,
): AiEvalResult {
  const hardFailures: string[] = [];
  const language = languageScore(transcript.answer, scenario.locale);
  const criteria: AiEvalCriterion[] = [
    completionCriterion(transcript),
    {
      name: 'language',
      score: language,
      passed: language >= 0.8,
      details: language >= 0.8 ? [] : [`Answer does not consistently use ${scenario.locale}.`],
    },
  ];
  const tools = toolsCriterion(scenario, transcript, hardFailures);
  const grounding = groundingCriterion(scenario, transcript, hardFailures);
  if (tools) criteria.push(tools);
  if (grounding) criteria.push(grounding);
  criteria.push(contentCriterion(scenario, transcript, hardFailures));
  const score = criteria.reduce((sum, criterion) => sum + criterion.score, 0) / criteria.length;
  const threshold = scenario.expectations.passThreshold ?? 0.85;
  return {
    scenarioId: scenario.id,
    score,
    passed: hardFailures.length === 0 && score >= threshold,
    hardFailures,
    criteria,
  };
}

export function summarizeAiEvalResults(results: AiEvalResult[]): AiEvalSuiteReport {
  const names: AiEvalCriterion['name'][] = [
    'completion',
    'language',
    'tools',
    'grounding',
    'content',
  ];
  const criteria = Object.fromEntries(
    names.map((name) => {
      const values = results.flatMap((result) =>
        result.criteria.filter((item) => item.name === name),
      );
      const passed = values.filter((value) => value.passed).length;
      return [
        name,
        {
          evaluated: values.length,
          passed,
          passRate: values.length ? passed / values.length : 1,
        },
      ];
    }),
  ) as AiEvalSuiteReport['criteria'];
  const passed = results.filter((result) => result.passed).length;
  return {
    total: results.length,
    passed,
    passRate: results.length ? passed / results.length : 1,
    averageScore: results.length
      ? results.reduce((sum, result) => sum + result.score, 0) / results.length
      : 1,
    results,
    criteria,
  };
}

export async function runAiEvalSuite<Input>(input: {
  scenarios: AiEvalScenario<Input>[];
  execute: (scenario: AiEvalScenario<Input>) => Promise<AiEvalTranscript>;
  concurrency?: number;
}) {
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 2, 10));
  const results = new Array<AiEvalResult>(input.scenarios.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, input.scenarios.length) }, async () => {
      while (cursor < input.scenarios.length) {
        const index = cursor++;
        const scenario = input.scenarios[index];
        try {
          results[index] = evaluateAiTranscript(scenario, await input.execute(scenario));
        } catch (error) {
          const detail = error instanceof Error ? error.message : 'Unknown eval execution error';
          results[index] = evaluateAiTranscript(scenario, {
            status: 'failed',
            answer: `Evaluation failed: ${detail}`,
            failureReason: detail,
          });
        }
      }
    }),
  );
  return summarizeAiEvalResults(results);
}
