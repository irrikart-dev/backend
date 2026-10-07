import { z } from 'zod';

// phone/email are mirrored from the verified Firebase token, never edited here
export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(1).max(100),
  }),
});
