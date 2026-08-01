const fs = require('fs');

let content = fs.readFileSync('src/App.jsx', 'utf8');

// replace React imports
content = content.replace(
    `import { useState, useEffect } from 'react';`,
    `import React, { useState, useEffect, Suspense, lazy } from 'react';\nimport Preloader from './components/Preloader';`
);

// Match all standard component imports
// e.g. import Dashboard from './Dashboard';
const importRegex = /import\s+([A-Z][a-zA-Z0-9_]*)\s+from\s+'(\.\/[a-zA-Z0-9_\-\/]+)';/g;

content = content.replace(importRegex, (match, componentName, importPath) => {
    return `const ${componentName} = lazy(() => import('${importPath}'));`;
});

// Add Suspense around Routes
content = content.replace(
    `<Routes>`,
    `<Suspense fallback={<Preloader />}>\n          <Routes>`
);
content = content.replace(
    `</Routes>`,
    `</Routes>\n        </Suspense>`
);

fs.writeFileSync('src/App.jsx', content, 'utf8');
console.log('App.jsx converted to lazy loading!');
