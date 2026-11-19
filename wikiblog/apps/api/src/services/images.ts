import { createHash } from 'node:crypto';
import type { ImageContentType, ImageUploadResponse } from '@wikiblog/dto';
import type { ImageRepository } from '../repositories/images.ts';
import { HttpError } from './errors.ts';

export const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_SPACE_QUOTA_BYTES = 50 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES: readonly ImageContentType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function startsWith(data: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return data.length >= offset + signature.length && signature.every((byte, index) => data[offset + index] === byte);
}
const ascii = (value: string) => Array.from(value, (char) => char.charCodeAt(0));

/** 파일 시그니처(매직 바이트)로 형식을 판정한다. 허용 4종이 아니면 null(SVG·HTML 등 텍스트 포함). */
export function detectImageType(data: Uint8Array): ImageContentType | null {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(data, ascii('GIF87a')) || startsWith(data, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(data, ascii('RIFF')) && startsWith(data, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}

/** 선언한 Content-Type을 매개변수 없이 소문자로 정규화한다. 허용 4종이 아니면 null. */
export function declaredImageType(value: string | undefined): ImageContentType | null {
  const type = value?.split(';')[0]?.trim().toLowerCase();
  return IMAGE_CONTENT_TYPES.find((allowed) => allowed === type) ?? null;
}

export function imageUrl(id: string): string {
  return `/api/v1/images/${id}`;
}

export class ImageService {
  readonly repository: ImageRepository;
  constructor(repository: ImageRepository) { this.repository = repository; }

  async upload(spaceId: string, declared: string | undefined, body: unknown): Promise<ImageUploadResponse> {
    const contentType = declaredImageType(declared);
    if (!contentType) throw new HttpError(415, 'Unsupported image type');
    if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'Image body is empty');
    if (body.length > IMAGE_MAX_BYTES) throw new HttpError(413, 'Request body too large');
    if (detectImageType(body) !== contentType) throw new HttpError(400, 'Image content does not match Content-Type');
    const sha256 = createHash('sha256').update(body).digest('hex');
    const stored = await this.repository.create(spaceId, contentType, body, sha256, IMAGE_SPACE_QUOTA_BYTES);
    return { id: stored.id, url: imageUrl(stored.id), contentType, byteSize: stored.byte_size };
  }

  async find(id: string) {
    const image = await this.repository.find(id);
    return { contentType: image.content_type, data: Buffer.from(image.data) };
  }
}
