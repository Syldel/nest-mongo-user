import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Subject, Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { ChangeStream } from 'mongodb';
import { User } from '../users/user.schema';
import { WebhookService } from '../webhook/webhook.service';

@Injectable()
export class MongoWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongoWatcherService.name);
  private readonly syncSubject = new Subject<void>();
  private syncSubscription: Subscription;
  private changeStream: ChangeStream<User>;

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly webhookService: WebhookService,
  ) {}

  onModuleInit() {
    this.syncSubscription = this.syncSubject
      .pipe(debounceTime(3000))
      .subscribe(() => {
        this.logger.log(
          '\uf021 Debounced sync triggered after database changes.',
        );
        this.webhookService.notifyAll();
      });

    this.startWatching();
  }

  private startWatching() {
    this.logger.log(
      '\uf002 Starting MongoDB Change Stream on "users" collection...',
    );

    this.changeStream = this.userModel.watch([], {
      fullDocument: 'updateLookup',
    });

    this.changeStream.on('change', (change) => {
      // On ignore les suppressions si on ne veut pas sync sur un delete,
      // ou on filtre sur certains types d'opérations : 'insert', 'update', 'replace'
      const validOps = ['insert', 'update', 'replace'];

      if (validOps.includes(change.operationType)) {
        this.logger.debug(`[DB Change] Operation: ${change.operationType}`);
        this.syncSubject.next();
      }
    });

    this.changeStream.on('error', (err) => {
      this.logger.error('❌ MongoDB Change Stream Error:', err);
      // Optionnel : Tenter une reconnexion après quelques secondes
      setTimeout(() => this.startWatching(), 10000);
    });
  }

  async onModuleDestroy() {
    this.logger.log('\uf1e6 Shutting down MongoDB Watcher...');

    if (this.syncSubscription) {
      this.syncSubscription.unsubscribe();
    }

    if (this.changeStream) {
      try {
        await this.changeStream.close();
        this.logger.log('✅ MongoDB Change Stream closed.');
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.error(`❌ Error closing Change Stream: ${msg}`);
      }
    }
  }
}
