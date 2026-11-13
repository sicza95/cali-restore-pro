declare module 'libheif-js/libheif-wasm/libheif-bundle.mjs' {
  type Handle = {
    is_primary(): boolean;
    get_width(): number;
    get_height(): number;
    display(image: ImageData, callback: (image: ImageData | null) => void): void;
  };
  export default function initialize(): Promise<{
    HeifDecoder: new () => { decode(input: ArrayBuffer): Handle[] };
  }>;
}
