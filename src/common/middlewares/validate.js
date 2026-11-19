import { BadRequestError } from '../errors/AppError.js';

// generic zod-schema validator, reused by every module's *.validation.js
// usage: router.post('/', validate(createSchema), controller.create)
export function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      // Same { formErrors, fieldErrors } shape as zod's flatten(), but keyed by the
      // field inside body/query/params — flatten() only groups by the first path
      // segment, so every field error came back under "body".
      const formErrors = [];
      const fieldErrors = {};
      for (const { path, message } of result.error.issues) {
        const field = path.slice(1).join('.');
        if (field) (fieldErrors[field] ??= []).push(message);
        else formErrors.push(message);
      }
      return next(new BadRequestError('Validation failed', { formErrors, fieldErrors }));
    }

    req.validated = result.data;
    next();
  };
}
