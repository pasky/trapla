/// <reference types="vite/client" />
declare module 'virtual:trapla-packs' {
  const manifest: Record<string, import('./packs').PackInfo>;
  export default manifest;
}
