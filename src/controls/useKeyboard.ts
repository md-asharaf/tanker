import { useEffect, useRef } from 'react';

export interface KeyState {
  left: boolean;
  right: boolean;
  up?: boolean;
  down?: boolean;
}

export interface OneShotState {
  fire: boolean;
  pause: boolean;
  hint: boolean;
  mute: boolean;
}

/**
 * Returns refs for:
 *  - `keys`    – held-down movement and aim state (merged keyboard + touch)
 *  - `oneShot` – single-trigger actions consumed after first read
 *
 * Uses refs throughout — zero React re-renders.
 */
export function useKeyboard() {
  const keys    = useRef<KeyState>({ left: false, right: false, up: false, down: false });
  const oneShot = useRef<OneShotState>({ fire: false, pause: false, hint: false, mute: false });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyA': case 'ArrowLeft':  keys.current.left  = true;  break;
        case 'KeyD': case 'ArrowRight': keys.current.right = true;  break;
        case 'KeyW': case 'ArrowUp':    keys.current.up    = true;  break;
        case 'KeyS': case 'ArrowDown':  keys.current.down  = true;  break;
        case 'Space':
          e.preventDefault();
          oneShot.current.fire  = true;
          break;
        case 'KeyP': case 'Escape':
          oneShot.current.pause = true;
          break;
        case 'KeyH':
          oneShot.current.hint  = true;
          break;
        case 'KeyM':
          oneShot.current.mute  = true;
          break;
      }
    };

    const up = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyA': case 'ArrowLeft':  keys.current.left  = false; break;
        case 'KeyD': case 'ArrowRight': keys.current.right = false; break;
        case 'KeyW': case 'ArrowUp':    keys.current.up    = false; break;
        case 'KeyS': case 'ArrowDown':  keys.current.down  = false; break;
      }
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, []);

  return { keys, oneShot };
}
