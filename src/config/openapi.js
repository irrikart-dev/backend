import swaggerJsdoc from 'swagger-jsdoc';
import env from './env.js';

// spec is generated from @openapi JSDoc blocks on route files (see auth.routes.js for the pattern) —
// annotate a route once there and it shows up here and in /docs automatically
export const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'IRRIKART API',
      version: '1.0.0',
      description: 'IrriKart backend — auth, catalog, orders, payments, shipping, and admin.',
    },
    servers: [{ url: `http://localhost:${env.PORT}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
  apis: ['./src/modules/**/*.routes.js'],
});
