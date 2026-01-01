import { IUser } from '../models/User';
import { IMT5Account } from '../models/MT5Account';
import { ISubscription } from '../models/Subscription';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      eaAccount?: IMT5Account;
      eaUser?: IUser;
      eaSubscription?: ISubscription;
    }
  }
}

// This file must be treated as a module
export {};

