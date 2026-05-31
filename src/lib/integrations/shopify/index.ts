// Shopify — source of course products, orders, and educator profiles.
//
// In production this feeds the live DataSource adapter. The interface is the
// extension point; the live client (Admin/Storefront API) is deferred. The
// stub throws so a misconfigured live adapter fails loudly rather than silently
// serving empty data.

import { shopifyConfig } from "../config";
import { IntegrationNotConfiguredError } from "../types";

export interface ShopifyProduct {
  id: string;
  handle: string;
  title: string;
  status: "active" | "draft" | "archived";
  tags: string[];
}

export interface ShopifyOrderLine {
  orderNumber: string;
  orderDate: string;
  customerName: string;
  email: string;
  phone: string;
  amount: number;
  grossAmount: number;
  discountCode: string | null;
}

export interface ShopifyEducator {
  id: string;
  name: string;
  role: string;
  bio: string;
}

export interface ShopifyClient {
  listCourseProducts(): Promise<ShopifyProduct[]>;
  getOrdersForProduct(handle: string): Promise<ShopifyOrderLine[]>;
  listEducators(): Promise<ShopifyEducator[]>;
}

class StubShopifyClient implements ShopifyClient {
  async listCourseProducts(): Promise<ShopifyProduct[]> {
    throw new IntegrationNotConfiguredError("shopify");
  }
  async getOrdersForProduct(): Promise<ShopifyOrderLine[]> {
    throw new IntegrationNotConfiguredError("shopify");
  }
  async listEducators(): Promise<ShopifyEducator[]> {
    throw new IntegrationNotConfiguredError("shopify");
  }
}

let instance: ShopifyClient | null = null;

export function getShopifyClient(): ShopifyClient {
  if (!instance) {
    instance = new StubShopifyClient();
  }
  return instance;
}

export function setShopifyClient(client: ShopifyClient): void {
  instance = client;
}

export { shopifyConfig };
