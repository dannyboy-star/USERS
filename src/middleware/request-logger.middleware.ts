import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req;
    const startTime = Date.now();
    const requestId = req.headers['x-request-id'] || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Add request ID to request object for use in controllers/services
    req['requestId'] = requestId;

    // Log request
    this.logger.log(`${method} ${originalUrl} - ${ip} [${requestId}]`);

    // Log response when finished
    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;
      const logLevel = statusCode >= 400 ? 'error' : 'log';
      this.logger[logLevel](
        `${method} ${originalUrl} ${statusCode} - ${duration}ms [${requestId}]`,
      );
    });

    // Set request ID in response header
    res.setHeader('X-Request-ID', requestId);

    next();
  }
}

