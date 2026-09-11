// Babel config used only by Jest. The security-critical logic in src/core and
// src/storage is plain TypeScript with no React Native imports, so tests run on
// plain Node rather than through the React Native transform pipeline.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript',
  ],
};
