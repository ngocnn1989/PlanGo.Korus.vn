import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const localeTagSchema = z.string().trim().regex(
  /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/,
  'Use a valid locale tag such as en or vi-VN.'
);

const contentStatusSchema = z.enum(['draft', 'published']);
const approvalTimestampSchema = z.string().trim().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?[+-]\d{2}:\d{2}$/,
  'Use an ISO-8601 approval timestamp with an explicit offset.',
).refine((value) => !Number.isNaN(Date.parse(value)), 'Use a valid approval timestamp.');
const approvalSchema = z.object({
  approvedAt: approvalTimestampSchema.optional(),
  reviewer: z.string().trim().min(1).optional(),
  status: z.enum(['unapproved', 'approved']).default('unapproved'),
}).default({ status: 'unapproved' });

const requiredContentFields = {
  approval: approvalSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  lang: localeTagSchema,
  source: z.literal('trusted_local_source_only').default('trusted_local_source_only'),
  status: contentStatusSchema,
};

type ContentApproval = {
  approvedAt?: string;
  reviewer?: string;
  status: 'approved' | 'unapproved';
};

type PublishedContentData = {
  approval: ContentApproval;
  status: 'draft' | 'published';
  title: string;
  description: string;
  pubDate?: unknown;
  publishedAt?: unknown;
};

const placeholderText = new Set([
  'untitled',
  'new post',
  'banner title',
  'ch\u01b0a c\u1eadp nh\u1eadt ti\u00eau \u0111\u1ec1',
  'ch\u01b0a c\u1eadp nh\u1eadt m\u00f4 t\u1ea3',
  'b\u00e0i vi\u1ebft m\u1edbi',
  '\u0111ang c\u1eadp nh\u1eadt n\u1ed9i dung...',
  'case study \u1ee9ng d\u1ee5ng',
  'chi ti\u1ebft d\u1ef1 \u00e1n \u0111ang \u0111\u01b0\u1ee3c c\u1eadp nh\u1eadt.',
]);

const addPublishedContentIssues = (
  data: PublishedContentData,
  addIssue: (path: string[], message: string) => void,
  publicationField?: 'pubDate' | 'publishedAt',
) => {
  if (data.status !== 'published') {
    return;
  }

  if (data.approval.status !== 'approved' || !data.approval.reviewer || !data.approval.approvedAt) {
    addIssue(['approval'], 'Published content requires an explicit approved reviewer record and ISO-offset approval time.');
  }

  if (placeholderText.has(data.title.trim().toLowerCase())) {
    addIssue(['title'], 'Published content cannot use a placeholder title.');
  }

  if (placeholderText.has(data.description.trim().toLowerCase())) {
    addIssue(['description'], 'Published content cannot use a placeholder description.');
  }

  if (publicationField && !data[publicationField]) {
    addIssue([publicationField], 'Published content requires a publication date.');
  }
};

const productsCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/products" }),
  schema: ({ image }) => z.object({
    ...requiredContentFields,
    focus_keyword: z.string().optional(),
    cover_image: image().optional(),
    og_image: image().optional(),
    date: z.date().or(z.string()).optional(),
    pubDate: z.date().or(z.string()).optional(),
    category: z.string().optional(),
    is_featured: z.boolean().default(false),
    specifications: z.array(z.object({
      key: z.string(),
      value: z.string()
    })).default([]),
  }).superRefine((data, ctx) => {
    addPublishedContentIssues(data, (path, message) => {
      ctx.addIssue({ code: 'custom', path, message });
    }, 'pubDate');
  })
});

const blogCollection = defineCollection({
  loader: glob({ pattern: "**/index.md", base: "./src/content/blog" }),
  schema: ({ image }) => z.object({
    ...requiredContentFields,
    author: z.string().optional(),
    pubDate: approvalTimestampSchema.optional(),
    thumbnail: image().optional(),
  }).superRefine((data, ctx) => {
    addPublishedContentIssues(data, (path, message) => {
      ctx.addIssue({ code: 'custom', path, message });
    }, 'pubDate');
    if (data.status === 'published' && data.pubDate !== data.approval.approvedAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['pubDate'],
        message: 'Published blog pubDate must equal the Auditor-derived approval timestamp.',
      });
    }
  })
});

const caseStudiesCollection = defineCollection({
  loader: glob({ pattern: "**/*.mdx", base: "./src/content/case-studies" }),
  schema: ({ image }) => z.object({
    ...requiredContentFields,
    cover_image: image().optional(),
    client_industry: z.string().optional(),
    roi_metrics: z.string().optional(),
    publishedAt: z.date().or(z.string()).optional()
  }).superRefine((data, ctx) => {
    addPublishedContentIssues(data, (path, message) => {
      ctx.addIssue({ code: 'custom', path, message });
    }, 'publishedAt');
  })
});

const bannersCollection = defineCollection({
  loader: glob({ pattern: "**/*.json", base: "./src/content/banners" }),
  schema: ({ image }) => z.object({
    ...requiredContentFields,
    route: z.string().trim().min(1),
    subtitle: z.string().optional(),
    bg_image: image(), // Riêng ảnh nền của Banner là bắt buộc vì nó là cấu trúc tĩnh
  }).superRefine((data, ctx) => {
    addPublishedContentIssues(data, (path, message) => {
      ctx.addIssue({ code: 'custom', path, message });
    });
  })
});

export const collections = {
  'blog': blogCollection,
  'products': productsCollection,
  'case-studies': caseStudiesCollection,
  'banners': bannersCollection,
};

