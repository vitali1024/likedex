import Dexie, { type DexieOptions, type Table } from 'dexie';
import type { ControlState, MirroredVideo, RemoteOwner, SyncMetadata } from '../domain/contracts';

export const DATABASE_NAME = 'likedex';
export const STORAGE_SCHEMA_VERSION = 1;
export const SINGLETON_KEY = 'singleton';

// No side-effectful module singleton. The future background composition owns it.
export class LikedexDatabase extends Dexie {
  readonly control: Table<ControlState, string>;
  readonly owner: Table<RemoteOwner, string>;
  readonly videos: Table<MirroredVideo, string>;
  readonly sync: Table<SyncMetadata, string>;

  constructor(name = DATABASE_NAME, options?: DexieOptions) {
    super(name, options);
    this.version(STORAGE_SCHEMA_VERSION).stores({
      control: '',
      owner: '',
      videos: 'videoId',
      sync: '',
    });
    this.control = this.table('control');
    this.owner = this.table('owner');
    this.videos = this.table('videos');
    this.sync = this.table('sync');
  }
}
