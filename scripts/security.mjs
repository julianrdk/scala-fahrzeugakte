export function csp(clerkHost) {
  return (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://" +
    clerkHost +
    " https://challenges.cloudflare.com https://*.protect.clerk.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://img.clerk.com https://tile.openstreetmap.org; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' https://" +
    clerkHost +
    " https://*.protect.clerk.com wss://*.protect.clerk.com; frame-src https://challenges.cloudflare.com https://" +
    clerkHost +
    "; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
  );
}
