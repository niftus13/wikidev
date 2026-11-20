import type { Identified } from '@wikiblog/types';

export interface UserEntity extends Identified {
  email: string;
  password_hash: string;
  status: 'active' | 'disabled';
  created_at: Date;
}

export interface SpaceEntity extends Identified {
  owner_id: string;
  handle: string;
  description: string;
  created_at: Date;
}

export interface SessionEntity {
  token_hash: string;
  user_id: string;
  csrf_token: string;
  expires_at: Date;
  created_at: Date;
}

export interface BookEntity extends Identified {
  space_id: string;
  slug: string;
  title: string;
  description: string;
  toc_revision: number;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PageEntity extends Identified {
  book_id: string;
  title: string;
  body: string;
  revision: number;
  parent_id: string | null;
  sort_order: number;
  published_version_id: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PageVersionEntity extends Identified {
  page_id: string;
  revision: number;
  title: string;
  body: string;
  author_id: string;
  created_at: Date;
}

export interface CategoryEntity extends Identified {
  scope: 'platform' | 'space' | 'book';
  scope_id: string | null;
  parent_id: string | null;
  name: string;
  created_at: Date;
}

export interface TagEntity extends Identified {
  space_id: string;
  name: string;
  normalized_name: string;
}

export interface ImageEntity extends Identified {
  space_id: string;
  content_type: string;
  byte_size: number;
  sha256: string;
  data: Uint8Array;
  created_at: Date;
}
