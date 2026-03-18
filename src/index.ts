import { Hono } from "hono";
import { docsApp } from "./routes/docs";

const app = new Hono();

// Root redirect
app.get("/", (c) => c.redirect("/v1/docs"));

// Mount docs
app.route("/v1/docs", docsApp);

// Export for testing
export { app };

// Start server
const port = parseInt(process.env.PORT || "3000", 10);

export default {
  port,
  fetch: app.fetch,
};
