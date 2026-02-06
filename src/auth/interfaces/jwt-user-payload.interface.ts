export interface JwtUserPayload {
  sub: string;
  wallet: string;
  username: string;
  iat?: number;
  exp?: number;
}
