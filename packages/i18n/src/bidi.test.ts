import assert from 'node:assert/strict'
import test from 'node:test'

import {isolateBidiText, isolateLtrText, isolateRtlText, stripBidiControls} from './bidi'

test('isolates plain display strings without mutating their content', () => {
  assert.equal(isolateBidiText('ChromVoid 42'), '\u2068ChromVoid 42\u2069')
  assert.equal(isolateLtrText('/vault/مفتاح.txt'), '\u2066/vault/مفتاح.txt\u2069')
  assert.equal(isolateRtlText('مرحبا'), '\u2067مرحبا\u2069')
})

test('removes locale-generated direction marks at markup isolation boundaries', () => {
  assert.equal(stripBidiControls('15\u200f/11\u200f/2023'), '15/11/2023')
})
