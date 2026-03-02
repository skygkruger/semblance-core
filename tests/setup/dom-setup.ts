import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { initTestI18n } from '../helpers/mock-i18n';

beforeAll(async () => {
  await initTestI18n();
});

afterEach(() => {
  cleanup();
});
