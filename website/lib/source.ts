import { docs } from "@/.source";
import { resolveFiles } from "fumadocs-mdx";
import { loader } from "fumadocs-core/source";

export const source = loader({
  baseUrl: "/docs",
  source: {
    files: resolveFiles({ docs: docs.docs, meta: docs.meta }),
  },
});
