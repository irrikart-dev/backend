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
      return next(new BadRequestError('Validation failed', result.error.flatten()));
    }

    req.validated = result.data;
    next();
  };
}
