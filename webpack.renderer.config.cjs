'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const MinimizerPlugin = require('minimizer-webpack-plugin');
// Fixed source assets only: never resolve a renderer-supplied URL or add a dev server.
class FixedShellAssets {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('FixedShellAssets', compilation => {
      compilation.hooks.processAssets.tapPromise({
        name: 'FixedShellAssets', stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
      }, async () => {
        for (const file of ['index.html', 'shell.css']) {
          const source = path.join(__dirname, 'src/renderer', file);
          compilation.fileDependencies.add(source);
          const bytes = await fs.readFile(source);
          if (file === 'index.html') {
            const html = bytes.toString('utf8');
            if (!/<script\b[^>]*src=["'](?:\.\/)?index\.js["'][^>]*><\/script>/i.test(html)
              || !/<link\b[^>]*href=["'](?:\.\/)?shell\.css["']/i.test(html)) {
              throw new Error('Shell HTML must reference fixed index.js and shell.css assets.');
            }
          }
          compilation.emitAsset('main_window/' + file, new compiler.webpack.sources.RawSource(bytes));
        }
      });
    });
  }
}
module.exports = {
  mode: 'production', devtool: false, target: 'web', context: __dirname,
  entry: { main_window: './src/renderer/index.tsx' },
  output: { path: path.join(__dirname, '.webpack/renderer'), filename: '[name]/index.js', publicPath: '' },
  module: { rules: [...require('./webpack.rules.cjs'), {
    test: /\.css$/, type: 'asset/resource', generator: { filename: 'main_window/shell.css' },
  }] },
  resolve: { extensions: ['.ts', '.tsx', '.js'] },
  plugins: [new FixedShellAssets()],
  optimization: {
    splitChunks: false, runtimeChunk: false, minimize: true,
    // Strip dependency source-map directives without changing names/optimizing code.
    // Keep legal comments inline: no extra map or LICENSE asset crosses the allowlist.
    minimizer: [new MinimizerPlugin({
      extractComments: false,
      terserOptions: { compress: false, mangle: false, format: { comments: 'some' } },
    })],
  },
};
