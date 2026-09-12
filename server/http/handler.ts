import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route so rejections reach the shared error handler.
 * Express 4 does not do this itself; use this instead of try/catch per route.
 */
export function handle(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
