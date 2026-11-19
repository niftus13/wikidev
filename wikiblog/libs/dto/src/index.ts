import type { Identified } from '@wikiblog/types';

export interface UserDto extends Identified {
  email: string;
}

export interface SpaceDto extends Identified {
  handle: string;
  description: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  handle: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateSpaceRequest {
  description: string;
}

export interface LoginResponse {
  csrfToken: string;
}

export interface SessionResponse extends LoginResponse {
  user: UserDto;
  space: SpaceDto;
}

export interface BookDto extends Identified {
  spaceId: string;
  slug: string;
  title: string;
  description: string;
}

export interface PublicBookDto extends BookDto {
  handle: string;
}

export interface SearchResultDto {
  type: 'book' | 'page';
  id: string;
  title: string;
  bookId: string;
  bookSlug: string;
  bookTitle: string;
  handle: string;
  excerpt: string;
}

export interface CreateBookRequest {
  slug: string;
  title: string;
  description: string;
}

export interface UpdateBookRequest extends CreateBookRequest {}

export interface PageDraftDto extends Identified {
  bookId: string;
  title: string;
  body: string;
  revision: number;
}

export interface PageVersionDto extends Identified {
  pageId: string;
  revision: number;
  title: string;
  body: string;
  authorId: string;
  createdAt: string;
}

export interface CreatePageRequest {
  title: string;
  body: string;
}

export interface UpdatePageRequest extends CreatePageRequest {
  revision: number;
}

export interface RestorePageRequest {
  versionId: string;
  revision: number;
}

export interface PublishPageRequest {
  revision: number;
}

export interface PublishedPageDto extends Identified {
  bookId: string;
  title: string;
  body: string;
  revision: number;
}

export interface TocEntryDto extends Identified {
  parentId: string | null;
  title: string;
  position: number;
}

export interface OwnedTocEntryDto extends TocEntryDto {
  published: boolean;
}

export interface OwnedTocDto {
  revision: number;
  pages: OwnedTocEntryDto[];
}

export interface MovePageRequest {
  revision: number;
  pageId: string;
  parentId: string | null;
  position: number;
}

export interface CategoryDto extends Identified {
  name: string;
  parentId: string | null;
  scope: 'platform' | 'space' | 'book';
}

export interface PublicCategoryDto extends CategoryDto {
  scopeLabel: string | null;
}

export interface CategoryInput {
  name: string;
  parentId: string | null;
}

export interface TagDto extends Identified {
  name: string;
}

export interface PublicClassificationDto {
  categories: CategoryDto[];
  tags: TagDto[];
}

export interface BookClassificationInput {
  platformCategoryId: string | null;
  spaceCategoryId: string | null;
  tagIds: string[];
}

export interface PageClassificationInput {
  revision: number;
  categoryId: string | null;
  tagIds: string[];
}

export interface BookClassificationDto extends BookClassificationInput {}

export interface PageClassificationDto {
  revision: number;
  categoryId: string | null;
  tagIds: string[];
}

export interface UnpublishPageResponse {
  /** 요청한 페이지 ID */
  id: string;
  /** 이번 요청으로 발행 취소된 페이지 ID(요청 페이지와 자손). 이미 미발행이면 빈 배열이다. */
  unpublishedPageIds: string[];
}

export type ImageContentType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export interface ImageUploadResponse extends Identified {
  /** 본문에 넣을 같은 출처 경로 `/api/v1/images/{id}` */
  url: string;
  contentType: ImageContentType;
  byteSize: number;
}
