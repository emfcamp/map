const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ServiceWorkerWebpackPlugin = require('serviceworker-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(__dirname, 'dist'),
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
    noParse: /(mapbox-gl)\.js$/,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html',
    }),
    new ServiceWorkerWebpackPlugin({
      entry: path.join(__dirname, 'src/sw.js'),
    }),
  ],
};
