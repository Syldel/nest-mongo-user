import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';

export type SafeUser = Omit<User, 'password' | 'agentKey'>;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(data: Partial<User>): Promise<SafeUser> {
    const newUser = new this.userModel(data);
    const user = await newUser.save();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _p, agentKey: _ak, ...safeUser } = user.toObject();
    return safeUser as unknown as SafeUser;
  }

  async deleteByWallet(walletAddress: string) {
    return this.userModel.deleteOne({ walletAddress }).exec();
  }

  async findOneByWallet(walletAddress: string): Promise<User | null> {
    return this.userModel.findOne({ walletAddress }).select('-agentKey').exec();
  }

  async findOneByWalletForAuth(walletAddress: string): Promise<User | null> {
    return this.userModel.findOne({ walletAddress }).select('+password').exec();
  }

  async findOneByUsername(username: string): Promise<User | null> {
    return this.userModel.findOne({ username }).select('-agentKey').exec();
  }

  async findOneByUsernameForAuth(username: string): Promise<User | null> {
    return this.userModel.findOne({ username }).select('+password').exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('-password -agentKey').exec();
  }

  async findByIdForAuth(userId: string): Promise<User | null> {
    return this.userModel.findById(userId).select('+password').exec();
  }

  async findAll() {
    return this.userModel.find().select('-password -agentKey').exec();
  }

  async findByIdWithAgentKey(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('agentKey').exec();
  }

  async updateStrategy(userId: string, strategyData: Record<string, unknown>) {
    if (JSON.stringify(strategyData).length > 10000) {
      throw new Error('Settings object is too large');
    }

    // We use { new: true } to return the updated document
    return this.userModel
      .findByIdAndUpdate(
        userId,
        { $set: { tradingSettings: strategyData } },
        { new: true },
      )
      .exec();
  }
}
