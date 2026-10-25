// Worker entry: registers the tsx TypeScript loader inside the worker thread,
// then loads the real (TypeScript) worker.
import { register } from 'tsx/esm/api';

register();
await import('./verifyWorker.ts');
