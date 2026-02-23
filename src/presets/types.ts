import type { ReadOnlyLevel } from '../types.js';

export interface PresetDefinition {
  name: string;
  description: string;
  defaultRounds?: number;
  defaultReadOnly?: ReadOnlyLevel;
}
