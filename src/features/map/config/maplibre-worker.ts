import { setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

// Let Vite bundle the worker and resolve its deployed asset URL.
setWorkerUrl(workerUrl);
