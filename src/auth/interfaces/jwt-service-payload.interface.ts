export interface JwtServicePayload {
  sub: string; // service id
  scope: string[];
  iat?: number;
  exp?: number;
}
