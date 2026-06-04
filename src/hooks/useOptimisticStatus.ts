"use client";

import { useCallback, useReducer, useRef } from "react";

// Optimistic status flip with rollback (P0-11, DESIGN_DIRECTION §3 "fix H1").
// The interaction path is local: commit() flips state INSTANTLY, fires the
// mutation in the background, and on failure reverts in a SINGLE dispatch that
// both restores the previous value AND surfaces the error — one render cycle, no
// flash of an intermediate state. Deliberately framework-agnostic: it takes a
// mutationFn rather than depending on TanStack Query (the server-state layer
// lands in P1.5). When that layer arrives, this is the onMutate/onError primitive.
//
// Scope ONE hook per row so a flip re-renders only that row, never the table; the
// row's visual lane/pill change is driven by CSS transform/opacity keyed on value.

export interface OptimisticState<T> {
  readonly value: T;
  readonly isPending: boolean;
  readonly error: string | null;
}

export type OptimisticAction<T> =
  | { readonly type: "apply"; readonly next: T }
  | { readonly type: "settle" }
  | { readonly type: "rollback"; readonly previous: T; readonly error: string }
  | { readonly type: "dismiss" };

// Pure reducer — exported for unit testing without a DOM. `rollback` is atomic:
// reverting the value and setting the error happen in the same state transition.
export function optimisticReducer<T>(
  state: OptimisticState<T>,
  action: OptimisticAction<T>,
): OptimisticState<T> {
  switch (action.type) {
    case "apply":
      return { value: action.next, isPending: true, error: null };
    case "settle":
      return { value: state.value, isPending: false, error: null };
    case "rollback":
      return { value: action.previous, isPending: false, error: action.error };
    case "dismiss":
      return { value: state.value, isPending: state.isPending, error: null };
    default:
      return state;
  }
}

export const DEFAULT_OPTIMISTIC_ERROR = "Не удалось сохранить — изменение отменено";

export interface UseOptimisticStatus<T> {
  readonly value: T;
  readonly isPending: boolean;
  readonly error: string | null;
  /** Optimistically set `value`, run the mutation, roll back + show error on failure. */
  readonly commit: (next: T) => Promise<void>;
  /** Clear the error banner without touching the value. */
  readonly dismissError: () => void;
}

export interface UseOptimisticStatusOptions {
  /** Map a thrown error to a user-facing (Russian) message; defaults to a generic line. */
  readonly onError?: (error: unknown) => string;
}

export function useOptimisticStatus<T>(
  initial: T,
  mutate: (next: T) => Promise<unknown>,
  options: UseOptimisticStatusOptions = {},
): UseOptimisticStatus<T> {
  const [state, dispatch] = useReducer(optimisticReducer<T>, {
    value: initial,
    isPending: false,
    error: null,
  });

  // Refs keep `commit` referentially stable while always seeing the latest value,
  // mutation fn, and error mapper — so memoized rows don't re-bind their handler.
  const valueRef = useRef(state.value);
  valueRef.current = state.value;
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const onErrorRef = useRef(options.onError);
  onErrorRef.current = options.onError;

  const commit = useCallback(async (next: T) => {
    const previous = valueRef.current;
    dispatch({ type: "apply", next });
    try {
      await mutateRef.current(next);
      dispatch({ type: "settle" });
    } catch (error: unknown) {
      const message = onErrorRef.current?.(error) ?? DEFAULT_OPTIMISTIC_ERROR;
      dispatch({ type: "rollback", previous, error: message });
    }
  }, []);

  const dismissError = useCallback(() => dispatch({ type: "dismiss" }), []);

  return { value: state.value, isPending: state.isPending, error: state.error, commit, dismissError };
}
