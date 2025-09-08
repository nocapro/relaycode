import { defineConfig } from 'tsup';

export default defineConfig([
  // Bundle the CLI entry point
  {
    entry: ['src/cli.ts'],
    format: ['cjs'],
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: true,
    target: 'es2020',
    outDir: 'dist',
    bundle: true,
    external: []
  },
  // Keep other files unbundled for library usage
  {
    entry: ['src/index.ts', 'src/core/**/*.ts', 'src/utils/**/*.ts', 'src/commands/**/*.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false, // Don't clean since we have multiple configs
    treeshake: true,
    minify: true,
    target: 'es2020',
    outDir: 'dist',
    bundle: false,
    external: ['konro', 'relaycode-core', 'apply-multi-diff']
  }
]);
