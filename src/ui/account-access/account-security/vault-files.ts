import { maxFile } from '../../../platform/vault/crypto';

export function download(file: string, name: string) {
  const url = URL.createObjectURL(new Blob([file], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readFile(event: SubmitEvent) {
  const file = new FormData(event.currentTarget as HTMLFormElement).get('file');
  if (!(file instanceof File) || !file.size || file.size > maxFile) throw new Error('Invalid file');
  return file.text();
}
