const STOCK_SELECT = "id,name,stock,is_active";

export class StockRepository {
  #queryFn;

  constructor(options = {}) {
    this.#queryFn = options.queryFn;
    if (!this.#queryFn) {
      throw new Error("StockRepository: queryFn is required");
    }
  }

  async findAll() {
    try {
      const rows = await this.#queryFn("products", {
        select: STOCK_SELECT,
        eq: { is_active: "true" },
      });
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }
}
