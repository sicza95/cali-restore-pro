// Ports for `npm run test:files`. Override both to run two checkouts at once.
const devPort = Number(process.env.FILES_DEV_PORT ?? 4184);
const previewPort = Number(process.env.FILES_PREVIEW_PORT ?? 4186);

export const filesPorts = { dev: devPort, preview: previewPort };
export const devOrigin = `http://127.0.0.1:${devPort}`;
export const previewOrigin = `http://127.0.0.1:${previewPort}`;
