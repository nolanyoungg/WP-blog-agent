import test from 'node:test'; import assert from 'node:assert/strict';
import { parseReview } from '../src/messaging/imessage.js';
test('accepts only an exact review instruction', () => { assert.deepEqual(parseReview(' yes 2 '), { decision: 'approved', blogId: '2' }); assert.deepEqual(parseReview('NO abc-2'), { decision: 'rejected', blogId: 'abc-2' }); assert.equal(parseReview('YES 2 please'), undefined); assert.equal(parseReview('maybe YES 2'), undefined); });
