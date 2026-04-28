import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date().optional(),
    draft: z.boolean().optional(),
  }),
});

const capacitors = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/capacitors" }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
  }),
});

export const collections = { blog, capacitors };
