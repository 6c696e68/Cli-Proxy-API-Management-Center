import { describe, expect, test } from 'bun:test';
import { validateChRelayVipPro } from '../src/features/plugins/vipProConfigValidation';

const t = (key: string) => key;

describe('ch-relay-vippro config validation', () => {
  test('accepts tailscale shared http addresses', () => {
    expect(
      validateChRelayVipPro({ 'base-url': 'http://100.105.177.35:11500/v1' }, t)
    ).toEqual({});
    expect(validateChRelayVipPro({ 'base-url': 'http://100.63.255.255/v1' }, t)['base-url']).toContain(
      'base_url'
    );
    expect(validateChRelayVipPro({ 'base-url': 'http://100.128.0.1/v1' }, t)['base-url']).toContain(
      'base_url'
    );
    expect(validateChRelayVipPro({ 'base-url': 'http://100.64.0.0/v1' }, t)).toEqual({});
    expect(validateChRelayVipPro({ 'base-url': 'http://100.127.255.255/v1' }, t)).toEqual({});
    expect(validateChRelayVipPro({ 'base-url': 'https://example.com/v1' }, t)).toEqual({});
    expect(validateChRelayVipPro({ 'base-url': 'https://100.86.237.127:11500/v1' }, t)).toEqual({});
    expect(
      validateChRelayVipPro({ 'base-url': 'http://user:pass@100.86.237.127:11500/v1' }, t)['base-url']
    ).toContain('base_url');
    expect(
      validateChRelayVipPro({ 'base-url': 'http://100.86.237.127:11500/v1?q=1' }, t)['base-url']
    ).toContain('base_url');
    expect(
      validateChRelayVipPro({ 'base-url': 'http://100.86.237.127:11500/v1#frag' }, t)['base-url']
    ).toContain('base_url');
  });

  test('accepts the live private http settings', () => {
    expect(
      validateChRelayVipPro(
        {
          'base-url': 'http://192.168.8.1:11500/v1',
          prefix: 'vippro',
          'request-retry': '10',
          'fallback-retry': '3',
          'sticky-seconds': '600',
          'rotation-mode': 'sticky',
          'plus-preference': 'only',
          headers: '{}',
          models: '[{"name":"gpt-6-luna","fallback":["gpt-6-luna"]}]',
        },
        t
      )
    ).toEqual({});
  });

  test('reports every invalid field immediately', () => {
    const errors = validateChRelayVipPro(
      {
        'base-url': 'http://example.com/v1',
        prefix: 'a/b',
        headers: '{"Authorization":"secret"}',
        'request-retry': '33',
        'fallback-retry': '-1',
        'sticky-seconds': '90000',
        'rotation-mode': 'spin',
        'plus-preference': 'maybe',
        models: '[{"alias":"gpt"}]',
      },
      t
    );
    expect(errors['base-url']).toContain('base_url');
    expect(errors.prefix).toContain('prefix');
    expect(errors.headers).toContain('headers');
    expect(errors['request-retry']).toContain('request_retry');
    expect(errors['fallback-retry']).toContain('fallback_retry');
    expect(errors['sticky-seconds']).toContain('sticky_seconds');
    expect(errors['rotation-mode']).toContain('rotation');
    expect(errors['plus-preference']).toContain('plus');
    expect(errors.models).toContain('model_name');
  });

  test('accepts uppercase enums and rejects cooldown and NUL stats paths', () => {
    expect(validateChRelayVipPro({ 'plus-preference': 'ONLY', 'rotation-mode': 'Sticky' }, t)).toEqual(
      {}
    );
    expect(validateChRelayVipPro({ 'model-cooldown-minutes': '' }, t)).toEqual({});
    expect(
      validateChRelayVipPro({ 'model-cooldown-minutes': '10081' }, t)['model-cooldown-minutes']
    ).toContain('model_cooldown');
    expect(validateChRelayVipPro({ 'stats-file': 'stats.json\u0000' }, t)['stats-file']).toContain(
      'stats_file'
    );
  });

  test('accepts free models that match model names and fallbacks', () => {
    const models = '[{"name":"gpt-6-luna","fallback":["gpt-6-mini","GPT-6-LUNA"]}]';
    expect(
      validateChRelayVipPro({ models, 'free-models': '["gpt-6-mini","GPT-6-LUNA"]' }, t)
    ).toEqual({});
    expect(validateChRelayVipPro({ models, 'free-models': '' }, t)).toEqual({});
    expect(validateChRelayVipPro({ models, 'free-models': '[]' }, t)).toEqual({});
  });

  test('rejects a free models value that is not an array of names', () => {
    const models = '[{"name":"gpt-6-luna"}]';
    expect(
      validateChRelayVipPro({ models, 'free-models': '{"name":"gpt-6-luna"}' }, t)['free-models']
    ).toContain('free_models');
    expect(
      validateChRelayVipPro({ models, 'free-models': 'not json' }, t)['free-models']
    ).toContain('free_models');
    expect(
      validateChRelayVipPro({ models, 'free-models': '["gpt-6-luna",""]' }, t)['free-models']
    ).toContain('free_models');
  });

  test('reports free models that are missing from the model list', () => {
    const models = '[{"name":"gpt-6-luna","fallback":["gpt-6-mini"]}]';
    const tWithNames = (key: string, options?: Record<string, unknown>) =>
      options?.names ? `${key}:${String(options.names)}` : key;
    const error = validateChRelayVipPro(
      { models, 'free-models': '["gpt-6-mini","gpt-9-unknown"]' },
      tWithNames
    )['free-models'];
    expect(error).toContain('free_models_unknown');
    expect(error).toContain('gpt-9-unknown');
    expect(error).not.toContain('gpt-6-mini');
  });
});
