import { type Options, defineConfig } from 'tsup';

const getCommonConfig = (options: Options) =>
  ({
    entry: ['./src/**/*'],
    experimentalDts: true,
    sourcemap: true,
    splitting: false,
    target: ['es2023'],
    clean: !options.watch,
    tsconfig: 'tsconfig.json',
    platform: 'node',
    // minify: !options.watch,
  }) satisfies Options;

export default defineConfig((options) => [
  {
    ...getCommonConfig(options),
    format: ['cjs'],
    outDir: './dist/cjs',
  },
  {
    ...getCommonConfig(options),
    format: ['esm'],
    outDir: './dist/esm',
  },
]);
