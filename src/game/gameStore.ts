import { create } from 'zustand';
import { GAME_CONFIG } from './gameConfig';
import type { GameState, GamePhase, ShotResult, QuizQuestion } from './gameTypes';
import { INITIAL_GAME_STATE } from './gameTypes';

interface GameStore extends GameState {
  // Phase transitions
  setPhase: (phase: GamePhase) => void;

  // Quiz data
  setQuestions: (questions: QuizQuestion[]) => void;

  // Shot resolution
  resolveShot: (result: ShotResult, correctAnswer: string) => void;

  // Progression
  advanceQuestion: () => void;

  // Controls
  toggleMute: () => void;
  setHintVisible: (v: boolean) => void;

  // Game flow
  startCountdown: () => void;
  restartGame: () => void;
  newGame: () => void;
  setError: (msg: string) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...INITIAL_GAME_STATE,

  // ── Phase ──────────────────────────────────────────────────────
  setPhase: (phase) => set({ phase }),

  // ── Quiz data ──────────────────────────────────────────────────
  setQuestions: (questions) =>
    set({ questions, currentQuestionIndex: 0, phase: 'ready' }),

  // ── Shot resolution ────────────────────────────────────────────
  resolveShot: (result, correctAnswer) => {
    const { score, streak, bestStreak } = get();
    const delta =
      result === 'correct'
        ? GAME_CONFIG.scoring.correct
        : result === 'wrong'
        ? GAME_CONFIG.scoring.wrong
        : GAME_CONFIG.scoring.miss;

    const newScore = Math.max(0, score + delta);
    const newStreak = result === 'correct' ? streak + 1 : 0;
    const newBest = Math.max(bestStreak, newStreak);

    set({
      phase: 'resolving',
      lastResult: result,
      lastCorrectAnswer: correctAnswer,
      score: newScore,
      streak: newStreak,
      bestStreak: newBest,
    });
  },

  // ── Advance question ────────────────────────────────────────────
  advanceQuestion: () => {
    const { currentQuestionIndex, questions } = get();
    const next = currentQuestionIndex + 1;
    if (next >= questions.length) {
      set({ phase: 'game-over' });
    } else {
      set({
        currentQuestionIndex: next,
        lastResult: null,
        lastCorrectAnswer: null,
        hintVisible: false,
        phase: 'playing',
        questionSessionId: get().questionSessionId + 1,
      });
    }
  },

  // ── Controls ────────────────────────────────────────────────────
  toggleMute: () => {
    const muted = !get().muted;
    set({ muted });
    localStorage.setItem('tankTrivia_muted', String(muted));
  },

  setHintVisible: (v) => set({ hintVisible: v }),

  // ── Game flow ───────────────────────────────────────────────────
  startCountdown: () => set({ phase: 'countdown' }),

  restartGame: () =>
    set({
      phase: 'countdown',
      currentQuestionIndex: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      lastResult: null,
      lastCorrectAnswer: null,
      hintVisible: false,
      questionSessionId: 0,
    }),

  newGame: () =>
    set({
      ...INITIAL_GAME_STATE,
      muted: get().muted,
      phase: 'loading',
    }),

  setError: (msg) => set({ phase: 'error', errorMessage: msg }),
}));

// Initialise mute from localStorage
const stored = localStorage.getItem('tankTrivia_muted');
if (stored === 'true') {
  useGameStore.setState({ muted: true });
}
