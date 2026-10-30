/** Conservative estimates only: file size is not a guarantee that a model can load. */
export const needs = (size) => Math.max(0, Number.isFinite(size) ? size : 0) * 1.15 + 600_000_000;

export function safeContextSize(memory, modelSize) {
  if (!Number.isFinite(memory) || memory <= 0) return 1024;
  const size = Number.isFinite(modelSize) && modelSize > 0 ? modelSize : 0;
  const budget = memory * 0.45 - size * 1.2;
  if (budget < 1_500_000_000) return 1024;
  if (budget < 2_700_000_000) return 2048;
  if (budget < 5_000_000_000) return 4096;
  return 8192;
}

export function fitModel(size, memory, platform) {
  if (!Number.isFinite(memory) || memory <= 0 || !Number.isFinite(size) || size <= 0) return 'unknown';
  const budget = memory * (platform === 'ios' ? 0.5 : 0.55);
  const required = needs(size);
  return required <= budget * 0.6 ? 'good' : required <= budget ? 'ok' : 'no';
}

/** A conservative load preflight. Available RAM is a snapshot, so callers should take it immediately before loading. */
export function assessModelMemory({ modelSize, totalMemory, availableMemory, lowMemory, platform = 'android' } = {}) {
  const size = Number.isFinite(modelSize) && modelSize > 0 ? modelSize : 0;
  const total = Number.isFinite(totalMemory) && totalMemory > 0 ? totalMemory : 0;
  const hasAvailable = Number.isFinite(availableMemory) && availableMemory >= 0;
  const contextSize = safeContextSize(total, size);

  if (lowMemory === true) return { allowed: false, reason: 'low-memory', contextSize };
  if (size > 0 && total > 0 && fitModel(size, total, platform) === 'no') {
    return { allowed: false, reason: 'model-too-large', contextSize };
  }
  if (size > 0 && hasAvailable && availableMemory < needs(size)) {
    return { allowed: false, reason: 'available-memory', contextSize };
  }
  return { allowed: true, reason: null, contextSize };
}

export function modelCapacity(memory, platform) {
  if (!Number.isFinite(memory) || memory <= 0) return null;
  const budget = memory * (platform === 'ios' ? 0.5 : 0.55);
  const tiers = [0.5, 1, 2, 3, 4, 7, 8, 12, 14, 27, 32];
  const largest = (limit) => tiers.filter((billions) => needs(billions * 0.62e9) <= limit).pop() ?? 0;
  return { good: largest(budget * 0.6), ok: largest(budget) };
}
