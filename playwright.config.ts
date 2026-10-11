import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/bootstrap',testMatch:'**/*.spec.ts',workers:1,fullyParallel:false,
  retries:0,timeout:60_000,expect:{timeout:20_000},
  outputDir:'.pi/tmp/bootstrap-evidence/test-results',
  reporter:[['list'],['json',{outputFile:'.pi/tmp/bootstrap-evidence/runtime-results.json'}]],
});
