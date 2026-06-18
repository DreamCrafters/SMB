import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function accessProfileApi(): Plugin {
  const handleAccessProfile: Connect.NextHandleFunction = (req, res) => {
    const method = (req as { method?: string }).method;

    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");

    if (method !== "GET") {
      res.statusCode = 405;
      res.end(
        JSON.stringify({
          error: {
            code: "access_denied",
            message: "Only GET is supported for access/profile.",
          },
        }),
      );
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({ profile: null }));
  };

  return {
    name: "smb-access-profile-api",
    configureServer(server) {
      server.middlewares.use("/api/access/profile", handleAccessProfile);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/access/profile", handleAccessProfile);
    },
  };
}

export default defineConfig({
  plugins: [accessProfileApi(), react()],
});
