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

export interface CreateBookRequest {
  slug: string;
  title: string;
  description: string;
}

export interface UpdateBookRequest extends CreateBookRequest {}
