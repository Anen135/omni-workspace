import assert from 'node:assert/strict';
import { test } from 'node:test';
import { studentPhotoUrl } from '../src/features/students/student-photo.ts';

test('student photos resolve official-relative paths and preserve explicit HTTP hosts', () => {
  assert.equal(studentPhotoUrl('/uploads/student.png'), 'https://omni.top-academy.ru/uploads/student.png');
  assert.equal(studentPhotoUrl('uploads/student.png'), 'https://omni.top-academy.ru/uploads/student.png');
  assert.equal(studentPhotoUrl('/uploads/student one.png'), 'https://omni.top-academy.ru/uploads/student%20one.png');
  assert.equal(studentPhotoUrl('  https://images.example.invalid/student.png  '), 'https://images.example.invalid/student.png');
  assert.equal(studentPhotoUrl('http://images.example.invalid/student.png'), 'http://images.example.invalid/student.png');
  assert.equal(studentPhotoUrl('//images.example.invalid/student.png'), 'https://images.example.invalid/student.png');
});

test('student photos reject unsupported values, schemes, credentials and malformed URLs', () => {
  for (const value of [undefined, null, {}, [], false, 1, '', ' ', 'javascript:alert(1)', 'data:image/png;base64,AA', 'file:///photo.png',
    'https://user:pass@example.invalid/photo.png', '//user@example.invalid/photo.png', 'https://', 'https://[bad]/photo',
    'https:photo.png', 'https://example.invalid/a\nb.png', '/uploads\\photo.png']) {
    assert.equal(studentPhotoUrl(value), '', String(value));
  }
});
