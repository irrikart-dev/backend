/** Base class every storage backend must extend. */
export class Storage {
  async upload(key, data, options) {
    throw new Error('upload() must be implemented');
  }

  async download(key) {
    throw new Error('download() must be implemented');
  }

  async delete(key) {
    throw new Error('delete() must be implemented');
  }

  async exists(key) {
    throw new Error('exists() must be implemented');
  }
}
