import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from './user.schema';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async create(data: Partial<User>): Promise<User> {
    const newUser = new this.userModel(data);
    return newUser.save();
  }

  async deleteByWallet(walletAddress: string) {
    return this.userModel.deleteOne({ walletAddress }).exec();
  }

  async findOneByWallet(walletAddress: string): Promise<User | null> {
    return this.userModel.findOne({ walletAddress }).select('-agentKey').exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).select('-password -agentKey').exec();
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
