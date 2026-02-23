import { builtinPresets } from './builtin.js';
import type { PresetDefinition } from './types.js';

// TODO: support user-defined YAML presets loaded from ~/.counselors/presets/

export function resolvePreset(name: string): PresetDefinition {
  const preset = builtinPresets[name];
  if (!preset) {
    const available = Object.keys(builtinPresets).join(', ');
    throw new Error(
      `Unknown preset "${name}". Available presets: ${available}`,
    );
  }
  return preset;
}

export function getPresetNames(): string[] {
  return Object.keys(builtinPresets);
}
