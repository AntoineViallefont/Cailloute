import { rm } from 'node:fs/promises';

// Seulement la sortie générée ; reprises automatiques si macOS renvoie ENOTEMPTY.
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
console.log('Dossier de compilation nettoyé.');
