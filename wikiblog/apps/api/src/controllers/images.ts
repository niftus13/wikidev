import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthController } from './auth.ts';
import { HttpError } from '../services/errors.ts';
import { IMAGE_MAX_BYTES, declaredImageType } from '../services/images.ts';
import type { ImageService } from '../services/images.ts';
import { validId } from '../services/pages.ts';
import type { SessionRow } from '../repositories/auth.ts';

const IMAGE_CACHE = 'public, max-age=31536000, immutable';

export class ImageController {
  readonly service: ImageService;
  readonly auth: AuthController;
  constructor(service: ImageService, auth: AuthController) { this.service = service; this.auth = auth; }

  /** 본문을 읽기 전에 세션·CSRF와 선언 형식을 확인한다. 인증되지 않은 요청의 본문은 받지 않는다. */
  authorize = async (request: Request, response: Response, next: NextFunction) => {
    response.locals.session = await this.auth.mutationSession(request);
    if (!declaredImageType(request.get('content-type'))) throw new HttpError(415, 'Unsupported image type');
    next();
  };

  /** 허용 형식의 원본 바이트만 Buffer로 받는다. 상한을 넘으면 body-parser가 413을 낸다. */
  readonly body: RequestHandler = express.raw({ type: (request) => declaredImageType(request.headers['content-type']) !== null, limit: IMAGE_MAX_BYTES, inflate: false });

  upload = async (request: Request, response: Response) => {
    const current = response.locals.session as SessionRow;
    response.status(201).json(await this.service.upload(current.space_id, request.get('content-type'), request.body));
  };

  get = async (request: Request, response: Response) => {
    const id = request.params.imageId;
    if (!validId(id)) throw new HttpError(404, 'Image not found');
    const image = await this.service.find(id);
    response.set({
      'Content-Type': image.contentType,
      'Content-Length': String(image.data.length),
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': IMAGE_CACHE,
    });
    response.end(image.data);
  };
}
