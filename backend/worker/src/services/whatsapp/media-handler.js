export class MediaHandler {
  constructor(options = {}) {
    this.#channel = options.channel;
    this.#storageUrl = options.storageUrl || null;
    this.#storageKey = options.storageKey || null;
  }

  #channel;
  #storageUrl;
  #storageKey;

  async downloadMedia(mediaId) {
    if (!this.#channel) throw new Error('MediaHandler: WhatsApp channel not available');
    return this.#channel.downloadMedia(mediaId);
  }

  async getMediaUrl(mediaId) {
    if (!this.#channel) throw new Error('MediaHandler: WhatsApp channel not available');
    return this.#channel.getMediaUrl(mediaId);
  }

  async storeReference(mediaId) {
    try {
      const mediaInfo = await this.getMediaUrl(mediaId);
      return {
        mediaId: mediaInfo.mediaId,
        url: mediaInfo.url,
        mimeType: mediaInfo.mimeType,
        fileSize: mediaInfo.fileSize,
        fileName: mediaInfo.fileName,
        storedAt: new Date().toISOString(),
      };
    } catch {
      return {
        mediaId,
        url: null,
        mimeType: null,
        fileSize: null,
        fileName: null,
        storedAt: new Date().toISOString(),
        error: 'Could not fetch media info',
      };
    }
  }

  getMediaType(mimeType) {
    if (!mimeType) return 'unknown';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType === 'application/pdf') return 'document';
    if (mimeType.includes('document')) return 'document';
    return 'other';
  }

  isSupported(mediaId, mimeType) {
    const type = this.getMediaType(mimeType);
    return ['image', 'video', 'audio', 'document'].includes(type);
  }
}
