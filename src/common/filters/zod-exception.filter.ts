import { Catch, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ZodValidationException } from 'nestjs-zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ZodError, ZodIssue } from 'zod';

interface FieldError {
  field: string;
  message: string;
  code: string;
}

@Catch(ZodValidationException)
export class ZodExceptionFilter implements ExceptionFilter {
  catch(exception: ZodValidationException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const zodError = exception.getZodError() as ZodError;
    const errors: FieldError[] = zodError.issues.map((issue: ZodIssue) => ({
      field: issue.path.join('.') || '<root>',
      message: issue.message,
      code: issue.code,
    }));

    void response.status(HttpStatus.BAD_REQUEST).send({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Validação falhou',
      errors,
      path: request.url,
      timestamp: new Date().toISOString(),
      requestId: request.id,
    });
  }
}
