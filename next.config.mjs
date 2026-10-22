/** Static export: the whole site is plain files, so it can sit on any CDN. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export default {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
