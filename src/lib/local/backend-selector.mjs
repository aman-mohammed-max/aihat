const CPU = { kind: 'cpu', label: 'CPU', devices: [] };

const numeric = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
  return null;
};

export function ggufFileType(info) {
  const raw = info?.metadata?.['general.file_type'] ?? info?.['general.file_type'];
  return numeric(raw);
}

export function ggufQuantName(fileType) {
  const type = numeric(fileType);
  if (type === 2) return 'Q4_0';
  if (type === 18) return 'Q6_K';
  if (type === 15) return 'Q4_K_M';
  if (type === 14) return 'Q4_K_S';
  return type === null ? 'unknown' : `GGUF file type ${type}`;
}

const isOpenClGpu = (device) =>
  /opencl/i.test(device.backend ?? '') && /^(gpu|igpu)$/i.test(device.type ?? '');

const isMetalGpu = (device) =>
  /metal/i.test(device.backend ?? '') && /^(gpu|igpu)$/i.test(device.type ?? '');

const isHtp = (device) =>
  /^HTP\d*$/i.test(device.deviceName ?? '') || /hexagon|\bhtp\b/i.test(`${device.backend ?? ''} ${device.deviceName ?? ''}`);

function unavailableReason(preference, platform, devices, fileType) {
  if (preference === 'npu' && platform !== 'android') return 'This engine does not expose an iOS Neural Engine backend.';
  if (preference === 'npu' && !devices.some(isHtp)) return 'No Hexagon HTP NPU is visible to this app.';
  if (preference === 'gpu' && platform === 'ios' && !devices.some(isMetalGpu)) return 'No llama.cpp Metal GPU is visible on this device.';
  if (preference === 'auto' && platform === 'ios' && !devices.some(isMetalGpu)) return 'No llama.cpp Metal GPU is visible; using CPU.';
  if ((preference === 'gpu' || preference === 'auto') && platform === 'android') {
    if (!devices.some(isOpenClGpu)) return 'No llama.cpp OpenCL GPU is visible to this Android app.';
    if (fileType !== 2 && fileType !== 18) return `Android OpenCL requires Q4_0 or Q6_K GGUF; this model is ${ggufQuantName(fileType)}.`;
  }
  return undefined;
}

/** Backend candidates are ordered by preference; CPU is always the final recovery path. */
export function createBackendPlan({ platform, preference = 'auto', devices = [], modelInfo } = {}) {
  const mode = ['auto', 'cpu', 'gpu', 'npu'].includes(preference) ? preference : 'auto';
  const fileType = ggufFileType(modelInfo);
  if (mode === 'cpu') return { candidates: [CPU], fallbackReason: undefined, fileType };

  let accelerated;
  if (platform === 'ios' && (mode === 'auto' || mode === 'gpu')) {
    if (devices.some(isMetalGpu)) accelerated = { kind: 'gpu', label: 'GPU · Metal', devices: [] };
  } else if (platform === 'android' && (mode === 'auto' || mode === 'gpu')) {
    const opencl = devices.filter(isOpenClGpu);
    if (opencl.length && (fileType === 2 || fileType === 18)) {
      accelerated = { kind: 'gpu', label: 'GPU · OpenCL', devices: opencl.map((device) => device.deviceName) };
    }
  }
  if (!accelerated && platform === 'android' && mode === 'npu') {
    const htp = devices.filter(isHtp);
    if (htp.length) accelerated = { kind: 'npu', label: 'NPU · Hexagon (experimental)', devices: htp.map((device) => device.deviceName) };
  }

  return {
    candidates: accelerated ? [accelerated, CPU] : [CPU],
    fallbackReason: accelerated ? undefined : unavailableReason(mode, platform, devices, fileType),
    fileType,
  };
}

/** Trust the context's reported devices, never the requested mode, for the displayed backend. */
export function actualBackend({ platform, candidate, context } = {}) {
  const used = Array.isArray(context?.devices) ? context.devices : [];
  const htpUsed = used.some((name) => /^HTP\d*$/i.test(name) || /hexagon|\bhtp\b/i.test(name));
  if (platform === 'android' && htpUsed) return { kind: 'npu', label: 'NPU · Hexagon (experimental)' };
  if (context?.gpu && platform === 'ios') return { kind: 'gpu', label: 'GPU · Metal' };
  if (context?.gpu && platform === 'android') return { kind: 'gpu', label: 'GPU · OpenCL' };
  if (candidate?.kind !== 'cpu') {
    return { kind: 'cpu', label: 'CPU', reason: context?.reasonNoGPU || 'The requested accelerator was not used by the runtime.' };
  }
  return { kind: 'cpu', label: 'CPU' };
}

export function accelerationFailureReason(candidate, error) {
  const backend = candidate?.label?.split(' · ')[1] ?? 'accelerator';
  const detail = error instanceof Error && error.message ? ` (${error.message})` : '';
  return `${backend} could not load this model${detail}; using CPU.`;
}
