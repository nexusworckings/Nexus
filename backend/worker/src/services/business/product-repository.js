const PRODUCT_SELECT = "id,name,brand,category,price,currency,stock,is_active";

export class ProductRepository {
  #queryFn;

  constructor(options = {}) {
    this.#queryFn = options.queryFn;
    if (!this.#queryFn) {
      throw new Error("ProductRepository: queryFn is required");
    }
  }

  async findAll(options = {}) {
    const rows = await this.#queryFn("products", {
      select: PRODUCT_SELECT,
      eq: { is_active: "true" },
      ...options,
    });
    return Array.isArray(rows) ? rows : [];
  }
}
