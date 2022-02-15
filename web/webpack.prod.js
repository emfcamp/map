const webpack = require('webpack');
const { merge } = require('webpack-merge');
const TerserPlugin = require("terser-webpack-plugin");
const { InjectManifest } = require('workbox-webpack-plugin');
const common = require('./webpack.common.js');

// Note that we don't run InjectManifest or try to load the serviceworker in dev mode.
// This is because Workbox doesn't like the webpack hot-reloader.
// https://github.com/GoogleChrome/workbox/issues/1790
module.exports = merge(common, {
  plugins: [
    new webpack.DefinePlugin({
      DEV: JSON.stringify(false),
    }),
    new InjectManifest({
      swSrc: './src/sw.js'
    })
  ],
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  }
});
