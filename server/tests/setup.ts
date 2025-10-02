import '@testing-library/jest-dom';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
});

afterAll(() => {
  jest.clearAllTimers();
});
