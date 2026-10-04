import { defineConfig } from 'wxt';
import production from './wxt.config';

// Separate explicit build, never an environment/message override of production.
export default defineConfig({
  ...production,
  entrypointsDir: 'tools/provider-validation/entrypoints',
  outDir: '.output/provider-validation',
  manifest: {
    ...production.manifest,
    name: 'Likedex — RELEASE VALIDATION ONLY',
    description: 'Human provider observation only. Not a Store release package. Sync remains blocked in this build.',
  },
});
