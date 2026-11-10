import { describe, it, expect } from 'vitest';
import { MODELS, MODALITIES, LICENSES, defaultParams, stagesFor, sizeFor, modelUrl } from '../src/models.js';

describe('model registry', () => {
  it('has unique model ids', () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every modality at least one model', () => {
    for (const m of MODALITIES) expect(MODELS.some((x) => x.type === m.id), m.id).toBe(true);
  });

  it.each(MODELS.map((m) => [m.id, m]))('%s is fully described', (_id, model) => {
    expect(MODALITIES.some((m) => m.id === model.type)).toBe(true);
    expect(LICENSES[model.license], 'license').toBeDefined();
    expect(model.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(modelUrl(model)).toBe(`https://huggingface.co/${model.repo}`);
    expect(model.bytes).toBeGreaterThan(0);
    expect(model.description.length).toBeGreaterThan(10);
    for (const backend of ['webgpu', 'wasm']) expect(sizeFor(model, backend)).toMatch(/MB|GB/);
  });

  it.each(MODELS.map((m) => [m.id, m]))('%s has valid controls and defaults', (_id, model) => {
    const params = defaultParams(model);
    for (const c of model.controls) {
      expect(['slider', 'select', 'choice', 'seed']).toContain(c.type);
      expect(params).toHaveProperty(c.key);
      if (c.type === 'slider') {
        expect(c.default).toBeGreaterThanOrEqual(c.min);
        expect(c.default).toBeLessThanOrEqual(c.max);
        if (c.format) expect(typeof c.format(c.default)).toBe('string');
      }
      if (c.type === 'select' || c.type === 'choice') {
        expect(c.options.map((o) => o.value)).toContain(c.default);
      }
    }
  });

  it.each(MODELS.map((m) => [m.id, m]))('%s has a sensible stage list', (_id, model) => {
    const stages = stagesFor(model, defaultParams(model));
    expect(stages.length).toBeGreaterThanOrEqual(2);
    expect(stages[0][0]).toBe('load');
    expect(stages.map(([id]) => id)).toContain('generate');
    expect(new Set(stages.map(([id]) => id)).size).toBe(stages.length);
  });

  it('adds a first-frame stage to video only when a generated image is used', () => {
    const video = MODELS.find((m) => m.type === 'video');
    const ids = (firstFrame) => stagesFor(video, { ...defaultParams(video), firstFrame }).map(([id]) => id);
    expect(ids('image')).toContain('frame');
    expect(ids('text')).not.toContain('frame');
  });

  it('reports backend-specific download sizes', () => {
    const whisper = MODELS.find((m) => m.id === 'whisper-base');
    expect(sizeFor(whisper, 'wasm')).not.toBe(sizeFor(whisper, 'webgpu'));
    const smol = MODELS.find((m) => m.id === 'smol135');
    expect(sizeFor(smol, 'wasm')).toBe(sizeFor(smol, 'webgpu'));
  });

  it('gives text modalities a default prompt and examples', () => {
    for (const m of MODALITIES.filter((x) => x.input !== 'audio')) {
      expect(m.defaultPrompt.length).toBeGreaterThan(10);
      expect(m.examples.length).toBeGreaterThan(0);
    }
  });
});
