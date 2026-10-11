'use strict';
const path = require('node:path');
const webpack = require('webpack');
module.exports = {
  mode: 'production', devtool: false, target: 'electron44.7-main',
  context: __dirname,
  entry: { index: './src/main/index.ts', 'pi-utility': './src/pi-utility/index.ts' },
  output: { path: path.join(__dirname, '.webpack/main'), filename: '[name].cjs', clean: true },
  // Keep dynamic SDK-relative createRequire native; Webpack cannot evaluate its runtime path.
  module: { parser: { javascript: { createRequire: false } }, rules: require('./webpack.rules.cjs') },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  node: { __dirname: false, __filename: false },
  externals: {
    'better-sqlite3': 'commonjs better-sqlite3',
    '@earendil-works/pi-coding-agent': 'import @earendil-works/pi-coding-agent',
  },
  plugins: [new webpack.DefinePlugin({
    MAIN_WINDOW_WEBPACK_ENTRY: JSON.stringify('gabprd://app/main_window/index.html'),
    MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: "require('node:path').join(__dirname, '../renderer/main_window/preload.cjs')",
  })],
  optimization: { splitChunks: false, runtimeChunk: false, minimize: false },
};
