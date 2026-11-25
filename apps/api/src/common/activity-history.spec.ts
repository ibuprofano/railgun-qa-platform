import { BadRequestException } from '@nestjs/common';
import { parseActivityType } from './activity-history';
import { ACTIVITY_TYPE_ENTITIES } from './activity-log-reader';

describe('project feed type filter', () => {
  it('maps every PRD §6.6 pill to its entity types', () => {
    expect(ACTIVITY_TYPE_ENTITIES).toEqual({
      'test-cases': ['test_case'],
      executions: ['test_execution'],
      runs: ['test_run'],
      bugs: ['bug'],
      folders: ['folder'],
      environments: ['environment', 'environment_credential'],
      projects: ['project'],
      tags: ['tag'],
    });
  });

  it('treats a missing or empty type as no filter', () => {
    expect(parseActivityType(undefined)).toBeUndefined();
    expect(parseActivityType('')).toBeUndefined();
  });

  it('accepts each known type', () => {
    for (const type of Object.keys(ACTIVITY_TYPE_ENTITIES)) {
      expect(parseActivityType(type)).toBe(type);
    }
  });

  it.each([['workspace'], ['Bugs'], ['toString'], [['bugs']]])('rejects %p', (value) => {
    expect(() => parseActivityType(value)).toThrow(BadRequestException);
  });
});
