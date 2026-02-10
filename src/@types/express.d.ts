import { ActiveUser } from '../auth/interfaces/active-user.interface';
import { ActiveService } from '../auth/interfaces/active-service.interface';

declare module 'express' {
  interface Request {
    user?: ActiveUser;
    service?: ActiveService;
  }
}
