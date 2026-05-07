const fs = require('fs');
const pkg = require('./package.json');

fs.writeFileSync(
  'version.js',
  `window.APP_VERSION = '${pkg.version}';\n`
);

console.log(`version.js generated: ${pkg.version}`);