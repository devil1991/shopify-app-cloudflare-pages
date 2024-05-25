// https://github.com/Shopify/shopify-app-js/blob/cc32cf6e92b3e8a6341cde53b9330eeb17b75457/packages/shopify-app-remix/src/server/adapters/node/index.ts
import {
  AppDistribution,
  DeliveryMethod,
  shopifyApp,
  LATEST_API_VERSION,
} from "@shopify/shopify-app-remix/server";
import { restResources } from "@shopify/shopify-api/rest/admin/2024-01";
import { KVSessionStorage } from "@shopify/shopify-app-session-storage-kv";
import { type AppLoadContext } from "@remix-run/cloudflare";
import { type PlatformProxy } from "wrangler";
import { type AppStoreApp } from "node_modules/@shopify/shopify-app-remix/dist/ts/server/types";

type Cloudflare = Omit<PlatformProxy<Env>, "dispose">;

declare module "@remix-run/cloudflare" {
  interface AppLoadContext {
    cloudflare: Cloudflare;
    shopify: AppStoreApp<any>;
  }
}

type GetLoadContext = (args: {
  request: Request;
  context: { cloudflare: Cloudflare }; // load context _before_ augmentation
}) => AppLoadContext;

export const getLoadContext: GetLoadContext = ({ context }) => {
  const env = context.cloudflare.env;
  const shopify = shopifyApp({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET || "",
    apiVersion: LATEST_API_VERSION,
    scopes: env.SCOPES?.split(","),
    appUrl: env.SHOPIFY_APP_URL || "",
    authPathPrefix: "/auth",
    sessionStorage: new KVSessionStorage(
      context.cloudflare.env.SHOPIFY_SESSIONS,
    ),
    distribution: AppDistribution.AppStore,
    restResources,
    // https://shopify.dev/docs/api/shopify-app-remix/v1/guide-webhooks
    // https://shopify.dev/docs/api/admin-graphql/2023-04/enums/WebhookSubscriptionTopic
    webhooks: {
      APP_UNINSTALLED: {
        deliveryMethod: DeliveryMethod.Http,
        callbackUrl: "/webhooks",
      },
    },
    hooks: {
      afterAuth: async ({ session }) => {
        shopify.registerWebhooks({ session });
      },
    },
    future: {
      v3_webhookAdminContext: true,
      v3_authenticatePublic: true,
      unstable_newEmbeddedAuthStrategy: true,
    },
    // ...(env.SHOP_CUSTOM_DOMAIN
    //   ? { customShopDomains: [env.SHOP_CUSTOM_DOMAIN] }
    //   : {}),
  });
  return {
    ...context,
    shopify,
  };
};
