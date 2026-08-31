import type { QuizQuestion } from '../game/gameTypes';

// ─────────────────────────────────────────────────────────────────
//  Custom Quiz API Types
// ─────────────────────────────────────────────────────────────────
type StringOrLabeled = string | { label?: string; value?: string; text?: string };

interface RawApiQuestion {
  prompt?: StringOrLabeled;
  question?: StringOrLabeled;
  word?: StringOrLabeled;
  answer?: StringOrLabeled;
  correct_answer?: StringOrLabeled;
  correctAnswer?: StringOrLabeled;
  hint?: StringOrLabeled;
  options?: (string | { label?: string; value?: string; text?: string })[];
  choices?: (string | { label?: string; value?: string; text?: string })[];
}

interface ApiResponseWrapper {
  success?: boolean;
  message?: string | null;
  data?: RawApiQuestion[] | { questions?: RawApiQuestion[]; data?: RawApiQuestion[] };
  questions?: RawApiQuestion[];
}

// ─────────────────────────────────────────────────────────────────
//  Validation Error Class
// ─────────────────────────────────────────────────────────────────
export class QuizValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'QuizValidationError';
  }
}

// ─────────────────────────────────────────────────────────────────
//  String Extraction Helper (handles string or { value: '...' })
// ─────────────────────────────────────────────────────────────────
function extractString(val: unknown): string {
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.value === 'string') return obj.value.trim();
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.label === 'string') return obj.label.trim();
    if (typeof obj.name === 'string') return obj.name.trim();
  }
  return '';
}

// ─────────────────────────────────────────────────────────────────
//  Normalize Raw Item to QuizQuestion
// ─────────────────────────────────────────────────────────────────
function normalizeQuestionItem(item: RawApiQuestion, index: number): QuizQuestion {
  const promptStr =
    extractString(item.prompt) ||
    extractString(item.question) ||
    extractString(item.word);

  const answerStr =
    extractString(item.answer) ||
    extractString(item.correct_answer) ||
    extractString(item.correctAnswer);

  const rawHint = extractString(item.hint);
  const hintStr = rawHint || `Identify the correct target for: ${promptStr || `Q${index + 1}`}`;

  const rawOptions = item.options || item.choices || [];
  const optionsStr: string[] = rawOptions.map(extractString).filter((s) => s.length > 0);

  return {
    prompt: promptStr,
    hint: hintStr,
    options: optionsStr,
    answer: answerStr,
  };
}

// ─────────────────────────────────────────────────────────────────
//  Validate questions
// ─────────────────────────────────────────────────────────────────
function validateQuestions(questions: QuizQuestion[]): void {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new QuizValidationError('Quiz API returned 0 questions.');
  }

  questions.forEach((q, i) => {
    const ctx = `Question ${i + 1}`;
    if (!q.prompt) {
      throw new QuizValidationError(`${ctx}: missing prompt/question text.`);
    }
    if (!q.answer) {
      throw new QuizValidationError(`${ctx}: missing answer.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new QuizValidationError(`${ctx}: must have at least 2 options (found ${q.options?.length ?? 0}).`);
    }
    if (!q.options.includes(q.answer)) {
      throw new QuizValidationError(`${ctx}: answer "${q.answer}" was not found in options list.`);
    }
  });
}

// ─────────────────────────────────────────────────────────────────
//  Public fetchQuiz Function
// ─────────────────────────────────────────────────────────────────
export async function fetchQuiz(): Promise<QuizQuestion[]> {
  const apiUrl = import.meta.env.VITE_QUIZ_API_URL as string | undefined;

  if (!apiUrl || !apiUrl.trim()) {
    throw new Error('VITE_QUIZ_API_URL is not configured in .env');
  }

  let res: Response;
  try {
    res = await fetch(apiUrl.trim(), {
      signal: AbortSignal.timeout(12_000),
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error('Quiz API request timed out. Please check your connection.');
    }
    throw new Error(`Failed to fetch quiz from API: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    throw new Error(`Quiz API returned HTTP error ${res.status} (${res.statusText})`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('Quiz API returned invalid JSON.');
  }

  // ── Extract raw question list ───────────────────────────────────
  let rawList: RawApiQuestion[] = [];

  if (Array.isArray(json)) {
    rawList = json as RawApiQuestion[];
  } else if (json && typeof json === 'object') {
    const wrapper = json as ApiResponseWrapper;

    if (Array.isArray(wrapper.data)) {
      rawList = wrapper.data;
    } else if (wrapper.data && typeof wrapper.data === 'object') {
      if (Array.isArray(wrapper.data.questions)) {
        rawList = wrapper.data.questions;
      } else if (Array.isArray(wrapper.data.data)) {
        rawList = wrapper.data.data;
      }
    } else if (Array.isArray(wrapper.questions)) {
      rawList = wrapper.questions;
    }
  }

  if (!rawList || rawList.length === 0) {
    throw new Error('Quiz API response contained no question data.');
  }

  // Normalize and validate
  const questions: QuizQuestion[] = rawList.map((item, idx) =>
    normalizeQuestionItem(item, idx)
  );

  validateQuestions(questions);
  return questions;
}
