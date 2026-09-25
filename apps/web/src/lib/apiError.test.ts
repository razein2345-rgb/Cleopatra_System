import { describe, expect, it } from 'vitest';
import { ApiRequestError } from './apiError';

describe('ApiRequestError', () => {
  it('is still an Error carrying the server message, so existing catch blocks keep working', () => {
    const err = new ApiRequestError({ message: 'الرقم ده موجود بالفعل' });
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('الرقم ده موجود بالفعل');
    expect(err.name).toBe('ApiRequestError');
  });

  it('keeps the code and every extra field the server attached', () => {
    const err = new ApiRequestError({ message: 'm', code: 'DUPLICATE_PHONE', matches: [{ id: 'p1' }], hiddenCount: 2 });
    expect(err.code).toBe('DUPLICATE_PHONE');
    expect(err.payload.matches).toEqual([{ id: 'p1' }]);
    expect(err.payload.hiddenCount).toBe(2);
  });

  it('code is undefined when the server sent none', () => {
    expect(new ApiRequestError({ message: 'm' }).code).toBeUndefined();
  });
});
