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
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}
