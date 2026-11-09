/** MapLibre can return a partially initialized Map without throwing when WebGL2 fails. */
export function supportsWebGL2(): boolean {
  try {
    const context = document.createElement('canvas').getContext('webgl2');
    if (!context || context.isContextLost()) return false;
    context.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}
