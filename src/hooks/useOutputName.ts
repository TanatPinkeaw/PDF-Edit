import { useCallback, useEffect, useMemo, useState } from 'react';

import { fileBaseName, resolveOutputName, sanitizeNameBase } from '../lib/output-name';

export type OutputName = {
  /** What the input shows: the base name without the extension. */
  value: string;
  /** The full file name the next download will use. */
  resolved: string;
  defaultBase: string;
  extension: string;
  dirty: boolean;
  setValue: (value: string) => void;
  /** Restores the default when the field is left empty or unusable. */
  commit: () => void;
  reset: () => void;
};

/**
 * Editable output name for one export. A new source file resets the field to
 * that file's suggestion, so a name never leaks from one document to another.
 */
export function useOutputName(defaultFileName: string, extension = 'pdf'): OutputName {
  const defaultBase = useMemo(() => fileBaseName(defaultFileName), [defaultFileName]);
  const [value, setValue] = useState(defaultBase);

  useEffect(() => {
    setValue(defaultBase);
  }, [defaultBase]);

  const commit = useCallback(() => {
    setValue((current) => sanitizeNameBase(current) || defaultBase);
  }, [defaultBase]);

  const reset = useCallback(() => setValue(defaultBase), [defaultBase]);

  const sanitized = sanitizeNameBase(value);

  return {
    value,
    resolved: resolveOutputName(value, defaultFileName, extension),
    defaultBase,
    extension,
    dirty: sanitized !== sanitizeNameBase(defaultBase),
    setValue,
    commit,
    reset,
  };
}
