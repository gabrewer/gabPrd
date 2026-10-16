import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/prd',testMatch:'**/*.spec.ts',workers:1,fullyParallel:false,
  retries:0,timeout:120_000,expect:{timeout:20_000},
  outputDir:'.pi/tmp/prd-evidence/test-results',
  reporter:[['list'],['json',{outputFile:'.pi/tmp/prd-evidence/runtime-results.json'}]],
});
