interface Window {
  readonly gabPrd: Readonly<{
    bootstrap: import('../shared/bootstrap-contracts').BootstrapBridge;
    prds?: import('../shared/prd-contracts').PrdBridge;
  }>;
}
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare module '*.css' {
  const url: string;
  export default url;
}
