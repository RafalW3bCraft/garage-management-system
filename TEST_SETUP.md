# Testing Infrastructure Setup - L9.1

This document describes the testing infrastructure setup for the RonakMotorGarage application, including configuration, directory structure, and usage instructions.

## Table of Contents

- [Overview](#overview)
- [Testing Stack](#testing-stack)
- [Directory Structure](#directory-structure)
- [Configuration Files](#configuration-files)
- [NPM Scripts](#npm-scripts)
- [Running Tests](#running-tests)
- [Coverage Thresholds](#coverage-thresholds)
- [Writing Tests](#writing-tests)
- [Best Practices](#best-practices)

## Overview

The testing infrastructure is split into two main parts:

1. **Backend Tests** - Using Jest for server-side unit and integration tests
2. **Frontend Tests** - Using Vitest for client-side component and hook tests

## Testing Stack

### Backend (Jest)
- **Test Runner**: Jest
- **TypeScript Support**: ts-jest
- **Environment**: Node.js
- **Assertion Library**: Jest (built-in)
- **Utilities**: @testing-library/jest-dom, supertest

### Frontend (Vitest)
- **Test Runner**: Vitest
- **Environment**: jsdom
- **Component Testing**: @testing-library/react
- **Assertion Library**: Vitest (built-in) + @testing-library/jest-dom
- **User Interaction**: @testing-library/user-event

## Directory Structure

```
project-root/
├── server/
│   └── tests/
│       ├── setup.ts                 # Jest setup file
│       ├── unit/                    # Unit tests for individual functions/classes
│       │   └── storage.test.ts      # Sample storage unit tests
│       └── integration/             # Integration tests for API endpoints
│
├── client/
│   └── src/
│       └── __tests__/
│           ├── setup.ts             # Vitest setup file
│           ├── components/          # Component tests
│           │   └── Navigation.test.tsx
│           └── hooks/               # Custom hook tests
│
├── shared/
│   └── __tests__/                   # Tests for shared utilities/schemas
│
├── tests/
│   └── __mocks__/                   # Global mocks (database, APIs, etc.)
│
├── jest.config.js                   # Jest configuration
└── vitest.config.ts                 # Vitest configuration
```

## Configuration Files

### jest.config.js
Located at the project root, this file configures Jest for backend testing:
- Test directory: `server/tests`
- TypeScript support via ts-jest
- Module path mapping for `@shared/*` imports
- Coverage thresholds set to 80%
- Setup file: `server/tests/setup.ts`

### vitest.config.ts
Located at the project root, this file configures Vitest for frontend testing:
- Extends existing `vite.config.ts` for consistency
- Test directories: `client/src/__tests__` and `shared/__tests__`
- jsdom environment for DOM testing
- Coverage thresholds set to 70%
- Setup file: `client/src/__tests__/setup.ts`

## NPM Scripts

Add the following scripts to your `package.json`:

```json
{
  "scripts": {
    "test": "npm run test:backend && npm run test:frontend",
    "test:backend": "jest",
    "test:frontend": "vitest run",
    "test:watch": "npm run test:backend:watch & npm run test:frontend:watch",
    "test:backend:watch": "jest --watch",
    "test:frontend:watch": "vitest",
    "test:coverage": "npm run test:backend:coverage && npm run test:frontend:coverage",
    "test:backend:coverage": "jest --coverage",
    "test:frontend:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

## Running Tests

### Backend Tests

**Run all backend tests:**
```bash
npm run test:backend
```

**Run backend tests in watch mode:**
```bash
npm run test:backend:watch
```

**Run backend tests with coverage:**
```bash
npm run test:backend:coverage
```

**Run specific backend test file:**
```bash
npx jest server/tests/unit/storage.test.ts
```

**Run backend tests matching a pattern:**
```bash
npx jest --testNamePattern="Service Operations"
```

### Frontend Tests

**Run all frontend tests:**
```bash
npm run test:frontend
```

**Run frontend tests in watch mode:**
```bash
npm run test:frontend:watch
```

**Run frontend tests with coverage:**
```bash
npm run test:frontend:coverage
```

**Run frontend tests with UI:**
```bash
npm run test:ui
```

**Run specific frontend test file:**
```bash
npx vitest run client/src/__tests__/components/Navigation.test.tsx
```

### All Tests

**Run all tests (backend + frontend):**
```bash
npm test
```

**Run all tests with coverage:**
```bash
npm run test:coverage
```

**Run all tests in watch mode (parallel):**
```bash
npm run test:watch
```

## Manual Test Execution (Without NPM Scripts)

If you need to run tests manually without the npm scripts:

### Backend (Jest)
```bash
# Run all tests
npx jest

# Run with coverage
npx jest --coverage

# Watch mode
npx jest --watch

# Run specific file
npx jest server/tests/unit/storage.test.ts

# Run with verbose output
npx jest --verbose

# Update snapshots
npx jest --updateSnapshot
```

### Frontend (Vitest)
```bash
# Run all tests
npx vitest run

# Run with coverage
npx vitest run --coverage

# Watch mode
npx vitest

# Run specific file
npx vitest run client/src/__tests__/components/Navigation.test.tsx

# Run with UI
npx vitest --ui

# Update snapshots
npx vitest run --update
```

## Coverage Thresholds

### Backend Coverage (≥80%)
The backend tests must maintain minimum coverage of:
- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

Coverage reports are generated in: `coverage/backend/`

### Frontend Coverage (≥70%)
The frontend tests must maintain minimum coverage of:
- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

Coverage reports are generated in: `coverage/frontend/`

### Viewing Coverage Reports

After running tests with coverage, open the HTML reports:

```bash
# Backend coverage report
open coverage/backend/index.html

# Frontend coverage report
open coverage/frontend/index.html
```

## Writing Tests

### Backend Unit Test Example

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { DatabaseStorage } from '../../storage';

describe('DatabaseStorage', () => {
  let storage: DatabaseStorage;

  beforeEach(() => {
    storage = new DatabaseStorage();
  });

  it('should create a service successfully', async () => {
    const service = {
      title: 'Oil Change',
      description: 'Complete oil change',
      category: 'maintenance',
      price: 50,
      duration: 30,
    };

    const result = await storage.createService(service);
    
    expect(result).toBeDefined();
    expect(result.title).toBe('Oil Change');
  });
});
```

### Frontend Component Test Example

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Navigation } from '@/components/Navigation';

describe('Navigation', () => {
  it('should render navigation links', () => {
    render(<Navigation />);
    
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
  });
});
```

### Frontend Hook Test Example

```tsx
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuth } from '@/hooks/use-auth';

describe('useAuth', () => {
  it('should return user data when authenticated', async () => {
    const { result } = renderHook(() => useAuth());
    
    await waitFor(() => {
      expect(result.current.user).toBeDefined();
    });
  });
});
```

## Best Practices

### General
1. **Write tests first** - Follow TDD when possible
2. **Test behavior, not implementation** - Focus on what the code does, not how
3. **Keep tests isolated** - Each test should be independent
4. **Use descriptive test names** - Clearly describe what is being tested
5. **Follow AAA pattern** - Arrange, Act, Assert

### Backend Tests
1. **Mock external dependencies** - Database calls, API requests, etc.
2. **Test error cases** - Don't just test the happy path
3. **Use transactions** - Roll back database changes after each test
4. **Test edge cases** - Empty arrays, null values, boundary conditions
5. **Keep tests fast** - Mock slow operations

### Frontend Tests
1. **Query by accessible roles** - Use `getByRole`, `getByLabelText` when possible
2. **Test user interactions** - Use `userEvent` from @testing-library/user-event
3. **Avoid implementation details** - Don't test state, test rendered output
4. **Mock API calls** - Use MSW (Mock Service Worker) or vi.mock
5. **Test accessibility** - Ensure components are accessible
6. **Use data-testid sparingly** - Prefer semantic queries

### Mocking
1. **Mock at the boundary** - Mock external services, not internal functions
2. **Reset mocks between tests** - Use `beforeEach` to clear mocks
3. **Verify mock calls** - Check that mocks are called with correct arguments
4. **Use factory functions** - Create reusable mock data generators

### Coverage
1. **Don't aim for 100%** - Focus on critical paths
2. **Ignore generated files** - UI components, type definitions
3. **Review coverage reports** - Identify untested code paths
4. **Test critical business logic** - Prioritize important features

## Troubleshooting

### Common Issues

**Issue**: Tests fail with module resolution errors
- **Solution**: Check that `@shared` paths are correctly configured in both `jest.config.js` and `vitest.config.ts`

**Issue**: Frontend tests fail with "Cannot find module" errors
- **Solution**: Ensure `client/src/__tests__/setup.ts` is loaded and path aliases are correct

**Issue**: Coverage thresholds not met
- **Solution**: Review coverage reports and add tests for uncovered code

**Issue**: Tests are slow
- **Solution**: Mock external dependencies, use parallel test execution

**Issue**: jsdom errors in frontend tests
- **Solution**: Check that `environment: 'jsdom'` is set in `vitest.config.ts`

## Additional Resources

- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Documentation](https://testing-library.com/)
- [React Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Next Steps

1. Add npm scripts to `package.json` as described above
2. Run sample tests to validate setup: `npm test`
3. Review coverage reports: `npm run test:coverage`
4. Start writing tests for critical features
5. Set up CI/CD integration to run tests automatically
6. Consider adding E2E tests with Playwright or Cypress

---

**Note**: This testing infrastructure is designed to scale with your application. As you add more features, continue to add corresponding tests to maintain code quality and prevent regressions.
