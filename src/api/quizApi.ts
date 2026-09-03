import type { QuizQuestion } from '../game/gameTypes';


interface ApiResponseWrapper {
  success?: boolean;
  message?: string | null;
  data?: QuizQuestion[];
}

export class QuizValidationError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'QuizValidationError';
  }
}

function validateQuestions(questions: QuizQuestion[]): void {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new QuizValidationError('Quiz API returned 0 questions.');
  }

  questions.forEach((q, i) => {
    const ctx = `Question ${i + 1}`;
    if (!q.question) {
      throw new QuizValidationError(`${ctx}: missing question/question text.`);
    }
    if (!q.answer) {
      throw new QuizValidationError(`${ctx}: missing answer.`);
    }
    if (!q.options || !Array.isArray(q.options)) {
      throw new QuizValidationError(`${ctx}: options must be present and in array format`);
    }
    while (q.options.length < 4) {
      q.options.push(q.answer)
    }
    if (!q.options.includes(q.answer)) {
      throw new QuizValidationError(`${ctx}: answer "${q.answer}" was not found in options list.`);
    }
  });
}

export async function fetchQuiz(): Promise<QuizQuestion[]> {
  const apiUrl = import.meta.env.VITE_QUIZ_API_URL;

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

  let json: ApiResponseWrapper;
  try {
    json = await res.json();
  } catch {
    throw new Error('Quiz API returned invalid JSON.');
  }

  if (!json.data) {
    throw new Error('Quiz API response contained no question data.');
  }

  if (json.data === undefined || !Array.isArray(json.data)) {
    throw new Error('Quiz API response contained no question data.');
  }

  validateQuestions(json.data);
  return json.data;
}
