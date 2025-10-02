import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./client/src/__tests__/setup.ts'],
      include: [
        'client/src/__tests__/**/*.{test,spec}.{ts,tsx}',
        'shared/__tests__/**/*.{test,spec}.{ts,tsx}'
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/build/**',
        '**/.{idea,git,cache,output,temp}/**',
      ],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        reportsDirectory: './coverage/frontend',
        include: [
          'client/src/**/*.{ts,tsx}',
          'shared/**/*.{ts,tsx}'
        ],
        exclude: [
          '**/__tests__/**',
          '**/*.test.{ts,tsx}',
          '**/*.spec.{ts,tsx}',
          '**/node_modules/**',
          '**/dist/**',
          'client/src/main.tsx',
          'client/src/vite-env.d.ts',
          '**/*.d.ts',
          '**/types/**',
          'client/src/components/ui/**',
        ],
        thresholds: {
          lines: 70,
          functions: 70,
          branches: 70,
          statements: 70,
        },
      },
      css: true,
      mockReset: true,
      restoreMocks: true,
      clearMocks: true,
    },
  })
);
