// ─────────────────────────────────────────────────────────────────
//  GAME TYPES — shared TypeScript interfaces and enums
// ─────────────────────────────────────────────────────────────────

/** All possible game phases — explicit state machine */
export type GamePhase =
  | 'loading'
  | 'error'
  | 'ready'
  | 'countdown'
  | 'playing'
  | 'aiming'
  | 'firing'
  | 'resolving'
  | 'paused'
  | 'hint'
  | 'game-over';

/** Result of a single shot */
export type ShotResult = 'correct' | 'wrong' | 'miss' | null;

/** Projectile lifecycle */
export type ProjectilePhase =
  | 'idle'
  | 'fired'
  | 'flying'
  | 'hit'
  | 'terrain-hit'
  | 'resolved';

/** Enemy tank lifecycle */
export type TankLifecycle = 'active' | 'hit' | 'exploding' | 'destroyed';

/** Metadata carried by each answer target tank */
export interface TankTarget {
  id: string;
  optionIndex: number;
  optionText: string;
  isCorrect: boolean;
}

/** Normalized quiz question */
export interface QuizQuestion {
  prompt: string;
  hint: string;
  options: string[];    // exactly 4
  answer: string;       // must be one of options
}

/** Top-level application game state (React-owned) */
export interface GameState {
  phase: GamePhase;

  questions: QuizQuestion[];
  currentQuestionIndex: number;

  score: number;
  streak: number;
  bestStreak: number;

  lastResult: ShotResult;
  lastCorrectAnswer: string | null;

  hintVisible: boolean;
  muted: boolean;

  /** Incremented each question — guards against stale projectile resolves */
  questionSessionId: number;

  errorMessage: string | null;
}

/** Initial game state */
export const INITIAL_GAME_STATE: GameState = {
  phase: 'loading',
  questions: [],
  currentQuestionIndex: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  lastResult: null,
  lastCorrectAnswer: null,
  hintVisible: false,
  muted: false,
  questionSessionId: 0,
  errorMessage: null,
};
