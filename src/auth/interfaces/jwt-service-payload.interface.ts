export interface JwtServicePayload {
  service: string;
  scope: string[];
  iat?: number;
  exp?: number;
}
