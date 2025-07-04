// escape-key.js
const fs = require('fs');

const rawJson = fs.readFileSync('serviceAccountKey.json', 'utf8');

// Parse JSON first (to confirm it's valid)
const parsed = JSON.parse(rawJson);

// Stringify JSON with default formatting
const stringified = JSON.stringify(parsed);

// Now stringified will have proper escaped newlines, quotes, etc.
// You can print it directly:
console.log(stringified);
