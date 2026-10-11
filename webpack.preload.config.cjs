'use strict';
const path = require('node:path');
module.exports = {
  mode: 'production', devtool: false, target: 'electron-preload',
  context: __dirname, entry: './src/preload/index.ts',
  output: { path: path.join(__dirname, '.webpack/renderer/main_window'), filename: 'preload.cjs' },
  module: { rules: require('./webpack.rules.cjs') },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  node: { __dirname: false, __filename: false },
  optimization: { splitChunks: false, runtimeChunk: false, minimize: false },
};
