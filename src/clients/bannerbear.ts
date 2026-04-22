import * as BannerbearPkg from "bannerbear";

type Image = BannerbearPkg.Image;
const BannerbearCtor = BannerbearPkg.Bannerbear;
type BannerbearInstance = InstanceType<typeof BannerbearCtor>;

export interface Modification {
  name: string;
  text?: string;
  image_url?: string;
  color?: string;
}

export class BannerbearClient {
  private readonly sdk: BannerbearInstance;

  constructor(apiKey: string) {
    this.sdk = new BannerbearCtor(apiKey);
  }

  /**
   * Renders an image synchronously (blocks until render completes). For v1 we
   * use synchronous mode so callers get back a URL directly.
   */
  async render(templateUid: string, modifications: Modification[]): Promise<Image> {
    return this.sdk.create_image(templateUid, { modifications }, true);
  }
}
