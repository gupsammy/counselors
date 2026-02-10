import { checkbox, confirm, input, select } from '@inquirer/prompts';

export async function selectModelDetails(
  toolId: string,
  models: {
    id: string;
    name: string;
    recommended?: boolean;
    compoundId?: string;
    extraFlags?: string[];
  }[],
): Promise<{ id: string; compoundId?: string; extraFlags?: string[] }> {
  const choices = models.map((m, i) => ({
    name: m.recommended ? `${m.name} (Recommended)` : m.name,
    value: String(i),
  }));

  const idx = await select({
    message: `Select model for ${toolId}:`,
    choices,
  });

  const model = models[Number(idx)];
  return {
    id: model.id,
    compoundId: model.compoundId,
    extraFlags: model.extraFlags,
  };
}

export async function selectModels(
  toolId: string,
  models: {
    id: string;
    name: string;
    recommended?: boolean;
    compoundId?: string;
    extraFlags?: string[];
  }[],
): Promise<{ id: string; compoundId?: string; extraFlags?: string[] }[]> {
  const choices = models.map((m) => ({
    name: m.recommended ? `${m.name} (Recommended)` : m.name,
    value: { id: m.id, compoundId: m.compoundId, extraFlags: m.extraFlags },
    checked: m.recommended,
  }));

  return checkbox({
    message: `Select models for ${toolId}:`,
    choices,
  });
}

export async function selectTools(
  tools: { id: string; name: string; found: boolean }[],
): Promise<string[]> {
  const choices = tools.map((t) => ({
    name: t.found ? `${t.name} — found` : `${t.name} — not found`,
    value: t.id,
    checked: t.found,
    disabled: !t.found ? '(not installed)' : undefined,
  }));

  return checkbox({
    message: 'Which tools should be configured?',
    choices: choices as any,
  });
}

export async function confirmOverwrite(toolId: string): Promise<boolean> {
  return confirm({
    message: `Tool "${toolId}" already exists. Overwrite?`,
    default: false,
  });
}

export async function selectRunTools(
  tools: { id: string; model: string }[],
): Promise<string[]> {
  const choices = tools.map((t) => ({
    name: `${t.id} (${t.model})`,
    value: t.id,
    checked: true,
  }));

  return checkbox({
    message: 'Select tools to dispatch:',
    choices,
  });
}

export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message, default: true });
}

export async function promptInput(
  message: string,
  defaultValue?: string,
): Promise<string> {
  return input({ message, default: defaultValue });
}

export async function promptSelect<T extends string>(
  message: string,
  choices: { name: string; value: T }[],
): Promise<T> {
  return select({ message, choices });
}
